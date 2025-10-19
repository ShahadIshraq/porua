import { TTSClient } from '../api/TTSClient.js';
import { SettingsStore } from '../storage/SettingsStore.js';
import { toJSON, toBlob } from '../api/ResponseHandler.js';
import { validateTTSText } from '../utils/validation.js';
import { AudioCacheManager } from '../cache/AudioCacheManager.js';
import { parseMultipartStream } from '../api/MultipartStreamHandler.js';

/**
 * Centralized service for TTS API operations
 * Manages TTSClient instances with proper authentication and response handling
 * Now includes transparent caching for both streaming and non-streaming synthesis
 */
export class TTSService {
  constructor() {
    this._client = null;
    this._currentSettings = null;

    // Initialize cache manager (transparent caching)
    this.cacheManager = new AudioCacheManager();
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
    // Server may return application/octet-stream or audio/wav
    const contentType = response.headers.get('Content-Type') || '';
    const expectedType = contentType.includes('audio/') ? 'audio/' : 'application/octet-stream';
    return await toBlob(response, expectedType);
  }

  /**
   * Synthesize text to speech (streaming) - WITH TRANSPARENT CACHING
   * @param {string} text - Text to synthesize
   * @param {Object} options - Synthesis options
   * @returns {Promise<Object>} { audioBlobs, metadataArray, phraseTimeline }
   */
  async synthesizeStream(text, options = {}) {
    const validatedText = validateTTSText(text);
    const settings = await SettingsStore.get();

    const voiceId = options.voice || settings.selectedVoiceId;
    const speed = options.speed || settings.speed || 1.0;

    // Check cache first
    const cached = await this.cacheManager.get(validatedText, voiceId, speed);
    if (cached) {
      return cached; // Return parsed data directly
    }

    // Cache miss - fetch from server
    const client = await this.getClient();
    const response = await client.synthesizeStream(validatedText, {
      voice: voiceId,
      speed: speed,
      signal: options.signal
    });

    // Parse multipart response
    const { audioBlobs, metadataArray, phraseTimeline } =
      await parseMultipartStream(response);

    // Store in cache for next time
    await this.cacheManager.set(validatedText, voiceId, speed, {
      audioBlobs,
      metadataArray,
      phraseTimeline
    });

    return { audioBlobs, metadataArray, phraseTimeline };
  }

  /**
   * Synthesize text to speech (non-streaming) - WITH TRANSPARENT CACHING
   * @param {string} text - Text to synthesize
   * @param {Object} options - Synthesis options
   * @returns {Promise<Blob>} Audio blob
   */
  async synthesize(text, options = {}) {
    const validatedText = validateTTSText(text);
    const settings = await SettingsStore.get();

    const voiceId = options.voice || settings.selectedVoiceId;
    const speed = options.speed || settings.speed || 1.0;

    // Check cache first
    const cached = await this.cacheManager.get(validatedText, voiceId, speed);
    if (cached) {
      // Merge all audio blobs into one for non-streaming API compatibility
      if (cached.audioBlobs.length === 1) {
        return cached.audioBlobs[0];
      } else {
        // Combine multiple blobs into single blob
        return new Blob(cached.audioBlobs, { type: 'audio/wav' });
      }
    }

    // Cache miss - fetch from server
    const client = await this.getClient();
    const response = await client.synthesize(validatedText, {
      voice: voiceId,
      speed: speed,
      signal: options.signal
    });

    // Convert to blob
    const contentType = response.headers.get('Content-Type') || '';
    const expectedType = contentType.includes('audio/') ? 'audio/' : 'application/octet-stream';
    const audioBlob = await toBlob(response, expectedType);

    // Store in cache (as single-item array for consistency)
    await this.cacheManager.set(validatedText, voiceId, speed, {
      audioBlobs: [audioBlob],
      metadataArray: [],
      phraseTimeline: []
    });

    return audioBlob;
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache stats
   */
  async getCacheStats() {
    return await this.cacheManager.getStats();
  }

  /**
   * Clear all cached audio
   */
  async clearCache() {
    await this.cacheManager.clearAll();
  }

  /**
   * Reset the client (useful for testing or forcing re-initialization)
   */
  reset() {
    this._client = null;
    this._currentSettings = null;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    await this.cacheManager.shutdown();
  }
}

// Export singleton instance
export const ttsService = new TTSService();
