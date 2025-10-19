import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WarmCache } from '../../../../src/content/audio/WarmCache.js';
import { ChunkId } from '../../../../src/content/audio/ChunkId.js';

// Mock IndexedDB
vi.mock('idb', () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        index: vi.fn(() => ({
          getAll: vi.fn(() => Promise.resolve([]))
        })),
        count: vi.fn(() => Promise.resolve(0)),
        getAll: vi.fn(() => Promise.resolve([]))
      }))
    }))
  }))
}));

describe('WarmCache', () => {
  let cache;
  let chunkId1, chunkId2;
  let blob1, blob2;

  beforeEach(async () => {
    cache = new WarmCache(1000); // 1KB max for testing

    chunkId1 = new ChunkId('session1', 0, 0);
    chunkId2 = new ChunkId('session1', 0, 1);

    blob1 = new Blob(['a'.repeat(300)]);
    blob2 = new Blob(['b'.repeat(300)]);
  });

  describe('initialization', () => {
    it('should create cache with default size', () => {
      const defaultCache = new WarmCache();

      expect(defaultCache.maxSize).toBe(100 * 1024 * 1024); // 100MB
    });

    it('should create cache with custom size', () => {
      const customCache = new WarmCache(5000);

      expect(customCache.maxSize).toBe(5000);
    });
  });

  describe('getCurrentSize', () => {
    it('should return current cache size', () => {
      expect(cache.getCurrentSize()).toBe(0);
    });
  });

  describe('shouldEvict', () => {
    it('should return false when under limit', () => {
      cache.currentSize = 500;

      expect(cache.shouldEvict()).toBe(false);
    });

    it('should return true when over limit', () => {
      cache.currentSize = 1500;

      expect(cache.shouldEvict()).toBe(true);
    });
  });

  describe('calculateSize', () => {
    it('should calculate total size from IndexedDB', async () => {
      await cache.calculateSize();

      expect(cache.currentSize).toBeGreaterThanOrEqual(0);
    });
  });
});
