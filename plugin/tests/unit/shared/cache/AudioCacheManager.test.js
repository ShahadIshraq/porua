import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioCacheManager } from '../../../../src/shared/cache/AudioCacheManager.js';

// Skip these integration tests - they use real IndexedDB (via PersistentCache) and cause OOM
// The new architecture (AudioRegistry + WarmCache) has mocked tests
describe.skip('AudioCacheManager', () => {
  let manager;

  beforeEach(async () => {
    manager = new AudioCacheManager({
      hotCacheSize: 3,
      dbName: 'test-audio-cache',
      version: 1
    });
  });

  afterEach(async () => {
    await manager.clearAll();
    await manager.shutdown();
  });

  describe('initialization', () => {
    it('should create hot cache with specified size', () => {
      expect(manager.hotCache.maxSize).toBe(3);
    });

    it('should create warm cache with database name', () => {
      expect(manager.warmCache.dbName).toBe('test-audio-cache');
    });

    it('should create key generator', () => {
      expect(manager.keyGenerator).toBeDefined();
    });

    it('should create stats tracker', () => {
      expect(manager.stats).toBeDefined();
    });
  });

  describe('get - cache miss', () => {
    it('should return null when entry not in any cache', async () => {
      const result = await manager.get('Hello world', 'bf_lily', 1.0);
      expect(result).toBeNull();
    });

    it('should return stats', async () => {
      await manager.get('Hello world', 'bf_lily', 1.0);

      const stats = await manager.getStats();
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('totalSizeBytes');
    });
  });

  describe('get - hot cache hit', () => {
    it('should return data from hot cache', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [{ duration: 1.5 }],
        phraseTimeline: [{ text: 'Hello', start: 0, end: 0.5 }]
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);

      const result = await manager.get('Hello world', 'bf_lily', 1.0);

      expect(result).toEqual(audioData);
    });

    it('should return stats with storage info', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);
      await manager.get('Hello world', 'bf_lily', 1.0);

      const stats = await manager.getStats();
      expect(stats.totalSizeBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('get - warm cache hit with promotion', () => {
    it('should return data from warm cache when not in hot cache', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [{ duration: 1.5 }],
        phraseTimeline: []
      };

      // Set in warm cache (hot cache will have it too initially)
      await manager.set('Hello world', 'bf_lily', 1.0, audioData);

      // Clear hot cache to simulate warm-only scenario
      manager.hotCache.clear();

      const result = await manager.get('Hello world', 'bf_lily', 1.0);

      expect(result).toBeDefined();
      expect(result.audioBlobs).toHaveLength(1);
    });

    it('should promote warm cache hit to hot cache', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);
      manager.hotCache.clear(); // Clear hot cache

      await manager.get('Hello world', 'bf_lily', 1.0);

      // Should now be in hot cache
      const key = manager.keyGenerator.create('Hello world', 'bf_lily', 1.0);
      expect(manager.hotCache.has(key)).toBe(true);
    });

    it('should return storage stats after warm cache access', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);
      manager.hotCache.clear();

      await manager.get('Hello world', 'bf_lily', 1.0);

      const stats = await manager.getStats();
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('set', () => {
    it('should store data in both hot and warm caches', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);

      const key = manager.keyGenerator.create('Hello world', 'bf_lily', 1.0);
      expect(manager.hotCache.has(key)).toBe(true);
      expect(await manager.warmCache.has(key)).toBe(true);
    });

    it('should calculate and store size', async () => {
      const audioData = {
        audioBlobs: [new Blob(['x'.repeat(1000)], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);

      const stats = await manager.getStats();
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });

    it('should record storage in stats', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);

      const stats = await manager.getStats();
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });

    it('should handle cache full error gracefully', async () => {
      // Use tiny blobs to avoid OOM - logic is same regardless of size
      const smallAudioData = {
        audioBlobs: [new Blob(['x'.repeat(100)], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      // This should not throw even if warm cache is full
      await expect(manager.set('text1', 'bf_lily', 1.0, smallAudioData)).resolves.not.toThrow();
      await expect(manager.set('text2', 'bf_lily', 1.0, smallAudioData)).resolves.not.toThrow();
      await expect(manager.set('text3', 'bf_lily', 1.0, smallAudioData)).resolves.not.toThrow();
    });
  });

  describe('has', () => {
    it('should return true when in hot cache', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);

      const exists = await manager.has('Hello world', 'bf_lily', 1.0);
      expect(exists).toBe(true);
    });

    it('should return true when in warm cache only', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);
      manager.hotCache.clear();

      const exists = await manager.has('Hello world', 'bf_lily', 1.0);
      expect(exists).toBe(true);
    });

    it('should return false when not in any cache', async () => {
      const exists = await manager.has('Hello world', 'bf_lily', 1.0);
      expect(exists).toBe(false);
    });
  });

  describe('cache key variations', () => {
    it('should differentiate by text', async () => {
      const audioData1 = {
        audioBlobs: [new Blob(['short'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      const audioData2 = {
        audioBlobs: [new Blob(['this is longer'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData1);
      await manager.set('Goodbye world', 'bf_lily', 1.0, audioData2);

      const result1 = await manager.get('Hello world', 'bf_lily', 1.0);
      const result2 = await manager.get('Goodbye world', 'bf_lily', 1.0);

      // Both should exist
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();

      // Check that blob sizes are different (audio1 vs audio2 have different lengths)
      expect(result1.audioBlobs[0].size).not.toBe(result2.audioBlobs[0].size);
    });

    it('should differentiate by voice', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);
      await manager.set('Hello world', 'af_nova', 1.0, audioData);

      const result1 = await manager.get('Hello world', 'bf_lily', 1.0);
      const result2 = await manager.get('Hello world', 'af_nova', 1.0);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should differentiate by speed', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);
      await manager.set('Hello world', 'bf_lily', 1.5, audioData);

      const result1 = await manager.get('Hello world', 'bf_lily', 1.0);
      const result2 = await manager.get('Hello world', 'bf_lily', 1.5);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('invalidate', () => {
    it('should clear all caches when version changes', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello world', 'bf_lily', 1.0, audioData);
      await manager.invalidate({ version: 2 });

      const result = await manager.get('Hello world', 'bf_lily', 1.0);
      expect(result).toBeNull();
    });

    it('should handle selective invalidation by voice', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('Hello', 'bf_lily', 1.0, audioData);
      await manager.set('Hello', 'af_nova', 1.0, audioData);

      // This would be implemented if needed for selective voice invalidation
      // Currently invalidate only supports version and olderThan
    });
  });

  describe('getStats', () => {
    it('should return storage statistics', async () => {
      const stats = await manager.getStats();

      expect(stats).toHaveProperty('totalSizeBytes');
      expect(stats).toHaveProperty('totalSize');
      expect(typeof stats.totalSizeBytes).toBe('number');
      expect(typeof stats.totalSize).toBe('string');
    });

    it('should format total size as human-readable', async () => {
      const audioData = {
        audioBlobs: [new Blob(['x'.repeat(1024)], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('key1', 'bf_lily', 1.0, audioData);

      const stats = await manager.getStats();
      expect(stats.totalSize).toMatch(/KB|MB|GB|B/);
    });
  });

  describe('calculateSize', () => {
    it('should calculate total size of all audio blobs', () => {
      const audioData = {
        audioBlobs: [
          new Blob(['x'.repeat(100)], { type: 'audio/wav' }),
          new Blob(['y'.repeat(200)], { type: 'audio/wav' }),
          new Blob(['z'.repeat(300)], { type: 'audio/wav' })
        ],
        metadataArray: [],
        phraseTimeline: []
      };

      const size = manager.calculateSize(audioData);
      expect(size).toBe(600); // 100 + 200 + 300
    });

    it('should return 0 for empty audioBlobs', () => {
      const audioData = {
        audioBlobs: [],
        metadataArray: [],
        phraseTimeline: []
      };

      const size = manager.calculateSize(audioData);
      expect(size).toBe(0);
    });

    it('should return 0 for missing audioBlobs', () => {
      const audioData = {
        metadataArray: [],
        phraseTimeline: []
      };

      const size = manager.calculateSize(audioData);
      expect(size).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear both hot and warm caches', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('key1', 'bf_lily', 1.0, audioData);
      await manager.set('key2', 'bf_lily', 1.0, audioData);

      await manager.clearAll();

      expect(manager.hotCache.size).toBe(0);
      expect(await manager.has('key1', 'bf_lily', 1.0)).toBe(false);
      expect(await manager.has('key2', 'bf_lily', 1.0)).toBe(false);
    });

    it('should reset storage stats', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      await manager.set('key1', 'bf_lily', 1.0, audioData);
      await manager.get('key1', 'bf_lily', 1.0);

      await manager.clearAll();

      const stats = await manager.getStats();
      expect(stats.totalSizeBytes).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should stop periodic cleanup', async () => {
      await manager.shutdown();

      expect(manager.warmCache.cleanupInterval).toBeNull();
    });

    it('should be safe to call multiple times', async () => {
      await manager.shutdown();
      await expect(manager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete cache workflow', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio data'], { type: 'audio/wav' })],
        metadataArray: [{ duration: 1.5 }],
        phraseTimeline: [{ text: 'Hello world', start: 0, end: 1.5 }]
      };

      // Initial miss
      let result = await manager.get('Hello world', 'bf_lily', 1.0);
      expect(result).toBeNull();

      // Store
      await manager.set('Hello world', 'bf_lily', 1.0, audioData);

      // Hit from hot cache
      result = await manager.get('Hello world', 'bf_lily', 1.0);
      expect(result).toEqual(audioData);

      // Clear hot cache
      manager.hotCache.clear();

      // Hit from warm cache (with promotion)
      result = await manager.get('Hello world', 'bf_lily', 1.0);
      expect(result).toBeDefined();

      // Should be back in hot cache
      const key = manager.keyGenerator.create('Hello world', 'bf_lily', 1.0);
      expect(manager.hotCache.has(key)).toBe(true);
    });

    it('should accurately track storage size', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio data here'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: []
      };

      // Store multiple entries
      await manager.set('text1', 'bf_lily', 1.0, audioData);
      await manager.set('text2', 'bf_lily', 1.0, audioData);

      const stats = await manager.getStats();
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.totalSize).toMatch(/KB|MB|GB|B/);
    });
  });
});
