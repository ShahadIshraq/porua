import { APIError } from '../utils/errors.js';

export class TTSClient {
  constructor(baseUrl, apiKey = '') {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async checkHealth() {
    const response = await this.fetch('/health');
    return response.json();
  }

  async synthesizeStream(text, options = {}) {
    return await this.fetch('/tts/stream', {
      method: 'POST',
      body: JSON.stringify({
        text,
        voice: options.voice || 'bf_lily',
        speed: options.speed || 1.0
      })
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
