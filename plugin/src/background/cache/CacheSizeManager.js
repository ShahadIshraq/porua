/**
 * Cache Size Manager
 * Tracks and enforces cache size limits
 */

import { CACHE_CONFIG, CACHE_ERRORS } from './constants.js';
import { CacheError } from './CacheError.js';

export class CacheSizeManager {
  /**
   * Calculate total size of cache entry
   * @param {Blob[]} audioBlobs - Array of audio blobs
   * @returns {number} Total size in bytes
   */
  static calculateEntrySize(audioBlobs) {
    return audioBlobs.reduce((sum, blob) => sum + blob.size, 0);
  }

  /**
   * Validate entry size before insertion
   * @param {number} sizeBytes - Entry size in bytes
   * @param {number} maxEntrySize - Max entry size
   * @param {number} maxCacheSize - Max cache size
   * @throws {CacheError} If entry is too large
   */
  static validateEntrySize(sizeBytes, maxEntrySize, maxCacheSize) {
    if (sizeBytes > maxEntrySize) {
      throw new CacheError(
        `Entry size (${sizeBytes} bytes) exceeds max entry size (${maxEntrySize} bytes)`,
        CACHE_ERRORS.ENTRY_TOO_LARGE
      );
    }

    if (sizeBytes > maxCacheSize) {
      throw new CacheError(
        `Entry size (${sizeBytes} bytes) exceeds max cache size (${maxCacheSize} bytes)`,
        CACHE_ERRORS.ENTRY_TOO_LARGE
      );
    }
  }

  /**
   * Update global size tracking
   * @param {Object} repository - Cache repository
   * @param {number} delta - Size change (positive or negative)
   * @param {number} entryCountDelta - Entry count change
   * @returns {Promise<void>}
   */
  static async updateGlobalStats(repository, delta, entryCountDelta = 0) {
    const stats = await repository.getMetadata();
    stats.totalSizeBytes += delta;
    stats.entryCount += entryCountDelta;

    // Ensure non-negative
    stats.totalSizeBytes = Math.max(0, stats.totalSizeBytes);
    stats.entryCount = Math.max(0, stats.entryCount);

    await repository.updateMetadata(stats);
  }

  /**
   * Verify integrity of size tracking
   * @param {Object} repository - Cache repository
   * @returns {Promise<{repaired: boolean, discrepancy: number}>}
   */
  static async verifyIntegrity(repository) {
    const entries = await repository.getAllEntries();
    const actualSize = entries.reduce((sum, e) => sum + e.totalSizeBytes, 0);
    const stats = await repository.getMetadata();

    const discrepancy = Math.abs(actualSize - stats.totalSizeBytes);

    if (discrepancy > 1024) {
      // Allow 1KB tolerance
      console.warn(
        `[Cache] Size discrepancy detected: ${discrepancy} bytes ` +
          `(expected: ${stats.totalSizeBytes}, actual: ${actualSize})`
      );

      // Auto-repair
      stats.totalSizeBytes = actualSize;
      stats.entryCount = entries.length;
      stats.lastIntegrityCheckAt = Date.now();
      await repository.updateMetadata(stats);

      return { repaired: true, discrepancy };
    }

    // Update last check time
    stats.lastIntegrityCheckAt = Date.now();
    await repository.updateMetadata(stats);

    return { repaired: false, discrepancy: 0 };
  }

  /**
   * Check if eviction is needed before insertion
   * @param {number} currentSize - Current cache size
   * @param {number} newEntrySize - Size of new entry
   * @param {number} maxSize - Max cache size
   * @param {number} triggerPercent - Trigger threshold
   * @param {number} targetPercent - Target after eviction
   * @returns {{needed: boolean, bytesToFree?: number}}
   */
  static checkEvictionNeeded(
    currentSize,
    newEntrySize,
    maxSize,
    triggerPercent = CACHE_CONFIG.EVICTION_TRIGGER_PERCENT,
    targetPercent = CACHE_CONFIG.EVICTION_TARGET_PERCENT
  ) {
    const projectedSize = currentSize + newEntrySize;
    const triggerThreshold = maxSize * triggerPercent;

    if (projectedSize > triggerThreshold) {
      const targetSize = maxSize * targetPercent;
      const bytesToFree = projectedSize - targetSize;

      return {
        needed: true,
        bytesToFree,
      };
    }

    return { needed: false };
  }
}
