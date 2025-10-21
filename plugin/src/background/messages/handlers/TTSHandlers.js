/**
 * TTS Message Handlers
 *
 * Handles TTS operations in background script context, where
 * HTTP requests are allowed regardless of page protocol (HTTPS/HTTP).
 *
 * Uses TTSService to perform actual API calls.
 */

import { validateSynthesizePayload, validateVoiceSamplePayload } from '../protocol.js';
import { TTSService } from '../../../shared/services/TTSService.js';
import { toJSON, toBlob } from '../../../shared/api/ResponseHandler.js';

export class TTSHandlers {
  constructor() {
    // Create TTS service instance for background context
    this.ttsService = new TTSService();
  }

  /**
   * Handle health check request
   * @returns {Promise<object>} Health status
   */
  async handleCheckHealth() {
    const response = await this.ttsService.checkHealth();
    return response;
  }

  /**
   * Handle get voices request
   * @returns {Promise<object>} Voices list
   */
  async handleGetVoices() {
    const response = await this.ttsService.getVoices();
    return response;
  }

  /**
   * Handle fetch voice sample request
   * @param {object} payload - {voiceId: string}
   * @returns {Promise<ArrayBuffer>} Voice sample audio as ArrayBuffer
   */
  async handleFetchVoiceSample(payload) {
    validateVoiceSamplePayload(payload);

    const { voiceId } = payload;
    const blob = await this.ttsService.fetchVoiceSample(voiceId);

    // Convert Blob to ArrayBuffer for transfer
    const arrayBuffer = await blob.arrayBuffer();

    return {
      audioData: arrayBuffer,
      contentType: blob.type || 'audio/wav',
    };
  }

  /**
   * Handle non-streaming TTS synthesis request
   * @param {object} payload - {text: string, voice?: string, speed?: number}
   * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
   */
  async handleSynthesize(payload) {
    validateSynthesizePayload(payload);

    const { text, voice, speed } = payload;

    const response = await this.ttsService.synthesize(text, {
      voice,
      speed,
    });

    // Convert response to Blob
    const blob = await toBlob(response, 'audio/');

    // Convert Blob to ArrayBuffer for transfer
    const arrayBuffer = await blob.arrayBuffer();

    return {
      audioData: arrayBuffer,
      contentType: blob.type || 'audio/wav',
    };
  }
}
