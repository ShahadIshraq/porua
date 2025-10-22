/**
 * BackgroundTTSClient - Message-based TTS client for content scripts
 *
 * Provides the same interface as TTSService but communicates with
 * background script via message passing instead of direct HTTP fetch.
 *
 * This bypasses mixed content restrictions by delegating HTTP requests
 * to the privileged background script context.
 *
 * Drop-in replacement for ttsService in content scripts.
 */

import { MESSAGE_TYPES, PORT_NAMES } from '../../background/messages/protocol.js';

export class BackgroundTTSClient {
  /**
   * Check server health
   * @returns {Promise<object>} Health status
   */
  async checkHealth() {
    const response = await this.sendMessage(MESSAGE_TYPES.TTS_CHECK_HEALTH);
    return response;
  }

  /**
   * Get available voices
   * @returns {Promise<object>} Voices list
   */
  async getVoices() {
    const response = await this.sendMessage(MESSAGE_TYPES.TTS_GET_VOICES);
    return response;
  }

  /**
   * Fetch voice sample
   * @param {string} voiceId - Voice identifier
   * @returns {Promise<Blob>} Audio sample as Blob
   */
  async fetchVoiceSample(voiceId) {
    const response = await this.sendMessage(MESSAGE_TYPES.TTS_FETCH_VOICE_SAMPLE, {
      voiceId,
    });

    // Convert ArrayBuffer back to Blob
    const blob = new Blob([response.audioData], {
      type: response.contentType || 'audio/wav',
    });

    return blob;
  }

  /**
   * Synthesize text to speech (non-streaming)
   * @param {string} text - Text to synthesize
   * @param {object} options - {voice?, speed?, signal?}
   * @returns {Promise<Response>} Response with audio data
   */
  async synthesize(text, options = {}) {
    const response = await this.sendMessage(MESSAGE_TYPES.TTS_SYNTHESIZE, {
      text,
      voice: options.voice,
      speed: options.speed,
    });

    // Convert ArrayBuffer back to Blob
    const blob = new Blob([response.audioData], {
      type: response.contentType || 'audio/wav',
    });

    // Create Response object to maintain compatibility with TTSService
    return new Response(blob, {
      headers: {
        'Content-Type': response.contentType || 'audio/wav',
      },
    });
  }

  /**
   * Synthesize text to speech (streaming via port)
   * @param {string} text - Text to synthesize
   * @param {object} options - {voice?, speed?, signal?}
   * @returns {Promise<Response>} Response with streaming body
   */
  async synthesizeStream(text, options = {}) {
    return new Promise((resolve, reject) => {
      // Open long-lived port for streaming
      const port = chrome.runtime.connect({ name: PORT_NAMES.TTS_STREAM });

      const chunks = [];
      const metadata = [];
      let streamStarted = false;
      let audioContentType = 'audio/wav'; // Default

      // Handle incoming messages
      port.onMessage.addListener((message) => {
        switch (message.type) {
          case 'STREAM_START':
            streamStarted = true;
            if (message.data && message.data.contentType) {
              audioContentType = message.data.contentType;
            }
            break;

          case 'STREAM_METADATA':
            metadata.push(message.data.metadata);
            break;

          case 'STREAM_AUDIO':
            chunks.push({
              audioData: message.data.audioData,
              contentType: message.data.contentType || audioContentType,
            });
            break;

          case 'STREAM_COMPLETE':
            console.log('[BackgroundTTSClient] Stream complete, chunks:', chunks.length, 'metadata:', metadata.length);

            // Debug: Check first chunk
            if (chunks.length > 0) {
              console.log('[BackgroundTTSClient] First chunk:', {
                audioDataType: chunks[0].audioData?.constructor?.name,
                audioDataSize: chunks[0].audioData?.byteLength,
                contentType: chunks[0].contentType
              });
            }

            // Create multipart-like response for compatibility
            // Convert to format expected by parseMultipartStream
            const responseData = {
              audioBlobs: chunks.map((chunk) => {
                const blob = new Blob([chunk.audioData], { type: chunk.contentType });
                console.log('[BackgroundTTSClient] Created blob:', blob.size, blob.type);
                return blob;
              }),
              metadataArray: metadata,
            };

            // Create custom Response that provides the data
            const customResponse = {
              ok: true,
              status: 200,
              headers: new Headers({
                'Content-Type': 'multipart/mixed',
              }),
              // Add custom properties for parseMultipartStream compatibility
              __backgroundClientData: responseData,
            };

            // Disconnect port after receiving all data
            port.disconnect();

            resolve(customResponse);
            break;

          case 'STREAM_ERROR':
            port.disconnect();
            const error = new Error(message.error.message);
            error.status = message.error.status;
            error.type = message.error.type;
            reject(error);
            break;
        }
      });

      // Handle port disconnection
      port.onDisconnect.addListener(() => {
        if (!streamStarted) {
          reject(new Error('Port disconnected before stream started'));
        }
      });

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          port.disconnect();
          reject(new DOMException('Request aborted', 'AbortError'));
        });
      }

      // Send synthesis request
      port.postMessage({
        type: 'SYNTHESIZE_STREAM',
        payload: {
          text,
          voice: options.voice,
          speed: options.speed,
        },
      });
    });
  }

  /**
   * Send message to background script
   * @private
   * @param {string} type - Message type
   * @param {object} payload - Message payload
   * @returns {Promise<any>} Response data
   */
  async sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type,
          payload,
        },
        (response) => {
          // Check for chrome.runtime.lastError
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          // Check response success
          if (!response || !response.success) {
            const error = new Error(response?.error?.message || 'Unknown error');
            error.type = response?.error?.type;
            error.status = response?.error?.status;
            reject(error);
            return;
          }

          resolve(response.data);
        }
      );
    });
  }
}

// Export singleton instance
export const backgroundTTSClient = new BackgroundTTSClient();
