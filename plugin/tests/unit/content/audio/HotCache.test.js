import { describe, it, expect, beforeEach } from 'vitest';
import { HotCache } from '../../../../src/content/audio/HotCache.js';
import { ChunkId } from '../../../../src/content/audio/ChunkId.js';

describe('HotCache', () => {
  let cache;
  let chunkId1, chunkId2, chunkId3;
  let blob1, blob2, blob3;

  beforeEach(() => {
    cache = new HotCache(1000); // 1KB max size for testing

    chunkId1 = new ChunkId('session1', 0, 0);
    chunkId2 = new ChunkId('session1', 0, 1);
    chunkId3 = new ChunkId('session1', 0, 2);

    // Create test blobs
    blob1 = new Blob(['a'.repeat(300)]); // ~300 bytes
    blob2 = new Blob(['b'.repeat(300)]); // ~300 bytes
    blob3 = new Blob(['c'.repeat(300)]); // ~300 bytes
  });

  describe('set and get', () => {
    it('should store and retrieve blob', () => {
      cache.set(chunkId1, blob1);
      const retrieved = cache.get(chunkId1);

      expect(retrieved).toBe(blob1);
    });

    it('should return null for non-existent chunk', () => {
      const retrieved = cache.get(chunkId1);

      expect(retrieved).toBeNull();
    });

    it('should update existing entry', () => {
      cache.set(chunkId1, blob1);
      cache.set(chunkId1, blob2);

      const retrieved = cache.get(chunkId1);
      expect(retrieved).toBe(blob2);
    });

    it('should track cache size', () => {
      cache.set(chunkId1, blob1);

      expect(cache.getCurrentSize()).toBeGreaterThan(0);
      expect(cache.getCurrentSize()).toBeLessThanOrEqual(blob1.size);
    });
  });

  describe('has', () => {
    it('should return true for cached chunk', () => {
      cache.set(chunkId1, blob1);

      expect(cache.has(chunkId1)).toBe(true);
    });

    it('should return false for non-cached chunk', () => {
      expect(cache.has(chunkId1)).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove chunk from cache', () => {
      cache.set(chunkId1, blob1);
      expect(cache.has(chunkId1)).toBe(true);

      cache.delete(chunkId1);
      expect(cache.has(chunkId1)).toBe(false);
    });

    it('should update cache size', () => {
      cache.set(chunkId1, blob1);
      const sizeWithBlob = cache.getCurrentSize();

      cache.delete(chunkId1);
      expect(cache.getCurrentSize()).toBe(0);
    });

    it('should handle deleting non-existent chunk', () => {
      cache.delete(chunkId1);

      expect(cache.getCurrentSize()).toBe(0);
    });
  });

  describe('shouldEvict', () => {
    it('should return false when under limit', () => {
      cache.set(chunkId1, blob1);

      expect(cache.shouldEvict()).toBe(false);
    });

    it('should return true when over limit', () => {
      cache.set(chunkId1, blob1);
      cache.set(chunkId2, blob2);
      cache.set(chunkId3, blob3);

      // Total ~900 bytes, should be under 1000
      const largeBlobSize = 500;
      const largeBlob = new Blob(['x'.repeat(largeBlobSize)]);
      const chunkId4 = new ChunkId('session1', 0, 3);
      cache.set(chunkId4, largeBlob);

      expect(cache.shouldEvict()).toBe(true);
    });
  });

  describe('selectEvictionCandidates', () => {
    it('should select oldest chunks without current position', () => {
      cache.set(chunkId1, blob1);
      cache.set(chunkId2, blob2);
      cache.set(chunkId3, blob3);

      // Access chunk2 to make it most recent
      cache.get(chunkId2);

      const candidates = cache.selectEvictionCandidates(null, 1);

      expect(candidates.length).toBeGreaterThan(0);
    });

    it('should protect sliding window around current position', () => {
      const currentChunkId = new ChunkId('session1', 0, 10);

      // Add chunks around current position
      for (let i = 0; i < 30; i++) {
        const id = new ChunkId('session1', 0, i);
        const blob = new Blob(['test']);
        cache.set(id, blob);
      }

      const candidates = cache.selectEvictionCandidates(currentChunkId, 5);

      // Candidates should not be in protected window
      for (const candidate of candidates) {
        const distance = Math.abs(candidate.chunkIndex - currentChunkId.chunkIndex);
        expect(distance).toBeGreaterThan(cache.windowBefore);
      }
    });

    it('should return requested number of candidates', () => {
      for (let i = 0; i < 10; i++) {
        const id = new ChunkId('session1', 0, i);
        const blob = new Blob(['test']);
        cache.set(id, blob);
      }

      const candidates = cache.selectEvictionCandidates(null, 3);

      expect(candidates.length).toBe(3);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set(chunkId1, blob1);
      cache.set(chunkId2, blob2);

      cache.clear();

      expect(cache.has(chunkId1)).toBe(false);
      expect(cache.has(chunkId2)).toBe(false);
      expect(cache.size()).toBe(0);
    });

    it('should reset size to zero', () => {
      cache.set(chunkId1, blob1);
      cache.clear();

      expect(cache.getCurrentSize()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set(chunkId1, blob1);

      const stats = cache.getStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('currentSizeBytes');
      expect(stats).toHaveProperty('maxSizeBytes');
      expect(stats).toHaveProperty('utilizationPercent');

      expect(stats.size).toBe(1);
      expect(stats.maxSizeBytes).toBe(1000);
    });
  });

  describe('size', () => {
    it('should return number of cached chunks', () => {
      expect(cache.size()).toBe(0);

      cache.set(chunkId1, blob1);
      expect(cache.size()).toBe(1);

      cache.set(chunkId2, blob2);
      expect(cache.size()).toBe(2);

      cache.delete(chunkId1);
      expect(cache.size()).toBe(1);
    });
  });
});
