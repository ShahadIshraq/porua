import { APIError } from '../utils/errors.js';
import { validateSpeed } from '../utils/validation.js';

export class TTSClient {
  constructor(baseUrl, apiKey = '') {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async checkHealth() {
    return await this.fetch('/health');
  }

  /**
   * Fetch list of available voices from server
   * @returns {Promise<Response>}
   */
  async getVoices() {
    return await this.fetch('/voices');
  }

  /**
   * Get the full URL for a voice sample
   * @param {string} voiceId - Voice identifier (e.g., 'af_alloy')
   * @returns {string} Full URL to sample audio file
   */
  getVoiceSampleUrl(voiceId) {
    return `${this.baseUrl}/samples/${voiceId}.wav`;
  }

  /**
   * Fetch a voice sample with authentication
   * @param {string} voiceId - Voice identifier (e.g., 'af_alloy')
   * @returns {Promise<Response>}
   */
  async fetchVoiceSample(voiceId) {
    return await this.fetch(`/samples/${voiceId}.wav`);
  }

  async synthesizeStream(text, options = {}) {
    const speed = options.speed || 1.0;
    const validatedSpeed = validateSpeed(speed);

    return await this.fetch('/tts/stream', {
      method: 'POST',
      body: JSON.stringify({
        text,
        voice: options.voice || 'bf_lily',
        speed: validatedSpeed
      })
    });
  }

  async synthesize(text, options = {}) {
    const speed = options.speed || 1.0;
    const validatedSpeed = validateSpeed(speed);

    return await this.fetch('/tts', {
      method: 'POST',
      body: JSON.stringify({
        text,
        voice: options.voice || 'bf_lily',
        speed: validatedSpeed
      }),
      signal: options.signal
    });
  }

  async fetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'X-API-Key': this.apiKey }),
      ...options.headers
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new APIError(response.status, await response.text());
    }

    return response;
  }
}
