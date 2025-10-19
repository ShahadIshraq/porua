import { describe, it, expect } from 'vitest';
import { ChunkId } from '../../../../src/content/audio/ChunkId.js';

describe('ChunkId', () => {
  describe('constructor', () => {
    it('should create ChunkId with correct properties', () => {
      const chunkId = new ChunkId('session123', 5, 10);

      expect(chunkId.sessionId).toBe('session123');
      expect(chunkId.paragraphIndex).toBe(5);
      expect(chunkId.chunkIndex).toBe(10);
    });
  });

  describe('toString', () => {
    it('should convert to string format', () => {
      const chunkId = new ChunkId('session123', 5, 10);

      expect(chunkId.toString()).toBe('session123:5:10');
    });

    it('should handle zero indices', () => {
      const chunkId = new ChunkId('session456', 0, 0);

      expect(chunkId.toString()).toBe('session456:0:0');
    });
  });

  describe('fromString', () => {
    it('should parse valid string', () => {
      const chunkId = ChunkId.fromString('session123:5:10');

      expect(chunkId.sessionId).toBe('session123');
      expect(chunkId.paragraphIndex).toBe(5);
      expect(chunkId.chunkIndex).toBe(10);
    });

    it('should parse with zero indices', () => {
      const chunkId = ChunkId.fromString('session456:0:0');

      expect(chunkId.sessionId).toBe('session456');
      expect(chunkId.paragraphIndex).toBe(0);
      expect(chunkId.chunkIndex).toBe(0);
    });

    it('should throw on invalid string format', () => {
      expect(() => ChunkId.fromString('invalid')).toThrow();
      expect(() => ChunkId.fromString('session:5')).toThrow();
      expect(() => ChunkId.fromString('session:5:10:extra')).toThrow();
    });
  });

  describe('equals', () => {
    it('should return true for equal ChunkIds', () => {
      const chunk1 = new ChunkId('session123', 5, 10);
      const chunk2 = new ChunkId('session123', 5, 10);

      expect(chunk1.equals(chunk2)).toBe(true);
    });

    it('should return false for different sessionId', () => {
      const chunk1 = new ChunkId('session123', 5, 10);
      const chunk2 = new ChunkId('session456', 5, 10);

      expect(chunk1.equals(chunk2)).toBe(false);
    });

    it('should return false for different paragraphIndex', () => {
      const chunk1 = new ChunkId('session123', 5, 10);
      const chunk2 = new ChunkId('session123', 6, 10);

      expect(chunk1.equals(chunk2)).toBe(false);
    });

    it('should return false for different chunkIndex', () => {
      const chunk1 = new ChunkId('session123', 5, 10);
      const chunk2 = new ChunkId('session123', 5, 11);

      expect(chunk1.equals(chunk2)).toBe(false);
    });

    it('should return false for null', () => {
      const chunk1 = new ChunkId('session123', 5, 10);

      expect(chunk1.equals(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      const chunk1 = new ChunkId('session123', 5, 10);

      expect(chunk1.equals(undefined)).toBe(false);
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      const original = new ChunkId('session123', 5, 10);
      const clone = original.clone();

      expect(clone).not.toBe(original);
      expect(clone.equals(original)).toBe(true);
    });

    it('should not affect original when modified', () => {
      const original = new ChunkId('session123', 5, 10);
      const clone = original.clone();

      clone.chunkIndex = 20;

      expect(original.chunkIndex).toBe(10);
      expect(clone.chunkIndex).toBe(20);
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data through toString and fromString', () => {
      const original = new ChunkId('session789', 15, 25);
      const str = original.toString();
      const restored = ChunkId.fromString(str);

      expect(restored.equals(original)).toBe(true);
    });
  });
});
