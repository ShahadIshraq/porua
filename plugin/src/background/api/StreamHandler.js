/**
 * StreamHandler - Handles streaming TTS synthesis via long-lived ports
 *
 * Converts multipart streaming responses to transferable format
 * and sends chunks to client via port messaging.
 *
 * Includes transparent caching layer:
 * - Cache hit: Returns entire audio as single chunk
 * - Cache miss: Streams from server and stores in cache
 */

import { validateSynthesizePayload, ERROR_TYPES } from '../messages/protocol.js';
import { TTSService } from '../../shared/services/TTSService.js';
import { StreamParser } from '../../content/audio/StreamParser.js';
import { validateMultipartResponse, extractMultipartBoundary } from '../../shared/api/ResponseHandler.js';
import { CacheService } from '../cache/CacheService.js';
import { SettingsStore } from '../../shared/storage/SettingsStore.js';

// Lazy-initialized cache service
let cacheService = null;

async function getCacheService() {
  if (!cacheService) {
    try {
      cacheService = await CacheService.getInstance();
    } catch (error) {
      console.error('[StreamHandler] Failed to initialize cache:', error);
      // Continue without caching
    }
  }
  return cacheService;
}

/**
 * Handle streaming TTS synthesis request via port
 * @param {object} message - {type: string, payload: {text, voice?, speed?}}
 * @param {chrome.runtime.Port} port - Port for sending stream chunks
 */
export async function handleStreamRequest(message, port) {
  const { payload } = message;

  try {
    // Validate payload
    validateSynthesizePayload(payload);

    // Get settings to apply defaults for voice and speed
    const settings = await SettingsStore.get();

    const text = payload.text;
    const voice = payload.voice || settings.selectedVoiceId;
    const speed = payload.speed !== undefined ? payload.speed : (settings.speed || 1.0);

    // ─────────────────────────────────────────────────────────
    // CACHE LAYER: Check cache first
    // ─────────────────────────────────────────────────────────
    const cache = await getCacheService();

    if (cache) {
      const cached = await cache.get(text, voice, speed);

      if (cached) {
        // ═════════════════════════════════════════════════════
        // CACHE HIT: Return entire audio as single chunk
        // ═════════════════════════════════════════════════════
        console.log(`[Cache] HIT - ${voice} ${speed} ${text.substring(0, 50)}...`);

        // Combine all audio chunks into one blob
        const combinedAudioBlob = new Blob(cached.audioBlobs, {
          type: cached.audioBlobs[0]?.type || 'audio/wav',
        });

        // Aggregate metadata (single chunk)
        const aggregatedMetadata = {
          chunk_index: 0,
          phrases: cached.metadataArray.flatMap((m) => m.phrases),
          start_offset_ms: 0,
          duration_ms: cached.metadataArray.reduce((sum, m) => sum + m.duration_ms, 0),
        };

        // Send as single-chunk stream
        port.postMessage({
          type: 'STREAM_START',
          data: {
            chunkCount: 1,
            contentType: combinedAudioBlob.type,
          },
        });

        // Send aggregated metadata
        port.postMessage({
          type: 'STREAM_METADATA',
          data: {
            metadata: aggregatedMetadata,
          },
        });

        // Convert Blob to Array for transfer
        const arrayBuffer = await combinedAudioBlob.arrayBuffer();
        const audioArray = Array.from(new Uint8Array(arrayBuffer));

        port.postMessage({
          type: 'STREAM_AUDIO',
          data: {
            audioData: audioArray,
            contentType: combinedAudioBlob.type,
          },
        });

        // Complete
        port.postMessage({
          type: 'STREAM_COMPLETE',
        });

        return;
      }

      // Cache miss - continue to server request
      console.log(`[Cache] MISS - ${voice} ${speed} ${text.substring(0, 50)}...`);
    }

    // ═════════════════════════════════════════════════════
    // CACHE MISS: Fetch from TTS server
    // ═════════════════════════════════════════════════════

    // Create TTS service instance
    const ttsService = new TTSService();

    // Initiate streaming synthesis
    const response = await ttsService.synthesizeStream(text, {
      voice,
      speed,
    });

    // Validate response format
    validateMultipartResponse(response);

    // Extract boundary from headers
    const boundary = extractMultipartBoundary(response);

    // Get stream reader
    const reader = response.body.getReader();

    // Parse multipart stream
    const parts = await StreamParser.parseMultipartStream(reader, boundary);

    // Sort chunks by chunk_index (server sends out of order for parallel processing)
    const sortedParts = sortChunksByIndex(parts);

    // Separate audio and metadata parts
    const audioBlobs = [];
    const metadataArray = [];

    for (const part of sortedParts) {
      if (part.type === 'metadata') {
        metadataArray.push(part.metadata);
      } else if (part.type === 'audio') {
        const audioBlob = new Blob([part.audioData], { type: 'audio/wav' });
        audioBlobs.push(audioBlob);
      }
    }

    // Concatenate all audio chunks into single blob
    const combinedAudioBlob = new Blob(audioBlobs, { type: 'audio/wav' });

    // Build combined metadata with all phrases
    const combinedMetadata = {
      chunk_index: 0,
      phrases: metadataArray.flatMap((m) => m.phrases),
      start_offset_ms: 0,
      duration_ms: metadataArray.reduce((sum, m) => sum + m.duration_ms, 0),
    };

    // Send as single-chunk stream
    port.postMessage({
      type: 'STREAM_START',
      data: {
        chunkCount: 1,
        contentType: combinedAudioBlob.type,
      },
    });

    // Send combined metadata
    port.postMessage({
      type: 'STREAM_METADATA',
      data: {
        metadata: combinedMetadata,
      },
    });

    // Convert Blob to Array for transfer
    const arrayBuffer = await combinedAudioBlob.arrayBuffer();
    const audioArray = Array.from(new Uint8Array(arrayBuffer));

    port.postMessage({
      type: 'STREAM_AUDIO',
      data: {
        audioData: audioArray,
        contentType: combinedAudioBlob.type,
      },
    });

    // Send stream complete notification
    port.postMessage({
      type: 'STREAM_COMPLETE',
    });

    // ─────────────────────────────────────────────────────────
    // STORE IN CACHE (fire-and-forget, don't block)
    // ─────────────────────────────────────────────────────────
    if (cache && combinedAudioBlob && combinedMetadata) {
      // Build phrase timeline from combined metadata
      const phraseTimeline = buildPhraseTimeline([combinedMetadata]);

      cache
        .set(text, voice, speed, {
          audioBlobs: [combinedAudioBlob],
          metadataArray: [combinedMetadata],
          phraseTimeline,
        })
        .catch((err) => {
          console.warn('[Cache] Failed to store:', err);
          // Don't propagate error - caching failure is non-critical
        });
    }

    // Note: Client will disconnect the port after processing the complete message
    // Don't disconnect here to avoid race condition
  } catch (error) {
    // Determine error type
    let errorType = ERROR_TYPES.STREAM_ERROR;

    if (error.name === 'AbortError') {
      // Client aborted the request
      port.disconnect();
      return;
    }

    if (error.message.includes('fetch')) {
      errorType = ERROR_TYPES.NETWORK_ERROR;
    } else if (error.status) {
      errorType = ERROR_TYPES.API_ERROR;
    }

    // Send error to client
    port.postMessage({
      type: 'STREAM_ERROR',
      error: {
        type: errorType,
        message: error.message,
        status: error.status,
      },
    });

    // Close port on error
    port.disconnect();
  }
}

/**
 * Sort multipart stream chunks by chunk_index
 * Server sends chunks as they complete (out of order for parallel processing)
 * We must reorder them before concatenating for playback
 *
 * @param {Array} parts - Array of {type: 'audio'|'metadata', ...}
 * @returns {Array} Sorted parts in correct playback order
 */
function sortChunksByIndex(parts) {
  // Pair metadata with audio chunks
  const chunks = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === 'metadata') {
      const metadata = parts[i];
      const audio = parts[i + 1]; // Audio follows metadata

      chunks.push({
        chunkIndex: metadata.metadata.chunk_index,
        metadata,
        audio,
      });

      i++; // Skip audio part (already processed)
    }
  }

  // Sort by chunk_index
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  // Fix phrase timings - recalculate offsets based on sorted order
  let cumulativeOffset = 0;
  chunks.forEach((chunk) => {
    const metadata = chunk.metadata.metadata;

    // Update start_offset_ms
    metadata.start_offset_ms = cumulativeOffset;

    // Fix phrase timings to be relative to start of combined audio
    metadata.phrases.forEach((phrase) => {
      phrase.start_ms = cumulativeOffset + (phrase.start_ms - metadata.start_offset_ms);
    });

    cumulativeOffset += metadata.duration_ms;
  });

  // Flatten back to parts array
  return chunks.flatMap((c) => [c.metadata, c.audio]);
}

/**
 * Build phrase timeline from metadata chunks
 * @param {Array} metadataArray - Array of metadata objects
 * @returns {Array} Phrase timeline
 */
function buildPhraseTimeline(metadataArray) {
  const timeline = [];
  let cumulativeTime = 0;

  metadataArray.forEach((metadata) => {
    metadata.phrases.forEach((phrase) => {
      timeline.push({
        text: phrase.text,
        startTime: cumulativeTime + phrase.start_ms,
        endTime: cumulativeTime + phrase.start_ms + phrase.duration_ms,
        chunkIndex: timeline.length,
      });
    });
    cumulativeTime += metadata.duration_ms;
  });

  return timeline;
}
