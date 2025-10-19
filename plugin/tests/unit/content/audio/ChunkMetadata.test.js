import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkMetadata } from '../../../../src/content/audio/ChunkMetadata.js';
import { ChunkId } from '../../../../src/content/audio/ChunkId.js';

describe('ChunkMetadata', () => {
  let chunkId;

  beforeEach(() => {
    chunkId = new ChunkId('session123', 0, 0);
  });

  describe('constructor', () => {
    it('should create metadata with required properties', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 1000,
        paragraphIndex: 0,
        size: 50000
      });

      expect(metadata.chunkId).toBe(chunkId);
      expect(metadata.startOffsetMs).toBe(1000);
      expect(metadata.paragraphIndex).toBe(0);
      expect(metadata.size).toBe(50000);
    });

    it('should set default values', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        size: 1000
      });

      expect(metadata.durationMs).toBe(0);
      expect(metadata.storageLocation).toBe('hot');
      expect(metadata.phrases).toEqual([]);
      expect(metadata.paragraphText).toBe('');
    });

    it('should truncate paragraph text to 50 chars', () => {
      const longText = 'a'.repeat(100);
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        paragraphText: longText,
        size: 1000
      });

      expect(metadata.paragraphText).toBe('a'.repeat(50));
    });

    it('should initialize access tracking', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        size: 1000
      });

      expect(metadata.accessCount).toBe(0);
      expect(metadata.lastAccess).toBeGreaterThan(0);
    });
  });

  describe('getEndOffsetMs', () => {
    it('should calculate end time', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 5000,
        durationMs: 3000,
        paragraphIndex: 0,
        size: 1000
      });

      expect(metadata.getEndOffsetMs()).toBe(8000);
    });

    it('should handle zero duration', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 5000,
        durationMs: 0,
        paragraphIndex: 0,
        size: 1000
      });

      expect(metadata.getEndOffsetMs()).toBe(5000);
    });
  });

  describe('containsTime', () => {
    let metadata;

    beforeEach(() => {
      metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 5000,
        durationMs: 3000,
        paragraphIndex: 0,
        size: 1000
      });
    });

    it('should return true for time at start', () => {
      expect(metadata.containsTime(5000)).toBe(true);
    });

    it('should return true for time in middle', () => {
      expect(metadata.containsTime(6500)).toBe(true);
    });

    it('should return false for time at end', () => {
      expect(metadata.containsTime(8000)).toBe(false);
    });

    it('should return false for time before start', () => {
      expect(metadata.containsTime(4999)).toBe(false);
    });

    it('should return false for time after end', () => {
      expect(metadata.containsTime(8001)).toBe(false);
    });
  });

  describe('recordAccess', () => {
    it('should increment access count', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        size: 1000
      });

      const initialCount = metadata.accessCount;
      metadata.recordAccess();

      expect(metadata.accessCount).toBe(initialCount + 1);
    });

    it('should update last access time', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        size: 1000
      });

      const initialTime = metadata.lastAccess;
      setTimeout(() => {
        metadata.recordAccess();
        expect(metadata.lastAccess).toBeGreaterThanOrEqual(initialTime);
      }, 10);
    });
  });

  describe('setStorageLocation', () => {
    it('should update storage location', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        size: 1000
      });

      expect(metadata.storageLocation).toBe('hot');

      metadata.setStorageLocation('warm');
      expect(metadata.storageLocation).toBe('warm');

      metadata.setStorageLocation('cold');
      expect(metadata.storageLocation).toBe('cold');
    });
  });

  describe('setDuration', () => {
    it('should update duration', () => {
      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        size: 1000
      });

      expect(metadata.durationMs).toBe(0);

      metadata.setDuration(5000);
      expect(metadata.durationMs).toBe(5000);
    });
  });

  describe('phrases', () => {
    it('should store phrase data', () => {
      const phrases = [
        { text: 'Hello', start_time_ms: 0, end_time_ms: 500 },
        { text: 'World', start_time_ms: 500, end_time_ms: 1000 }
      ];

      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: 0,
        paragraphIndex: 0,
        size: 1000,
        phrases
      });

      expect(metadata.phrases).toEqual(phrases);
      expect(metadata.phrases.length).toBe(2);
    });
  });
});
