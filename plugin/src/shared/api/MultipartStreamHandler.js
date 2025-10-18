/**
 * MultipartStreamHandler - Unified handler for multipart streaming responses
 * Eliminates code duplication between content script and prefetch manager
 */

import { StreamParser } from '../../content/audio/StreamParser.js';
import { validateMultipartResponse, extractMultipartBoundary } from './ResponseHandler.js';
import { APIError } from '../utils/errors.js';

/**
 * Parse multipart streaming response into audio blobs and metadata
 * Replaces 60+ lines of duplicated code with a single function call
 *
 * @param {Response} response - Fetch API Response object from streaming endpoint
 * @returns {Promise<Object>} Parsed multipart data
 * @returns {Promise<Object>} result
 * @returns {Blob[]} result.audioBlobs - Array of audio data as Blobs
 * @returns {Object[]} result.metadataArray - Array of metadata objects
 * @returns {Object[]} result.phraseTimeline - Timeline of phrases with timing info
 * @throws {APIError} If response is not valid multipart or parsing fails
 *
 * @example
 * const response = await ttsService.synthesizeStream(text);
 * const { audioBlobs, metadataArray, phraseTimeline } = await parseMultipartStream(response);
 * audioQueue.enqueue(audioBlobs, metadataArray, phraseTimeline);
 */
export async function parseMultipartStream(response) {
  // Validate response format
  validateMultipartResponse(response);

  // Extract boundary from headers
  const boundary = extractMultipartBoundary(response);

  // Get stream reader
  let reader;
  try {
    reader = response.body.getReader();
  } catch (error) {
    throw new APIError(
      response.status,
      `Failed to get response body reader: ${error.message}`
    );
  }

  // Parse multipart stream
  let parts;
  try {
    parts = await StreamParser.parseMultipartStream(reader, boundary);
  } catch (error) {
    throw new APIError(
      response.status,
      `Failed to parse multipart stream: ${error.message}`
    );
  }

  // Extract metadata parts
  const metadataArray = parts
    .filter(part => part.type === 'metadata')
    .map(part => part.metadata);

  // Extract audio parts and convert to Blobs
  const audioBlobs = parts
    .filter(part => part.type === 'audio')
    .map(part => new Blob([part.audioData], { type: 'audio/wav' }));

  // Build phrase timeline from metadata
  const phraseTimeline = buildPhraseTimeline(metadataArray);

  return {
    audioBlobs,
    metadataArray,
    phraseTimeline
  };
}

/**
 * Build phrase timeline from metadata array
 * @param {Object[]} metadataArray - Array of metadata objects
 * @returns {Object[]} Timeline of phrases with timing information
 * @private
 */
function buildPhraseTimeline(metadataArray) {
  const timeline = [];
  let accumulatedDuration = 0;

  for (const metadata of metadataArray) {
    if (!metadata.phrases || !Array.isArray(metadata.phrases)) {
      continue;
    }

    for (const phrase of metadata.phrases) {
      const startMs = phrase.start_ms || 0;
      const durationMs = phrase.duration_ms || 0;
      const endMs = startMs + durationMs;

      timeline.push({
        text: phrase.text,
        startTime: accumulatedDuration + startMs,
        endTime: accumulatedDuration + endMs,
        chunkIndex: timeline.length
      });
    }

    // Accumulate duration for next chunk
    if (metadata.duration_ms) {
      accumulatedDuration += metadata.duration_ms;
    }
  }

  return timeline;
}
