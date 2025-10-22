/**
 * Cache Service
 * Main facade for cache operations - transparent to content scripts
 */

import { CacheRepository } from './CacheRepository.js';
import { CacheSizeManager } from './CacheSizeManager.js';
import { CacheEvictionPolicy } from './CacheEvictionPolicy.js';
import { CacheKeyGenerator } from './CacheKeyGenerator.js';
import { CACHE_CONFIG, CACHE_ERRORS } from './constants.js';
import { CacheError } from './CacheError.js';

export class CacheService {
  static #instance = null;

  constructor() {
    this.repository = new CacheRepository();
    this.fallbackMode = false;
    this.initialized = false;
  }

  /**
   * Get singleton instance
   * @returns {Promise<CacheService>}
   */
  static async getInstance() {
    if (!CacheService.#instance) {
      CacheService.#instance = new CacheService();
      await CacheService.#instance.init();
    }
    return CacheService.#instance;
  }

  /**
   * Initialize cache service
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      return;
    }

    try {
      await this.repository.init();
      this.initialized = true;
      console.log('[Cache] Service initialized successfully');
    } catch (error) {
      console.error('[Cache] Failed to initialize:', error);
      this.fallbackMode = true;
      throw error;
    }
  }

  /**
   * Get cached entry
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<{audioBlobs: Blob[], metadataArray: Object[], phraseTimeline: Object[]}|null>}
   */
  async get(text, voiceId, speed) {
    if (this.fallbackMode) {
      return null;
    }

    try {
      const entry = await this.repository.get(text, voiceId, speed);

      if (!entry) {
        // Cache miss - update stats
        await this._recordMiss();
        return null;
      }

      // Cache hit - update stats and access time
      await this._recordHit();

      // Update access time asynchronously (don't await)
      const key = await CacheKeyGenerator.generate(text, voiceId, speed);
      this.repository.updateAccessTime(key).catch((err) => {
        console.warn('[Cache] Failed to update access time:', err);
      });

      // Extract blobs from audioChunks
      const audioBlobs = entry.audioChunks.map((chunk) => chunk.blob);

      return {
        audioBlobs,
        metadataArray: entry.metadataArray,
        phraseTimeline: entry.phraseTimeline,
      };
    } catch (error) {
      console.error('[Cache] Get failed:', error);

      if (this._isCriticalError(error)) {
        this._enterFallbackMode();
      }

      return null;
    }
  }

  /**
   * Store entry in cache
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @param {Object} data - {audioBlobs, metadataArray, phraseTimeline}
   * @returns {Promise<boolean>} True if stored successfully
   */
  async set(text, voiceId, speed, data) {
    if (this.fallbackMode) {
      return false;
    }

    try {
      // Calculate entry size
      const entrySize = CacheSizeManager.calculateEntrySize(data.audioBlobs);

      // Validate entry size
      CacheSizeManager.validateEntrySize(
        entrySize,
        CACHE_CONFIG.MAX_ENTRY_SIZE_BYTES,
        CACHE_CONFIG.MAX_CACHE_SIZE_BYTES
      );

      // Check if eviction is needed
      const stats = await this.repository.getMetadata();
      const evictionCheck = CacheSizeManager.checkEvictionNeeded(
        stats.totalSizeBytes,
        entrySize,
        stats.maxSizeBytes
      );

      if (evictionCheck.needed) {
        console.log(`[Cache] Eviction needed before insertion (${evictionCheck.bytesToFree} bytes)`);
        await CacheEvictionPolicy.evict(this.repository, evictionCheck.bytesToFree);

        // Update global stats after eviction
        const entries = await this.repository.getAllEntries();
        const actualSize = entries.reduce((sum, e) => sum + e.totalSizeBytes, 0);
        stats.totalSizeBytes = actualSize;
        stats.entryCount = entries.length;
        stats.evictions += 1;
        stats.lastEvictionAt = Date.now();
        await this.repository.updateMetadata(stats);
      }

      // Store entry
      await this.repository.set(text, voiceId, speed, data);

      // Update global stats
      await CacheSizeManager.updateGlobalStats(this.repository, entrySize, 1);

      console.log(`[Cache] Stored entry (${entrySize} bytes)`);
      return true;
    } catch (error) {
      console.error('[Cache] Set failed:', error);

      // Handle quota exceeded
      if (error.code === CACHE_ERRORS.QUOTA_EXCEEDED) {
        console.warn('[Cache] Quota exceeded, attempting aggressive eviction');

        try {
          // Free 50% of cache
          const stats = await this.repository.getMetadata();
          const bytesToFree = stats.maxSizeBytes * 0.5;
          await CacheEvictionPolicy.evict(this.repository, bytesToFree);

          // Retry once
          const entrySize = CacheSizeManager.calculateEntrySize(data.audioBlobs);
          await this.repository.set(text, voiceId, speed, data);
          await CacheSizeManager.updateGlobalStats(this.repository, entrySize, 1);

          return true;
        } catch (retryError) {
          console.error('[Cache] Retry after eviction failed:', retryError);
          return false;
        }
      }

      if (this._isCriticalError(error)) {
        this._enterFallbackMode();
      }

      return false;
    }
  }

  /**
   * Check if entry exists
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<boolean>}
   */
  async has(text, voiceId, speed) {
    if (this.fallbackMode) {
      return false;
    }

    try {
      return await this.repository.has(text, voiceId, speed);
    } catch (error) {
      console.error('[Cache] Has check failed:', error);
      return false;
    }
  }

  /**
   * Remove entry from cache
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<boolean>}
   */
  async remove(text, voiceId, speed) {
    if (this.fallbackMode) {
      return false;
    }

    try {
      const entry = await this.repository.get(text, voiceId, speed);
      if (!entry) {
        return false;
      }

      const removed = await this.repository.remove(text, voiceId, speed);

      if (removed) {
        // Update global stats
        await CacheSizeManager.updateGlobalStats(this.repository, -entry.totalSizeBytes, -1);
      }

      return removed;
    } catch (error) {
      console.error('[Cache] Remove failed:', error);
      return false;
    }
  }

  /**
   * Clear all cache entries
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await this.repository.clearAll();

      // Reset metadata
      const stats = await this.repository.getMetadata();
      stats.totalSizeBytes = 0;
      stats.entryCount = 0;
      await this.repository.updateMetadata(stats);

      console.log('[Cache] Cleared all entries');
    } catch (error) {
      console.error('[Cache] Clear failed:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const stats = await this.repository.getMetadata();
      const totalRequests = stats.hits + stats.misses;
      const hitRate = totalRequests > 0 ? stats.hits / totalRequests : 0;
      const usagePercent = stats.totalSizeBytes / stats.maxSizeBytes;

      const entries = await this.repository.getAllEntries();
      let oldestEntryAge = 0;
      let newestEntryAge = 0;

      if (entries.length > 0) {
        const now = Date.now();
        const sortedByCreated = entries.sort((a, b) => a.createdAt - b.createdAt);
        oldestEntryAge = now - sortedByCreated[0].createdAt;
        newestEntryAge = now - sortedByCreated[sortedByCreated.length - 1].createdAt;
      }

      return {
        totalSizeBytes: stats.totalSizeBytes,
        maxSizeBytes: stats.maxSizeBytes,
        usagePercent,
        entryCount: stats.entryCount,
        hits: stats.hits,
        misses: stats.misses,
        hitRate,
        evictions: stats.evictions,
        oldestEntryAge,
        newestEntryAge,
        averageEntrySize: stats.entryCount > 0 ? stats.totalSizeBytes / stats.entryCount : 0,
      };
    } catch (error) {
      console.error('[Cache] Failed to get stats:', error);
      return this._getEmptyStats();
    }
  }

  /**
   * Update cache configuration
   * @param {Object} config - Configuration options
   * @returns {Promise<void>}
   */
  async configure(config) {
    const stats = await this.repository.getMetadata();

    if (config.maxSizeBytes !== undefined) {
      stats.maxSizeBytes = Math.max(
        CACHE_CONFIG.MIN_CACHE_SIZE_BYTES,
        Math.min(config.maxSizeBytes, CACHE_CONFIG.MAX_CACHE_SIZE_BYTES * 5)
      );
    }

    await this.repository.updateMetadata(stats);
  }

  /**
   * Run manual eviction
   * @param {number} targetBytes - Optional target bytes to free
   * @returns {Promise<{bytesFreed: number, entriesRemoved: number}>}
   */
  async evict(targetBytes = null) {
    if (targetBytes === null) {
      const stats = await this.repository.getMetadata();
      targetBytes = CacheEvictionPolicy.calculateEvictionAmount(stats.totalSizeBytes, stats.maxSizeBytes);
    }

    const result = await CacheEvictionPolicy.evict(this.repository, targetBytes);

    // Update global stats
    const entries = await this.repository.getAllEntries();
    const actualSize = entries.reduce((sum, e) => sum + e.totalSizeBytes, 0);
    const stats = await this.repository.getMetadata();
    stats.totalSizeBytes = actualSize;
    stats.entryCount = entries.length;
    stats.evictions += 1;
    stats.lastEvictionAt = Date.now();
    await this.repository.updateMetadata(stats);

    return result;
  }

  /**
   * Run integrity check
   * @returns {Promise<{repaired: boolean, discrepancy: number}>}
   */
  async checkIntegrity() {
    return await CacheSizeManager.verifyIntegrity(this.repository);
  }

  /**
   * Record cache hit
   * @private
   */
  async _recordHit() {
    try {
      const stats = await this.repository.getMetadata();
      stats.hits += 1;
      await this.repository.updateMetadata(stats);
    } catch (error) {
      console.warn('[Cache] Failed to record hit:', error);
    }
  }

  /**
   * Record cache miss
   * @private
   */
  async _recordMiss() {
    try {
      const stats = await this.repository.getMetadata();
      stats.misses += 1;
      await this.repository.updateMetadata(stats);
    } catch (error) {
      console.warn('[Cache] Failed to record miss:', error);
    }
  }

  /**
   * Check if error is critical
   * @private
   */
  _isCriticalError(error) {
    return (
      error.name === 'InvalidStateError' ||
      error.name === 'UnknownError' ||
      (error.message && error.message.includes('database corruption'))
    );
  }

  /**
   * Enter fallback mode (disable caching)
   * @private
   */
  _enterFallbackMode() {
    console.warn('[Cache] Entering fallback mode (caching disabled)');
    this.fallbackMode = true;

    // Try to recover after 5 minutes
    setTimeout(() => {
      console.log('[Cache] Attempting to exit fallback mode');
      this.fallbackMode = false;
    }, 5 * 60 * 1000);
  }

  /**
   * Get empty stats (for error cases)
   * @private
   */
  _getEmptyStats() {
    return {
      totalSizeBytes: 0,
      maxSizeBytes: CACHE_CONFIG.MAX_CACHE_SIZE_BYTES,
      usagePercent: 0,
      entryCount: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      oldestEntryAge: 0,
      newestEntryAge: 0,
      averageEntrySize: 0,
    };
  }
}
