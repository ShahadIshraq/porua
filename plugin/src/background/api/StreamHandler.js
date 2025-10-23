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

    // Get content type for audio blobs
    const contentType = response.headers.get('Content-Type') || 'multipart/mixed';

    // Get stream reader
    const reader = response.body.getReader();

    // Parse multipart stream
    const parts = await StreamParser.parseMultipartStream(reader, boundary);

    // Separate audio and metadata parts for caching
    const audioBlobs = [];
    const metadataArray = [];

    // Send stream start notification
    port.postMessage({
      type: 'STREAM_START',
      data: {
        chunkCount: parts.filter((p) => p.type === 'audio').length,
        contentType,
      },
    });

    // Process and send each part
    for (const part of parts) {
      if (part.type === 'metadata') {
        metadataArray.push(part.metadata);

        // Send metadata part
        port.postMessage({
          type: 'STREAM_METADATA',
          data: {
            metadata: part.metadata,
          },
        });
      } else if (part.type === 'audio') {
        // Store as blob for caching
        const audioBlob = new Blob([part.audioData], { type: 'audio/wav' });
        audioBlobs.push(audioBlob);

        // Convert Uint8Array to regular Array for transfer
        const audioArray = Array.from(part.audioData);

        // Send audio part with content type
        port.postMessage({
          type: 'STREAM_AUDIO',
          data: {
            audioData: audioArray,
            contentType: 'audio/wav',
          },
        });
      }
    }

    // Send stream complete notification
    port.postMessage({
      type: 'STREAM_COMPLETE',
    });

    // ─────────────────────────────────────────────────────────
    // STORE IN CACHE (fire-and-forget, don't block)
    // ─────────────────────────────────────────────────────────
    if (cache && audioBlobs.length > 0 && metadataArray.length > 0) {
      // Build phrase timeline
      const phraseTimeline = buildPhraseTimeline(metadataArray);

      cache
        .set(text, voice, speed, {
          audioBlobs,
          metadataArray,
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
