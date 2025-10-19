/**
 * Generates cache keys for TTS audio
 * Format: v{version}:{voiceId}:{speed}:{textHash}
 * Example: v1:bf_lily:1.0:8f3a2c1b
 */
export class CacheKeyGenerator {
  constructor(version = 1) {
    this.version = version;
  }

  /**
   * Create cache key from parameters
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed (0.5-2.0)
   * @returns {string} Cache key
   */
  create(text, voiceId, speed) {
    const textHash = this.hashText(text);
    return `v${this.version}:${voiceId}:${speed}:${textHash}`;
  }

  /**
   * Parse cache key into components
   * @param {string} key - Cache key to parse
   * @returns {Object} Parsed components
   */
  parse(key) {
    const [version, voiceId, speed, textHash] = key.split(':');
    return {
      version: parseInt(version.substring(1)),
      voiceId,
      speed: parseFloat(speed),
      textHash
    };
  }

  /**
   * Hash text using FNV-1a algorithm (fast, good distribution)
   * Returns 8-character hex string
   * @param {string} text - Text to hash
   * @returns {string} 8-character hex hash
   */
  hashText(text) {
    const normalized = text.trim().toLowerCase();
    let hash = 2166136261;  // FNV offset basis

    for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 16777619);  // FNV prime
    }

    // Convert to unsigned 32-bit integer, then to hex
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Validate cache key format
   * @param {string} key - Cache key to validate
   * @returns {boolean} True if valid
   */
  isValid(key) {
    const pattern = /^v\d+:[^:]+:[\d.]+:[a-f0-9]{8}$/;
    return pattern.test(key);
  }

  /**
   * Check if key matches current version
   * @param {string} key - Cache key to check
   * @returns {boolean} True if current version
   */
  isCurrentVersion(key) {
    const parsed = this.parse(key);
    return parsed.version === this.version;
  }
}
