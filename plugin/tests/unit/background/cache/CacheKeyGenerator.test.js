import { describe, it, expect } from 'vitest';
import { CacheKeyGenerator } from '../../../../src/background/cache/CacheKeyGenerator.js';

describe('CacheKeyGenerator', () => {
  describe('generate', () => {
    it('should generate consistent keys for same input', async () => {
      const text = 'Hello world';
      const voiceId = 'af_bella';
      const speed = 1.0;

      const key1 = await CacheKeyGenerator.generate(text, voiceId, speed);
      const key2 = await CacheKeyGenerator.generate(text, voiceId, speed);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different text', async () => {
      const voiceId = 'af_bella';
      const speed = 1.0;

      const key1 = await CacheKeyGenerator.generate('Hello world', voiceId, speed);
      const key2 = await CacheKeyGenerator.generate('Goodbye world', voiceId, speed);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different voices', async () => {
      const text = 'Hello world';
      const speed = 1.0;

      const key1 = await CacheKeyGenerator.generate(text, 'af_bella', speed);
      const key2 = await CacheKeyGenerator.generate(text, 'af_sarah', speed);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different speeds', async () => {
      const text = 'Hello world';
      const voiceId = 'af_bella';

      const key1 = await CacheKeyGenerator.generate(text, voiceId, 1.0);
      const key2 = await CacheKeyGenerator.generate(text, voiceId, 1.5);

      expect(key1).not.toBe(key2);
    });

    it('should generate key in correct format', async () => {
      const key = await CacheKeyGenerator.generate('Hello', 'af_bella', 1.0);
      const parts = key.split('|');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // 32 hex chars
      expect(parts[1]).toBe('af_bella');
      expect(parts[2]).toBe('1.0');
    });

    it('should normalize speed to 1 decimal place', async () => {
      const key1 = await CacheKeyGenerator.generate('Hello', 'af_bella', 1.0);
      const key2 = await CacheKeyGenerator.generate('Hello', 'af_bella', 1.00000001);

      expect(key1).toBe(key2);
    });
  });

  describe('normalizeText', () => {
    it('should trim whitespace', () => {
      const result = CacheKeyGenerator.normalizeText('  Hello world  ');
      expect(result).toBe('Hello world');
    });

    it('should collapse multiple spaces', () => {
      const result = CacheKeyGenerator.normalizeText('Hello    world');
      expect(result).toBe('Hello world');
    });

    it('should remove zero-width characters', () => {
      const text = 'Hello\u200Bworld'; // Zero-width space
      const result = CacheKeyGenerator.normalizeText(text);
      expect(result).toBe('Helloworld');
    });

    it('should normalize unicode', () => {
      // é can be represented as single char or e + combining accent
      const text1 = 'café'; // Single char
      const text2 = 'cafe\u0301'; // Combining

      const result1 = CacheKeyGenerator.normalizeText(text1);
      const result2 = CacheKeyGenerator.normalizeText(text2);

      expect(result1).toBe(result2);
    });
  });

  describe('hashText', () => {
    it('should generate consistent hashes', async () => {
      const hash1 = await CacheKeyGenerator.hashText('Hello world');
      const hash2 = await CacheKeyGenerator.hashText('Hello world');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different text', async () => {
      const hash1 = await CacheKeyGenerator.hashText('Hello');
      const hash2 = await CacheKeyGenerator.hashText('Goodbye');

      expect(hash1).not.toBe(hash2);
    });

    it('should return 32 character hex string', async () => {
      const hash = await CacheKeyGenerator.hashText('Hello');

      expect(hash).toMatch(/^[0-9a-f]{32}$/);
      expect(hash.length).toBe(32);
    });
  });

  describe('parse', () => {
    it('should parse generated key correctly', async () => {
      const text = 'Hello world';
      const voiceId = 'af_bella';
      const speed = 1.5;

      const key = await CacheKeyGenerator.generate(text, voiceId, speed);
      const parsed = CacheKeyGenerator.parse(key);

      expect(parsed.voiceId).toBe(voiceId);
      expect(parsed.speed).toBe(speed);
      expect(parsed.textHash).toBeDefined();
      expect(parsed.textHash).toMatch(/^[0-9a-f]{32}$/);
    });
  });
});
