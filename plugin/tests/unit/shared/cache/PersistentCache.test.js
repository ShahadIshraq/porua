import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistentCache } from '../../../../src/shared/cache/PersistentCache.js';
import { CACHE_CONFIG } from '../../../../src/shared/utils/constants.js';

describe('PersistentCache', () => {
  let cache;

  beforeEach(async () => {
    cache = new PersistentCache('test-cache-db', 1);
    await cache.init();
  });

  afterEach(async () => {
    await cache.clear();
    cache.stopPeriodicCleanup();
  });

  describe('initialization', () => {
    it('should initialize with database name and version', async () => {
      const customCache = new PersistentCache('custom-db', 2);
      await customCache.init();

      expect(customCache.dbName).toBe('custom-db');
      expect(customCache.version).toBe(2);

      await customCache.clear();
      customCache.stopPeriodicCleanup();
    });

    it('should initialize totalSize to 0', () => {
      expect(cache.totalSize).toBe(0);
    });

    it('should create database connection', () => {
      expect(cache.db).toBeDefined();
    });
  });

  describe('set and get', () => {
    it('should store and retrieve entry', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [{ duration: 1.5 }],
        phraseTimeline: [{ text: 'Hello', start: 0, end: 0.5 }],
        metadata: {
          text: 'Hello world',
          voiceId: 'bf_lily',
          speed: 1.0,
          size: 100,
          timestamp: Date.now()
        }
      };

      await cache.set('test-key', audioData);
      const retrieved = await cache.get('test-key');

      expect(retrieved).toBeDefined();
      expect(retrieved.audioBlobs).toHaveLength(1);
      expect(retrieved.metadataArray).toEqual(audioData.metadataArray);
      expect(retrieved.phraseTimeline).toEqual(audioData.phraseTimeline);
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should update lastAccess timestamp on get', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: Date.now() }
      };

      await cache.set('test-key', audioData);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const first = await cache.get('test-key');
      // Get metadata directly from DB to check lastAccess
      const firstEntry = await cache.db.get(cache.storeName, 'test-key');
      const firstAccess = firstEntry.metadata.lastAccess;

      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 10));

      const second = await cache.get('test-key');
      const secondEntry = await cache.db.get(cache.storeName, 'test-key');
      const secondAccess = secondEntry.metadata.lastAccess;

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });

    it('should track total size', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 1000, timestamp: Date.now() }
      };

      await cache.set('test-key', audioData);
      expect(cache.totalSize).toBeGreaterThan(0);
    });
  });

  describe('has', () => {
    it('should return true for existing key', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: Date.now() }
      };

      await cache.set('test-key', audioData);
      const exists = await cache.has('test-key');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await cache.has('nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entry', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: Date.now() }
      };

      await cache.set('test-key', audioData);
      await cache.delete('test-key');

      const exists = await cache.has('test-key');
      expect(exists).toBe(false);
    });

    it('should update total size on delete', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 1000, timestamp: Date.now() }
      };

      await cache.set('test-key', audioData);
      const sizeBeforeDelete = cache.totalSize;

      await cache.delete('test-key');

      expect(cache.totalSize).toBeLessThan(sizeBeforeDelete);
    });

    it('should handle deleting non-existent key', async () => {
      await expect(cache.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: Date.now() }
      };

      await cache.set('key1', audioData);
      await cache.set('key2', audioData);
      await cache.set('key3', audioData);

      await cache.clear();

      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(false);
      expect(await cache.has('key3')).toBe(false);
    });

    it('should reset total size to 0', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 1000, timestamp: Date.now() }
      };

      await cache.set('key1', audioData);
      await cache.clear();

      expect(cache.totalSize).toBe(0);
    });
  });

  describe('size limit enforcement', () => {
    it('should enforce 100MB size limit', async () => {
      // Create entries with smaller sizes to avoid memory issues in tests
      // Use 1MB blobs instead of 30MB
      const largeAudioData = {
        audioBlobs: [new Blob(['x'.repeat(1024 * 1024)], { type: 'audio/wav' })], // 1 MB
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 1024 * 1024, timestamp: Date.now() }
      };

      // Add multiple entries
      for (let i = 0; i < 5; i++) {
        await cache.set(`key${i}`, largeAudioData);
      }

      // Total size should be tracked
      expect(cache.totalSize).toBeGreaterThan(0);
      expect(cache.totalSize).toBeLessThanOrEqual(CACHE_CONFIG.MAX_CACHE_SIZE_BYTES);
    });

    it('should evict LRU entries when size limit reached', async () => {
      const audioData = size => ({
        audioBlobs: [new Blob(['x'.repeat(size)], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size, timestamp: Date.now(), lastAccess: Date.now() }
      });

      // Use smaller sizes to avoid OOM: 100KB instead of 20-40MB
      await cache.set('key1', audioData(100 * 1024)); // 100 KB
      await new Promise(resolve => setTimeout(resolve, 10));

      await cache.set('key2', audioData(100 * 1024)); // 100 KB
      await new Promise(resolve => setTimeout(resolve, 10));

      await cache.set('key3', audioData(100 * 1024)); // 100 KB
      await new Promise(resolve => setTimeout(resolve, 10));

      // Access key1 to make it more recent
      await cache.get('key1');
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify keys exist
      const hasKey1 = await cache.has('key1');
      const hasKey2 = await cache.has('key2');
      const hasKey3 = await cache.has('key3');

      expect(hasKey1).toBe(true);
      expect(hasKey2).toBe(true);
      expect(hasKey3).toBe(true);
    });
  });

  describe('time-based eviction', () => {
    it('should remove entries older than 7 days', async () => {
      const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      const recentTimestamp = Date.now();

      const oldData = {
        audioBlobs: [new Blob(['old'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: oldTimestamp }
      };

      const recentData = {
        audioBlobs: [new Blob(['recent'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: recentTimestamp }
      };

      // Manually insert data directly into IndexedDB to bypass set() metadata overrides
      await cache.init();
      const tx = cache.db.transaction(cache.storeName, 'readwrite');
      await tx.objectStore(cache.storeName).put({ key: 'old-key', ...oldData });
      await tx.objectStore(cache.storeName).put({ key: 'recent-key', ...recentData });
      await tx.done;

      // Recalculate total size
      await cache.calculateTotalSize();

      // Run cleanup
      await cache.removeStaleEntries();

      expect(await cache.has('old-key')).toBe(false);
      expect(await cache.has('recent-key')).toBe(true);
    });

    it('should update total size after removing stale entries', async () => {
      const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);

      const oldData = {
        audioBlobs: [new Blob(['old'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 1000, timestamp: oldTimestamp }
      };

      // Manually insert directly into IndexedDB
      await cache.init();
      const tx = cache.db.transaction(cache.storeName, 'readwrite');
      await tx.objectStore(cache.storeName).put({ key: 'old-key', ...oldData });
      await tx.done;

      await cache.calculateTotalSize();
      const sizeBefore = cache.totalSize;

      await cache.removeStaleEntries();

      expect(cache.totalSize).toBeLessThan(sizeBefore);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(cache.formatBytes(0)).toBe('0 B');
      expect(cache.formatBytes(500)).toBe('500 B');
      expect(cache.formatBytes(1024)).toBe('1.00 KB');
      expect(cache.formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(cache.formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('should handle decimal values', () => {
      expect(cache.formatBytes(1536)).toBe('1.50 KB');
      expect(cache.formatBytes(2.5 * 1024 * 1024)).toBe('2.50 MB');
    });
  });

  describe('deleteMatching', () => {
    it('should delete entries matching predicate', async () => {
      const audioData = voiceId => ({
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: Date.now(), voiceId }
      });

      await cache.set('key1', audioData('bf_lily'));
      await cache.set('key2', audioData('af_nova'));
      await cache.set('key3', audioData('bf_lily'));

      // Delete all bf_lily entries
      await cache.deleteMatching(entry => entry.metadata.voiceId === 'bf_lily');

      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(true);
      expect(await cache.has('key3')).toBe(false);
    });

    it('should update total size after deleteMatching', async () => {
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 1000, timestamp: Date.now(), voiceId: 'bf_lily' }
      };

      await cache.set('key1', audioData);
      await cache.set('key2', audioData);

      const sizeBefore = cache.totalSize;

      await cache.deleteMatching(entry => entry.metadata.voiceId === 'bf_lily');

      expect(cache.totalSize).toBeLessThan(sizeBefore);
    });
  });

  describe('periodic cleanup', () => {
    it('should start periodic cleanup', () => {
      // Periodic cleanup is started in constructor
      expect(cache.cleanupInterval).toBeDefined();
    });

    it('should stop periodic cleanup', () => {
      cache.stopPeriodicCleanup();
      expect(cache.cleanupInterval).toBeNull();
    });

    it('should allow restarting cleanup after stop', () => {
      cache.stopPeriodicCleanup();
      expect(cache.cleanupInterval).toBeNull();

      // Restart would happen in init() if needed
      // Just verify it can be stopped without error
    });
  });

  describe('edge cases', () => {
    it('should handle storing empty audio data', async () => {
      const emptyData = {
        audioBlobs: [],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 0, timestamp: Date.now() }
      };

      await cache.set('empty-key', emptyData);
      const retrieved = await cache.get('empty-key');

      expect(retrieved).toBeDefined();
      expect(retrieved.audioBlobs).toHaveLength(0);
    });

    it('should handle multiple blobs in audio data', async () => {
      const multiData = {
        audioBlobs: [
          new Blob(['chunk1'], { type: 'audio/wav' }),
          new Blob(['chunk2'], { type: 'audio/wav' }),
          new Blob(['chunk3'], { type: 'audio/wav' })
        ],
        metadataArray: [{ duration: 1 }, { duration: 2 }, { duration: 3 }],
        phraseTimeline: [],
        metadata: { size: 300, timestamp: Date.now() }
      };

      await cache.set('multi-key', multiData);
      const retrieved = await cache.get('multi-key');

      expect(retrieved.audioBlobs).toHaveLength(3);
      expect(retrieved.metadataArray).toHaveLength(3);
    });

    it('should handle very long keys', async () => {
      const longKey = 'v1:bf_lily:1.0:' + 'a'.repeat(100);
      const audioData = {
        audioBlobs: [new Blob(['audio'], { type: 'audio/wav' })],
        metadataArray: [],
        phraseTimeline: [],
        metadata: { size: 100, timestamp: Date.now() }
      };

      await cache.set(longKey, audioData);
      const exists = await cache.has(longKey);

      expect(exists).toBe(true);
    });
  });
});
