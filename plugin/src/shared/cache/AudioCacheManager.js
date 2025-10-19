import { LRUCache } from './LRUCache.js';
import { PersistentCache } from './PersistentCache.js';
import { CacheKeyGenerator } from './CacheKeyGenerator.js';
import { CacheStats } from './CacheStats.js';
import { CACHE_CONFIG } from '../utils/constants.js';

/**
 * Unified audio cache manager
 * Coordinates hot cache (in-memory LRU) and warm cache (IndexedDB)
 * Implements 100MB size limit and 7-day time-based eviction
 */
export class AudioCacheManager {
  constructor(config = {}) {
    this.hotCache = new LRUCache(config.hotCacheSize || CACHE_CONFIG.HOT_CACHE_SIZE);
    this.warmCache = new PersistentCache(
      config.dbName || CACHE_CONFIG.WARM_CACHE_DB_NAME,
      config.version || CACHE_CONFIG.WARM_CACHE_VERSION
    );
    this.keyGenerator = new CacheKeyGenerator(config.keyVersion || CACHE_CONFIG.CACHE_KEY_VERSION);
    this.stats = new CacheStats();
  }

  /**
   * Retrieve cached audio for given parameters
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<Object|null>} Cached audio data or null
   */
  async get(text, voiceId, speed) {
    const key = this.keyGenerator.create(text, voiceId, speed);

    // L1: Hot cache (in-memory)
    let data = this.hotCache.get(key);
    if (data) {
      this.stats.recordHit('hot');
      return data;
    }

    // L2: Warm cache (IndexedDB)
    data = await this.warmCache.get(key);
    if (data) {
      this.stats.recordHit('warm');
      this.hotCache.set(key, data);  // Promote to hot cache
      return data;
    }

    this.stats.recordMiss();
    return null;
  }

  /**
   * Store audio in cache
   * @param {string} text - Text that was synthesized
   * @param {string} voiceId - Voice used
   * @param {number} speed - Speed used
   * @param {Object} audioData - Audio data to cache
   * @returns {Promise<void>}
   */
  async set(text, voiceId, speed, audioData) {
    const key = this.keyGenerator.create(text, voiceId, speed);
    const size = this.calculateSize(audioData);

    // Store in both layers
    this.hotCache.set(key, audioData);

    try {
      await this.warmCache.set(key, {
        ...audioData,
        metadata: {
          text: text.substring(0, 200),  // Truncate for debugging
          voiceId,
          speed,
          size,
          timestamp: Date.now()
        }
      });
      this.stats.recordStore(size);
    } catch (error) {
      if (error.message && error.message.includes('cache full')) {
        console.error('[AudioCacheManager] Cache full, could not store entry');
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if text is cached
   * @param {string} text - Text to check
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<boolean>} True if cached
   */
  async has(text, voiceId, speed) {
    const key = this.keyGenerator.create(text, voiceId, speed);
    return this.hotCache.has(key) || await this.warmCache.has(key);
  }

  /**
   * Invalidate cache entries matching filters
   * @param {Object} filters - Filter criteria
   */
  async invalidate(filters = {}) {
    const { voiceId, olderThan, version } = filters;

    if (version) {
      // Clear all caches on version change
      await this.clearAll();
      return;
    }

    // Selective invalidation
    await this.warmCache.deleteMatching((entry) => {
      if (voiceId && entry.metadata.voiceId !== voiceId) return false;
      if (olderThan && entry.metadata.timestamp < olderThan) return true;
      return false;
    });
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    // Recalculate total size from IndexedDB for accurate reporting
    await this.warmCache.calculateTotalSize();

    return {
      totalSizeBytes: this.warmCache.totalSize,
      totalSize: this.warmCache.formatBytes(this.warmCache.totalSize)
    };
  }

  /**
   * Calculate size of audio data
   * @private
   */
  calculateSize(audioData) {
    if (!audioData.audioBlobs) return 0;
    return audioData.audioBlobs.reduce((sum, blob) => sum + blob.size, 0);
  }

  /**
   * Clear all caches
   */
  async clearAll() {
    this.hotCache.clear();
    await this.warmCache.clear();
    this.stats.reset();
  }

  /**
   * Stop periodic cleanup (for cleanup on shutdown)
   */
  async shutdown() {
    this.warmCache.stopPeriodicCleanup();
  }
}
