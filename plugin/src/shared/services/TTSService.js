import { TTSClient } from '../api/TTSClient.js';
import { SettingsStore } from '../storage/SettingsStore.js';
import { toJSON, toBlob } from '../api/ResponseHandler.js';
import { validateTTSText } from '../utils/validation.js';

/**
 * Centralized service for TTS API operations
 * Manages TTSClient instances with proper authentication and response handling
 */
export class TTSService {
  constructor() {
    this._client = null;
    this._currentSettings = null;
  }

  /**
   * Get or create TTSClient with current settings
   * @returns {Promise<TTSClient>}
   */
  async getClient() {
    const settings = await SettingsStore.get();

    // Create new client if settings changed or client doesn't exist
    if (!this._client ||
        this._currentSettings?.apiUrl !== settings.apiUrl ||
        this._currentSettings?.apiKey !== settings.apiKey) {
      this._client = new TTSClient(settings.apiUrl, settings.apiKey);
      this._currentSettings = {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey
      };
    }

    return this._client;
  }

  /**
   * Check server health
   * @returns {Promise<Object>} Health status object
   */
  async checkHealth() {
    const client = await this.getClient();
    const response = await client.checkHealth();
    return await toJSON(response);
  }

  /**
   * Get available voices
   * @returns {Promise<Object>} Voices list object
   */
  async getVoices() {
    const client = await this.getClient();
    const response = await client.getVoices();
    return await toJSON(response);
  }

  /**
   * Fetch a voice sample with authentication
   * @param {string} voiceId - Voice identifier
   * @returns {Promise<Blob>} Audio sample as Blob
   */
  async fetchVoiceSample(voiceId) {
    const client = await this.getClient();
    const response = await client.fetchVoiceSample(voiceId);
    return await toBlob(response, 'audio/wav');
  }

  /**
   * Synthesize text to speech (streaming)
   * @param {string} text - Text to synthesize
   * @param {Object} options - Synthesis options
   * @returns {Promise<Response>}
   */
  async synthesizeStream(text, options = {}) {
    const validatedText = validateTTSText(text);
    const client = await this.getClient();
    const settings = await SettingsStore.get();

    return await client.synthesizeStream(validatedText, {
      voice: options.voice || settings.selectedVoiceId,
      speed: options.speed || settings.speed || 1.0,
      signal: options.signal
    });
  }

  /**
   * Synthesize text to speech (non-streaming)
   * @param {string} text - Text to synthesize
   * @param {Object} options - Synthesis options
   * @returns {Promise<Response>}
   */
  async synthesize(text, options = {}) {
    const validatedText = validateTTSText(text);
    const client = await this.getClient();
    const settings = await SettingsStore.get();

    return await client.synthesize(validatedText, {
      voice: options.voice || settings.selectedVoiceId,
      speed: options.speed || settings.speed || 1.0,
      signal: options.signal
    });
  }

  /**
   * Reset the client (useful for testing or forcing re-initialization)
   */
  reset() {
    this._client = null;
    this._currentSettings = null;
  }
}

// Export singleton instance
export const ttsService = new TTSService();
