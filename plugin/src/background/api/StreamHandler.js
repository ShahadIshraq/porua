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

        // Cache stores single combined blob and metadata
        const combinedAudioBlob = cached.audioBlobs[0];
        const combinedMetadata = cached.metadataArray[0];

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

        // Complete
        port.postMessage({
          type: 'STREAM_COMPLETE',
        });

        return;
      }

      // Cache miss - continue to server request
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
    const audioDataChunks = [];
    const metadataArray = [];

    for (const part of sortedParts) {
      if (part.type === 'metadata') {
        metadataArray.push(part.metadata);
      } else if (part.type === 'audio') {
        audioDataChunks.push(part.audioData);
      }
    }

    // Find actual data chunk position in each WAV file
    function findDataChunkOffset(wavBytes) {
      // Check if this looks like a real WAV file
      if (wavBytes.length < 44) {
        return 0; // Too small, treat as raw audio
      }

      try {
        // WAV format: RIFF header (12 bytes) + fmt chunk + data chunk
        const view = new DataView(wavBytes.buffer, wavBytes.byteOffset);

        let offset = 12; // Skip RIFF header

        while (offset < wavBytes.length - 8) {
          const chunkId = String.fromCharCode(
            wavBytes[offset], wavBytes[offset+1], wavBytes[offset+2], wavBytes[offset+3]
          );
          const chunkSize = view.getUint32(offset + 4, true);

          if (chunkId === 'data') {
            return offset + 8; // Return position after 'data' + size (8 bytes)
          }

          offset += 8 + chunkSize;
        }
      } catch (e) {
        // If parsing fails, treat as raw audio
        return 0;
      }

      return 44; // Fallback to standard header size
    }

    // Handle empty audio chunks
    if (audioDataChunks.length === 0) {
      // Send empty stream
      port.postMessage({
        type: 'STREAM_START',
        data: { chunkCount: 0, contentType: 'audio/wav' },
      });
      port.postMessage({ type: 'STREAM_COMPLETE' });
      return;
    }

    // Extract PCM data from each chunk
    const pcmDataChunks = audioDataChunks.map((chunk) => {
      const dataOffset = findDataChunkOffset(chunk);
      return chunk.slice(dataOffset);
    });

    // Use first chunk's header up to data chunk
    const firstDataOffset = findDataChunkOffset(audioDataChunks[0]);

    let combinedAudioBlob;
    if (firstDataOffset > 0) {
      // Has WAV header - fix it for concatenated audio
      const headerBytes = new Uint8Array(audioDataChunks[0].slice(0, firstDataOffset));

      // Calculate total PCM data size
      const totalDataSize = pcmDataChunks.reduce((sum, chunk) => sum + chunk.length, 0);

      // Update header sizes
      const view = new DataView(headerBytes.buffer, headerBytes.byteOffset);
      view.setUint32(4, totalDataSize + firstDataOffset - 8, true); // RIFF chunk size
      view.setUint32(firstDataOffset - 4, totalDataSize, true); // data chunk size

      // Build combined audio
      combinedAudioBlob = new Blob([headerBytes, ...pcmDataChunks], { type: 'audio/wav' });
    } else {
      // No header (test data) - just concatenate
      combinedAudioBlob = new Blob(pcmDataChunks, { type: 'audio/wav' });
    }

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

    // Fix phrase timings to be relative to start of combined audio
    // Server sends phrase.start_ms relative to chunk (0-based within chunk)
    metadata.phrases.forEach((phrase) => {
      phrase.start_ms = cumulativeOffset + phrase.start_ms;
    });

    // Update start_offset_ms to new position
    metadata.start_offset_ms = cumulativeOffset;

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
