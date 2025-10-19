import { describe, it, expect, beforeEach } from 'vitest';
import { LRUCache } from '../../../../src/shared/cache/LRUCache.js';

describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3); // Small size for easier testing
  });

  describe('constructor', () => {
    it('should create cache with default size 5', () => {
      const defaultCache = new LRUCache();
      expect(defaultCache.maxSize).toBe(5);
    });

    it('should create cache with custom size', () => {
      const customCache = new LRUCache(10);
      expect(customCache.maxSize).toBe(10);
    });

    it('should initialize with size 0', () => {
      expect(cache.size).toBe(0);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should update existing value', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });

    it('should increase size when adding new entries', () => {
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });

    it('should not increase size when updating existing entry', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.size).toBe(1);
    });

    it('should store different types of values', () => {
      cache.set('string', 'text');
      cache.set('number', 42);
      cache.set('object', { foo: 'bar' });

      expect(cache.get('string')).toBe('text');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('object')).toEqual({ foo: 'bar' });
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when capacity exceeded', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should not exceed max size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      expect(cache.size).toBe(3);
    });

    it('should update recency on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it most recent
      cache.get('key1');

      // Add new item - should evict key2 (least recent)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1'); // Still present
      expect(cache.get('key2')).toBeNull();      // Evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update recency on set of existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update key1 to make it most recent
      cache.set('key1', 'updated');

      // Add new item - should evict key2 (least recent)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('updated'); // Still present
      expect(cache.get('key2')).toBeNull();      // Evicted
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false after eviction', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Evicts key1

      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entry', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');

      expect(cache.get('key1')).toBeNull();
      expect(cache.has('key1')).toBe(false);
    });

    it('should decrease size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.delete('key1');

      expect(cache.size).toBe(1);
    });

    it('should handle deleting non-existent key', () => {
      cache.set('key1', 'value1');
      cache.delete('nonexistent');

      expect(cache.size).toBe(1);
    });

    it('should allow re-adding deleted key', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      cache.set('key1', 'value2');

      expect(cache.get('key1')).toBe('value2');
      expect(cache.size).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });

    it('should allow adding after clear', () => {
      cache.set('key1', 'value1');
      cache.clear();
      cache.set('key2', 'value2');

      expect(cache.get('key2')).toBe('value2');
      expect(cache.size).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle cache size of 1', () => {
      const tinyCache = new LRUCache(1);
      tinyCache.set('key1', 'value1');
      tinyCache.set('key2', 'value2');

      expect(tinyCache.size).toBe(1);
      expect(tinyCache.get('key1')).toBeNull();
      expect(tinyCache.get('key2')).toBe('value2');
    });

    it('should handle many operations', () => {
      const largeCache = new LRUCache(100);

      // Add 150 items
      for (let i = 0; i < 150; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }

      expect(largeCache.size).toBe(100);

      // First 50 should be evicted
      expect(largeCache.get('key0')).toBeNull();
      expect(largeCache.get('key49')).toBeNull();

      // Last 100 should be present
      expect(largeCache.get('key50')).toBe('value50');
      expect(largeCache.get('key149')).toBe('value149');
    });

    it('should handle null and undefined values', () => {
      cache.set('null', null);
      cache.set('undefined', undefined);

      expect(cache.get('null')).toBeNull();
      expect(cache.get('undefined')).toBeUndefined();
      expect(cache.has('null')).toBe(true);
      expect(cache.has('undefined')).toBe(true);
    });

    it('should handle complex objects', () => {
      const complexObj = {
        nested: { deep: { value: 42 } },
        array: [1, 2, { x: 3 }],
        func: () => 'test'
      };

      cache.set('complex', complexObj);
      const retrieved = cache.get('complex');

      expect(retrieved).toBe(complexObj); // Same reference
      expect(retrieved.nested.deep.value).toBe(42);
    });
  });

  describe('performance characteristics', () => {
    it('should have O(1) get operation', () => {
      const largeCache = new LRUCache(1000);

      // Fill cache
      for (let i = 0; i < 1000; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }

      // Get should be fast regardless of cache size
      const start = performance.now();
      largeCache.get('key500');
      const end = performance.now();

      expect(end - start).toBeLessThan(1); // Should be nearly instant
    });

    it('should have O(1) set operation', () => {
      const largeCache = new LRUCache(1000);

      // Fill cache
      for (let i = 0; i < 1000; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }

      // Set should be fast regardless of cache size
      const start = performance.now();
      largeCache.set('newKey', 'newValue');
      const end = performance.now();

      expect(end - start).toBeLessThan(1); // Should be nearly instant
    });
  });
});
