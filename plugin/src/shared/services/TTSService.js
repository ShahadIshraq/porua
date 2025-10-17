import { TTSClient } from '../api/TTSClient.js';
import { SettingsStore } from '../storage/SettingsStore.js';

/**
 * Centralized service for TTS API operations
 * Manages TTSClient instances with proper authentication
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
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    const client = await this.getClient();
    return await client.checkHealth();
  }

  /**
   * Get available voices
   * @returns {Promise<Object>}
   */
  async getVoices() {
    const client = await this.getClient();
    return await client.getVoices();
  }

  /**
   * Fetch a voice sample with authentication
   * @param {string} voiceId - Voice identifier
   * @returns {Promise<Blob>}
   */
  async fetchVoiceSample(voiceId) {
    const client = await this.getClient();
    return await client.fetchVoiceSample(voiceId);
  }

  /**
   * Synthesize text to speech (streaming)
   * @param {string} text - Text to synthesize
   * @param {Object} options - Synthesis options
   * @returns {Promise<Response>}
   */
  async synthesizeStream(text, options = {}) {
    const client = await this.getClient();
    const settings = await SettingsStore.get();

    return await client.synthesizeStream(text, {
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
    const client = await this.getClient();
    const settings = await SettingsStore.get();

    return await client.synthesize(text, {
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
