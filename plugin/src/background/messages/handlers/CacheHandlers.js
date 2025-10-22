/**
 * Cache message handlers for admin operations
 */

import { CacheService } from '../../cache/CacheService.js';
import { MESSAGE_TYPES } from '../protocol.js';

// Lazy-initialized cache service
let cacheService = null;

async function getCacheService() {
  if (!cacheService) {
    cacheService = await CacheService.getInstance();
  }
  return cacheService;
}

/**
 * Register cache handlers with message router
 * @param {MessageRouter} router - Message router instance
 */
export function registerCacheHandlers(router) {
  /**
   * Get cache statistics
   * Payload: none
   * Response: {totalSizeBytes, maxSizeBytes, usagePercent, entryCount, hits, misses, hitRate, evictions}
   */
  router.registerHandler(MESSAGE_TYPES.CACHE_GET_STATS, async () => {
    const cache = await getCacheService();
    const stats = await cache.getStats();
    return stats;
  });

  /**
   * Clear all cache entries
   * Payload: none
   * Response: {cleared: true}
   */
  router.registerHandler(MESSAGE_TYPES.CACHE_CLEAR, async () => {
    const cache = await getCacheService();
    await cache.clear();
    return { cleared: true };
  });

  /**
   * Update cache configuration
   * Payload: {maxSizeBytes?: number}
   * Response: {updated: true}
   */
  router.registerHandler(MESSAGE_TYPES.CACHE_CONFIGURE, async (payload) => {
    const cache = await getCacheService();
    await cache.configure(payload);
    return { updated: true };
  });
}
