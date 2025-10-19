import { describe, it, expect, beforeEach } from 'vitest';
import { CacheStats } from '../../../../src/shared/cache/CacheStats.js';

describe('CacheStats', () => {
  let stats;

  beforeEach(() => {
    stats = new CacheStats();
  });

  describe('initialization', () => {
    it('should initialize with zero hits and misses', () => {
      expect(stats.hits.hot).toBe(0);
      expect(stats.hits.warm).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should initialize with zero bytes saved', () => {
      expect(stats.bytesSaved).toBe(0);
    });
  });

  describe('recordHit', () => {
    it('should increment hot cache hits', () => {
      stats.recordHit('hot');
      expect(stats.hits.hot).toBe(1);
      expect(stats.hits.warm).toBe(0);
    });

    it('should increment warm cache hits', () => {
      stats.recordHit('warm');
      expect(stats.hits.hot).toBe(0);
      expect(stats.hits.warm).toBe(1);
    });

    it('should track bytes saved on hit', () => {
      const initialSaved = stats.bytesSaved;
      stats.recordHit('hot');

      expect(stats.bytesSaved).toBeGreaterThan(initialSaved);
    });

    it('should handle multiple hits', () => {
      stats.recordHit('hot');
      stats.recordHit('hot');
      stats.recordHit('warm');

      expect(stats.hits.hot).toBe(2);
      expect(stats.hits.warm).toBe(1);
    });
  });

  describe('recordMiss', () => {
    it('should increment miss count', () => {
      stats.recordMiss();
      expect(stats.misses).toBe(1);
    });

    it('should handle multiple misses', () => {
      stats.recordMiss();
      stats.recordMiss();
      stats.recordMiss();

      expect(stats.misses).toBe(3);
    });

    it('should not affect bytes saved', () => {
      const initialSaved = stats.bytesSaved;
      stats.recordMiss();

      expect(stats.bytesSaved).toBe(initialSaved);
    });
  });

  describe('recordStore', () => {
    it('should add to bytes stored', () => {
      stats.recordStore(1000);
      expect(stats.bytesStored).toBe(1000);
    });

    it('should accumulate multiple stores', () => {
      stats.recordStore(1000);
      stats.recordStore(2000);
      stats.recordStore(500);

      expect(stats.bytesStored).toBe(3500);
    });

    it('should handle zero bytes', () => {
      stats.recordStore(0);
      expect(stats.bytesStored).toBe(0);
    });

    it('should increment store count', () => {
      stats.recordStore(1000);
      stats.recordStore(2000);

      expect(stats.stores).toBe(2);
    });
  });

  describe('getTotalHits', () => {
    it('should return sum of hot and warm hits', () => {
      stats.recordHit('hot');
      stats.recordHit('hot');
      stats.recordHit('warm');

      expect(stats.getTotalHits()).toBe(3);
    });

    it('should return 0 when no hits', () => {
      expect(stats.getTotalHits()).toBe(0);
    });
  });

  describe('getHitRate', () => {
    it('should return 0% when no requests', () => {
      expect(stats.getHitRate()).toBe(0);
    });

    it('should calculate hit rate correctly', () => {
      stats.recordHit('hot');
      stats.recordHit('warm');
      stats.recordMiss();
      stats.recordMiss();

      // 2 hits, 2 misses = 50%
      expect(stats.getHitRate()).toBe(50);
    });

    it('should return 100% when all hits', () => {
      stats.recordHit('hot');
      stats.recordHit('hot');
      stats.recordHit('warm');

      expect(stats.getHitRate()).toBe(100);
    });

    it('should return 0% when all misses', () => {
      stats.recordMiss();
      stats.recordMiss();
      stats.recordMiss();

      expect(stats.getHitRate()).toBe(0);
    });

    it('should handle decimal percentages', () => {
      stats.recordHit('hot');
      stats.recordMiss();
      stats.recordMiss();

      // 1 hit, 2 misses = 33.33...%
      expect(stats.getHitRate()).toBeCloseTo(33.33, 2);
    });
  });

  describe('toObject', () => {
    it('should return formatted statistics object', () => {
      stats.recordHit('hot');
      stats.recordHit('warm');
      stats.recordMiss();
      stats.recordStore(1024 * 1024); // 1 MB

      const obj = stats.toObject();

      expect(obj).toHaveProperty('hits');
      expect(obj).toHaveProperty('misses');
      expect(obj).toHaveProperty('hitRate');
      expect(obj).toHaveProperty('bytesSaved');
      expect(obj).toHaveProperty('bytesStored');
      expect(obj).toHaveProperty('stores');
      expect(obj).toHaveProperty('evictions');
    });

    it('should format hit rate as percentage string', () => {
      stats.recordHit('hot');
      stats.recordMiss();

      const obj = stats.toObject();

      expect(obj.hitRate).toBe('50.00%');
    });

    it('should format bytes as human-readable strings', () => {
      stats.recordHit('hot'); // Adds to bytesSaved
      stats.recordStore(1024 * 1024); // 1 MB

      const obj = stats.toObject();

      expect(obj.bytesSaved).toMatch(/MB|KB|B/);
      expect(obj.bytesStored).toMatch(/MB|KB|B/);
    });

    it('should include numeric values', () => {
      stats.recordHit('hot');
      stats.recordHit('warm');
      stats.recordMiss();

      const obj = stats.toObject();

      expect(obj.hits.hot).toBe(1);
      expect(obj.hits.warm).toBe(1);
      expect(obj.misses).toBe(1);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(stats.formatBytes(0)).toBe('0 B');
      expect(stats.formatBytes(500)).toBe('500 B');
      expect(stats.formatBytes(1024)).toBe('1.00 KB');
      expect(stats.formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(stats.formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('should handle decimal values', () => {
      expect(stats.formatBytes(1536)).toBe('1.50 KB'); // 1.5 KB
      expect(stats.formatBytes(2.5 * 1024 * 1024)).toBe('2.50 MB');
    });

    it('should handle large values', () => {
      const largeValue = 100 * 1024 * 1024 * 1024; // 100 GB
      expect(stats.formatBytes(largeValue)).toBe('100.00 GB');
    });
  });

  describe('reset', () => {
    it('should reset all counters to zero', () => {
      stats.recordHit('hot');
      stats.recordHit('warm');
      stats.recordMiss();
      stats.recordStore(1000);

      stats.reset();

      expect(stats.hits.hot).toBe(0);
      expect(stats.hits.warm).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.bytesSaved).toBe(0);
      expect(stats.bytesStored).toBe(0);
    });

    it('should allow recording after reset', () => {
      stats.recordHit('hot');
      stats.reset();
      stats.recordHit('warm');

      expect(stats.hits.hot).toBe(0);
      expect(stats.hits.warm).toBe(1);
    });
  });

  describe('integration scenarios', () => {
    it('should track realistic cache usage', () => {
      // Simulate cache usage: 70% hit rate
      for (let i = 0; i < 7; i++) {
        stats.recordHit(i % 2 === 0 ? 'hot' : 'warm');
      }
      for (let i = 0; i < 3; i++) {
        stats.recordMiss();
      }

      expect(stats.getHitRate()).toBe(70);
      expect(stats.getTotalHits()).toBe(7);
      expect(stats.misses).toBe(3);
    });

    it('should track storage over time', () => {
      // Simulate storing multiple entries
      stats.recordStore(500 * 1024);  // 500 KB
      stats.recordStore(1024 * 1024); // 1 MB
      stats.recordStore(250 * 1024);  // 250 KB

      const totalMB = (500 + 1024 + 250) / 1024;
      expect(stats.bytesStored).toBe((500 + 1024 + 250) * 1024);

      const obj = stats.toObject();
      expect(obj.bytesStored).toContain('MB');
    });

    it('should track bandwidth savings', () => {
      // Each hit saves bandwidth
      stats.recordHit('hot');
      stats.recordHit('hot');
      stats.recordHit('warm');

      expect(stats.bytesSaved).toBeGreaterThan(0);

      const obj = stats.toObject();
      expect(obj.bytesSaved).toMatch(/MB|KB|B/);
    });
  });
});
