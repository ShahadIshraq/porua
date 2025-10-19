import { describe, it, expect } from 'vitest';
import { CacheKeyGenerator } from '../../../../src/shared/cache/CacheKeyGenerator.js';

describe('CacheKeyGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new CacheKeyGenerator();
  });

  describe('create', () => {
    it('should create cache key with version, voice, speed, and text hash', () => {
      const key = generator.create('Hello world', 'bf_lily', 1.0);

      expect(key).toMatch(/^v1:bf_lily:1:[\da-f]{8}$/);
    });

    it('should create different keys for different texts', () => {
      const key1 = generator.create('Hello world', 'bf_lily', 1.0);
      const key2 = generator.create('Goodbye world', 'bf_lily', 1.0);

      expect(key1).not.toBe(key2);
    });

    it('should create different keys for different voices', () => {
      const key1 = generator.create('Hello world', 'bf_lily', 1.0);
      const key2 = generator.create('Hello world', 'af_nova', 1.0);

      expect(key1).not.toBe(key2);
    });

    it('should create different keys for different speeds', () => {
      const key1 = generator.create('Hello world', 'bf_lily', 1.0);
      const key2 = generator.create('Hello world', 'bf_lily', 1.5);

      expect(key1).not.toBe(key2);
    });

    it('should create same key for same inputs', () => {
      const key1 = generator.create('Hello world', 'bf_lily', 1.0);
      const key2 = generator.create('Hello world', 'bf_lily', 1.0);

      expect(key1).toBe(key2);
    });

    it('should trim whitespace from text', () => {
      const key1 = generator.create('  Hello world  ', 'bf_lily', 1.0);
      const key2 = generator.create('Hello world', 'bf_lily', 1.0);

      // Should normalize trim but preserve internal whitespace
      expect(key1).toBe(key2);
    });

    it('should normalize case in text', () => {
      const key1 = generator.create('HELLO WORLD', 'bf_lily', 1.0);
      const key2 = generator.create('hello world', 'bf_lily', 1.0);

      expect(key1).toBe(key2);
    });

    it('should handle speed as integer in key', () => {
      const key1 = generator.create('Hello', 'bf_lily', 1.0);
      const key2 = generator.create('Hello', 'bf_lily', 1.5);

      expect(key1).toContain(':1:');
      expect(key2).toContain(':1.5:');
    });
  });

  describe('hashText', () => {
    it('should generate consistent hash for same text', () => {
      const hash1 = generator.hashText('Hello world');
      const hash2 = generator.hashText('Hello world');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different text', () => {
      const hash1 = generator.hashText('Hello world');
      const hash2 = generator.hashText('Goodbye world');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize text before hashing (trim and lowercase)', () => {
      const hash1 = generator.hashText('  HELLO WORLD  ');
      const hash2 = generator.hashText('hello world');

      // Trims and lowercases, but preserves internal whitespace
      expect(hash1).toBe(hash2);
    });

    it('should generate 8-character hex hash', () => {
      const hash = generator.hashText('Test text');

      expect(hash).toMatch(/^[\da-f]{8}$/);
    });

    it('should handle empty string', () => {
      const hash = generator.hashText('');

      expect(hash).toMatch(/^[\da-f]{8}$/);
    });

    it('should handle unicode characters', () => {
      const hash1 = generator.hashText('Hello 世界');
      const hash2 = generator.hashText('Hello 世界');

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[\da-f]{8}$/);
    });

    it('should use FNV-1a algorithm properties', () => {
      // FNV-1a should produce different hashes for similar strings
      const hash1 = generator.hashText('abc');
      const hash2 = generator.hashText('abd');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('version handling', () => {
    it('should use version 1 by default', () => {
      const key = generator.create('Test', 'bf_lily', 1.0);

      expect(key).toMatch(/^v1:/);
    });

    it('should support custom version', () => {
      const customGenerator = new CacheKeyGenerator(2);
      const key = customGenerator.create('Test', 'bf_lily', 1.0);

      expect(key).toMatch(/^v2:/);
    });

    it('should create different keys for different versions', () => {
      const gen1 = new CacheKeyGenerator(1);
      const gen2 = new CacheKeyGenerator(2);

      const key1 = gen1.create('Test', 'bf_lily', 1.0);
      const key2 = gen2.create('Test', 'bf_lily', 1.0);

      expect(key1).not.toBe(key2);
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const key = generator.create(longText, 'bf_lily', 1.0);

      expect(key).toMatch(/^v1:bf_lily:1:[\da-f]{8}$/);
    });

    it('should handle special characters in text', () => {
      const text = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const key = generator.create(text, 'bf_lily', 1.0);

      expect(key).toMatch(/^v1:bf_lily:1:[\da-f]{8}$/);
    });

    it('should handle decimal speeds', () => {
      const key = generator.create('Test', 'bf_lily', 0.75);

      expect(key).toContain(':0.75:');
    });

    it('should handle voice IDs with special characters', () => {
      const key = generator.create('Test', 'voice-with-dashes', 1.0);

      expect(key).toContain(':voice-with-dashes:');
    });
  });
});
