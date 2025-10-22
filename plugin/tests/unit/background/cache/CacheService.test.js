import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService } from '../../../../src/background/cache/CacheService.js';

// Mock IndexedDB with proper promise resolution
const createMockIndexedDB = () => {
  const stores = {
    cacheMetadata: {
      globalStats: {
        key: 'globalStats',
        totalSizeBytes: 0,
        maxSizeBytes: 100 * 1024 * 1024,
        entryCount: 0,
        hits: 0,
        misses: 0,
        evictions: 0,
        lastEvictionAt: 0,
        lastIntegrityCheckAt: 0,
        schemaVersion: 1,
      },
    },
    audioCache: {},
  };

  return {
    open: vi.fn().mockImplementation((dbName, version) => {
      const request = {
        result: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      // Simulate async open
      setTimeout(() => {
        request.result = {
          objectStoreNames: {
            contains: (name) => ['audioCache', 'cacheMetadata'].includes(name),
          },
          createObjectStore: vi.fn((name) => ({
            createIndex: vi.fn(),
          })),
          transaction: vi.fn((storeNames, mode) => {
            const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            return {
              objectStore: () => ({
                get: vi.fn((key) => {
                  const req = {
                    result: stores[storeName]?.[key],
                    onsuccess: null,
                    onerror: null,
                  };
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                }),
                put: vi.fn((value) => {
                  const req = { onsuccess: null, onerror: null };
                  stores[storeName][value.key] = value;
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                }),
                delete: vi.fn((key) => {
                  const req = { onsuccess: null, onerror: null };
                  delete stores[storeName][key];
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                }),
                getAll: vi.fn(() => {
                  const req = {
                    result: Object.values(stores[storeName] || {}),
                    onsuccess: null,
                    onerror: null,
                  };
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                }),
                index: vi.fn(() => ({
                  getAll: vi.fn(() => {
                    const req = {
                      result: [],
                      onsuccess: null,
                      onerror: null,
                    };
                    setTimeout(() => req.onsuccess?.(), 0);
                    return req;
                  }),
                })),
                clear: vi.fn(() => {
                  const req = { onsuccess: null, onerror: null };
                  // Clear entries but keep metadata store
                  if (storeName === 'audioCache') {
                    stores[storeName] = {};
                  } else if (storeName === 'cacheMetadata') {
                    // Reset metadata but keep the globalStats key
                    stores[storeName] = {
                      globalStats: {
                        key: 'globalStats',
                        totalSizeBytes: 0,
                        maxSizeBytes: 100 * 1024 * 1024,
                        entryCount: 0,
                        hits: 0,
                        misses: 0,
                        evictions: 0,
                        lastEvictionAt: 0,
                        lastIntegrityCheckAt: 0,
                        schemaVersion: 1,
                      },
                    };
                  }
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                }),
              }),
            };
          }),
        };
        request.onsuccess?.();
      }, 0);

      return request;
    }),
  };
};

describe('CacheService', () => {
  beforeEach(() => {
    // Reset singleton
    CacheService._instance = null;

    // Mock IndexedDB
    global.indexedDB = createMockIndexedDB();

    // Mock crypto
    global.crypto = {
      subtle: {
        digest: vi.fn().mockImplementation(async (algorithm, data) => {
          const hash = new Uint8Array(32);
          for (let i = 0; i < Math.min(32, data.length); i++) {
            hash[i] = data[i];
          }
          return hash.buffer;
        }),
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

      // Set up repository mock to handle clear correctly
      cache.repository.getMetadata = vi.fn().mockResolvedValue({
        key: 'globalStats',
        totalSizeBytes: 1000,
        maxSizeBytes: 100 * 1024 * 1024,
        entryCount: 5,
        hits: 0,
        misses: 0,
        evictions: 0,
        lastEvictionAt: 0,
        lastIntegrityCheckAt: 0,
        schemaVersion: 1,
      });
      cache.repository.updateMetadata = vi.fn().mockResolvedValue(undefined);
      cache.repository.clearAll = vi.fn().mockResolvedValue(undefined);

      await cache.clear();

      expect(cache.repository.clearAll).toHaveBeenCalled();
      expect(cache.repository.updateMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          totalSizeBytes: 0,
          entryCount: 0,
        })
      );
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
