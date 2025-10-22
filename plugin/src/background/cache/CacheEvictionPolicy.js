/**
 * Cache Eviction Policy
 * Implements LRU (Least Recently Used) eviction strategy
 */

import { CACHE_CONFIG } from './constants.js';

export class CacheEvictionPolicy {
  /**
   * Evict entries to free up space using LRU strategy
   * @param {Object} repository - Cache repository
   * @param {number} targetBytes - Bytes to free
   * @returns {Promise<{bytesFreed: number, entriesRemoved: number}>}
   */
  static async evict(repository, targetBytes) {
    console.log(`[Cache] Starting eviction to free ${targetBytes} bytes`);

    // Get entries sorted by lastAccessedAt (oldest first)
    const entries = await repository.getEntriesSortedByLRU();

    if (entries.length === 0) {
      console.warn('[Cache] No entries to evict');
      return { bytesFreed: 0, entriesRemoved: 0 };
    }

    let bytesFreed = 0;
    let entriesRemoved = 0;
    const keysToRemove = [];

    // Collect entries to remove
    for (const entry of entries) {
      if (bytesFreed >= targetBytes) {
        break;
      }

      keysToRemove.push(entry.key);
      bytesFreed += entry.totalSizeBytes;
      entriesRemoved++;
    }

    // Batch delete
    if (keysToRemove.length > 0) {
      await repository.removeMultiple(keysToRemove);
      console.log(`[Cache] Evicted ${entriesRemoved} entries (${bytesFreed} bytes freed)`);
    }

    return { bytesFreed, entriesRemoved };
  }

  /**
   * Evict oldest N entries
   * @param {Object} repository - Cache repository
   * @param {number} count - Number of entries to evict
   * @returns {Promise<{bytesFreed: number, entriesRemoved: number}>}
   */
  static async evictOldest(repository, count) {
    const entries = await repository.getEntriesSortedByLRU();
    const toRemove = entries.slice(0, Math.min(count, entries.length));

    if (toRemove.length === 0) {
      return { bytesFreed: 0, entriesRemoved: 0 };
    }

    const keysToRemove = toRemove.map((e) => e.key);
    const bytesFreed = toRemove.reduce((sum, e) => sum + e.totalSizeBytes, 0);

    await repository.removeMultiple(keysToRemove);

    return { bytesFreed, entriesRemoved: toRemove.length };
  }

  /**
   * Calculate recommended eviction amount
   * @param {number} currentSize - Current cache size
   * @param {number} maxSize - Max cache size
   * @param {number} targetPercent - Target percentage
   * @returns {number} Bytes to evict
   */
  static calculateEvictionAmount(
    currentSize,
    maxSize,
    targetPercent = CACHE_CONFIG.EVICTION_TARGET_PERCENT
  ) {
    const targetSize = maxSize * targetPercent;
    return Math.max(0, currentSize - targetSize);
  }
}
