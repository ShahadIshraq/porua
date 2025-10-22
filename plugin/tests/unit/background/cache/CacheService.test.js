import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService } from '../../../../src/background/cache/CacheService.js';

// Mock IndexedDB
const createMockIndexedDB = () => {
  const stores = {};

  return {
    open: vi.fn().mockImplementation((dbName, version) => {
      return {
        result: {
          objectStoreNames: {
            contains: () => false,
          },
          createObjectStore: vi.fn(),
          transaction: vi.fn((storeNames, mode) => {
            const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            return {
              objectStore: () => ({
                get: vi.fn().mockReturnValue({
                  onsuccess: null,
                  result: stores[storeName]?.['globalStats'],
                }),
                put: vi.fn().mockReturnValue({ onsuccess: null }),
                delete: vi.fn().mockReturnValue({ onsuccess: null }),
                getAll: vi.fn().mockReturnValue({
                  onsuccess: null,
                  result: Object.values(stores[storeName] || {}),
                }),
                index: vi.fn(() => ({
                  getAll: vi.fn().mockReturnValue({ onsuccess: null, result: [] }),
                })),
                clear: vi.fn().mockReturnValue({ onsuccess: null }),
              }),
            };
          }),
        },
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
    }),
  };
};

describe('CacheService', () => {
  beforeEach(() => {
    // Reset singleton
    CacheService._instance = null;

    // Mock IndexedDB
    global.indexedDB = createMockIndexedDB();
    global.crypto = {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    };
  });

  describe('getInstance', () => {
    it('should return singleton instance', async () => {
      const instance1 = await CacheService.getInstance();
      const instance2 = await CacheService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('get and set', () => {
    it('should return null for cache miss', async () => {
      const cache = await CacheService.getInstance();

      const result = await cache.get('Hello world', 'af_bella', 1.0);

      expect(result).toBeNull();
    });

    it('should handle size validation', async () => {
      const cache = await CacheService.getInstance();

      // Create a very large blob that exceeds limits
      const hugeBlob = new Blob([new ArrayBuffer(30 * 1024 * 1024)]); // 30 MB
      const data = {
        audioBlobs: [hugeBlob],
        metadataArray: [{ chunk_index: 0, phrases: [], start_offset_ms: 0, duration_ms: 1000 }],
        phraseTimeline: [],
      };

      // Should fail validation
      const result = await cache.set('Test', 'af_bella', 1.0, data);

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const cache = await CacheService.getInstance();

      const stats = await cache.getStats();

      expect(stats).toHaveProperty('totalSizeBytes');
      expect(stats).toHaveProperty('maxSizeBytes');
      expect(stats).toHaveProperty('usagePercent');
      expect(stats).toHaveProperty('entryCount');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('evictions');
    });

    it('should calculate hit rate correctly', async () => {
      const cache = await CacheService.getInstance();

      // Mock repository to return specific stats
      cache.repository.getMetadata = vi.fn().mockResolvedValue({
        totalSizeBytes: 1000,
        maxSizeBytes: 100000,
        entryCount: 5,
        hits: 75,
        misses: 25,
        evictions: 2,
      });

      const stats = await cache.getStats();

      expect(stats.hitRate).toBe(0.75); // 75 / (75 + 25) = 0.75
    });
  });

  describe('clear', () => {
    it('should clear all entries and reset stats', async () => {
      const cache = await CacheService.getInstance();

      await cache.clear();

      const stats = await cache.getStats();
      expect(stats.totalSizeBytes).toBe(0);
      expect(stats.entryCount).toBe(0);
    });
  });

  describe('fallback mode', () => {
    it('should return null for get in fallback mode', async () => {
      const cache = await CacheService.getInstance();
      cache.fallbackMode = true;

      const result = await cache.get('Test', 'af_bella', 1.0);

      expect(result).toBeNull();
    });

    it('should return false for set in fallback mode', async () => {
      const cache = await CacheService.getInstance();
      cache.fallbackMode = true;

      const data = {
        audioBlobs: [new Blob(['test'])],
        metadataArray: [],
        phraseTimeline: [],
      };

      const result = await cache.set('Test', 'af_bella', 1.0, data);

      expect(result).toBe(false);
    });
  });
});
