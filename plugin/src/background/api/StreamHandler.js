/**
 * StreamHandler - Handles streaming TTS synthesis via long-lived ports
 *
 * Converts multipart streaming responses to transferable format
 * and sends chunks to client via port messaging.
 */

import { validateSynthesizePayload, ERROR_TYPES } from '../messages/protocol.js';
import { TTSService } from '../../shared/services/TTSService.js';
import { StreamParser } from '../../content/audio/StreamParser.js';
import { validateMultipartResponse, extractMultipartBoundary } from '../../shared/api/ResponseHandler.js';

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

    const { text, voice, speed } = payload;

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
        // Send metadata part
        port.postMessage({
          type: 'STREAM_METADATA',
          data: {
            metadata: part.metadata,
          },
        });
      } else if (part.type === 'audio') {
        // Convert audio data to ArrayBuffer for transfer
        const arrayBuffer = part.audioData.buffer.slice(
          part.audioData.byteOffset,
          part.audioData.byteOffset + part.audioData.byteLength
        );

        // Send audio part with content type
        port.postMessage({
          type: 'STREAM_AUDIO',
          data: {
            audioData: arrayBuffer,
            contentType: 'audio/wav', // Default for TTS audio
          },
        });
      }
    }

    // Send stream complete notification
    port.postMessage({
      type: 'STREAM_COMPLETE',
    });

    // Close port after successful completion
    port.disconnect();
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
