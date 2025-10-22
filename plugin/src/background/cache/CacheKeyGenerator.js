/**
 * Generate cache keys from request parameters
 */

import { CACHE_CONFIG, CACHE_ERRORS } from './constants.js';
import { CacheError } from './CacheError.js';

export class CacheKeyGenerator {
  /**
   * Generate cache key from request parameters
   * Format: {textHash}|{voiceId}|{speed}
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<string>} Cache key
   */
  static async generate(text, voiceId, speed) {
    try {
      // 1. Normalize text
      const normalizedText = this.normalizeText(text);

      // 2. Hash text (SHA-256, first 32 hex chars)
      const textHash = await this.hashText(normalizedText);

      // 3. Normalize speed (1 decimal place)
      const normalizedSpeed = speed.toFixed(1);

      // 4. Compose key
      return `${textHash}|${voiceId}|${normalizedSpeed}`;
    } catch (error) {
      throw new CacheError(
        'Failed to generate cache key',
        CACHE_ERRORS.KEY_GENERATION_FAILED,
        error
      );
    }
  }

  /**
   * Normalize text for consistent hashing
   * @param {string} text - Raw text
   * @returns {string} Normalized text
   */
  static normalizeText(text) {
    return (
      text
        .trim()
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width chars
        .normalize('NFC')
    ); // Unicode normalization
  }

  /**
   * Hash text using SHA-256
   * @param {string} text - Text to hash
   * @returns {Promise<string>} Hex hash (first 32 chars)
   */
  static async hashText(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Return first 32 chars (16 bytes)
    return hashHex.substring(0, CACHE_CONFIG.TEXT_HASH_LENGTH);
  }

  /**
   * Parse cache key into components
   * @param {string} key - Cache key
   * @returns {{textHash: string, voiceId: string, speed: number}}
   */
  static parse(key) {
    const [textHash, voiceId, speed] = key.split('|');
    return {
      textHash,
      voiceId,
      speed: parseFloat(speed),
    };
  }
}
