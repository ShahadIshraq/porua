import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioRegistry } from '../../../../src/content/audio/AudioRegistry.js';
import { ChunkId } from '../../../../src/content/audio/ChunkId.js';

// Mock dependencies
vi.mock('idb');
vi.mock('../../../../src/shared/cache/AudioCacheManager.js', () => ({
  AudioCacheManager: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn()
  }))
}));

describe('AudioRegistry', () => {
  let registry;
  let mockAudioData;

  beforeEach(() => {
    registry = new AudioRegistry({
      hotCacheSize: 1000,
      warmCacheSize: 5000
    });

    mockAudioData = {
      audioBlobs: [
        new Blob(['chunk0']),
        new Blob(['chunk1']),
        new Blob(['chunk2'])
      ],
      metadataArray: [
        { start_offset_ms: 0, phrases: [] },
        { start_offset_ms: 5000, phrases: [] },
        { start_offset_ms: 10000, phrases: [] }
      ],
      phraseTimeline: []
    };
  });

  describe('constructor', () => {
    it('should generate unique session ID', () => {
      const registry1 = new AudioRegistry();
      const registry2 = new AudioRegistry();

      expect(registry1.sessionId).toBeTruthy();
      expect(registry1.sessionId).not.toBe(registry2.sessionId);
    });

    it('should initialize empty state', () => {
      expect(registry.chunkIndex.size).toBe(0);
      expect(registry.paragraphMap.size).toBe(0);
      expect(registry.totalChunks).toBe(0);
    });
  });

  describe('registerParagraph', () => {
    it('should register paragraph chunks', async () => {
      await registry.registerParagraph(0, 'Test paragraph', mockAudioData, 'voice1', 1.0);

      expect(registry.totalChunks).toBe(3);
      expect(registry.paragraphMap.has(0)).toBe(true);
      expect(registry.paragraphMap.get(0).length).toBe(3);
    });

    it('should create ChunkId for each blob', async () => {
      await registry.registerParagraph(0, 'Test paragraph', mockAudioData, 'voice1', 1.0);

      const chunks = registry.paragraphMap.get(0);

      expect(chunks[0].paragraphIndex).toBe(0);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[1].chunkIndex).toBe(1);
      expect(chunks[2].chunkIndex).toBe(2);
    });

    it('should store metadata for each chunk', async () => {
      await registry.registerParagraph(0, 'Test paragraph', mockAudioData, 'voice1', 1.0);

      const chunks = registry.paragraphMap.get(0);
      const metadata = registry.getMetadata(chunks[0]);

      expect(metadata).toBeTruthy();
      expect(metadata.startOffsetMs).toBe(0);
      expect(metadata.paragraphIndex).toBe(0);
    });

    it('should store blobs in hot cache', async () => {
      await registry.registerParagraph(0, 'Test paragraph', mockAudioData, 'voice1', 1.0);

      const chunks = registry.paragraphMap.get(0);
      const blob = registry.hotCache.get(chunks[0]);

      expect(blob).toBeTruthy();
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for chunk', async () => {
      await registry.registerParagraph(0, 'Test', mockAudioData, 'voice1', 1.0);

      const chunks = registry.paragraphMap.get(0);
      const metadata = registry.getMetadata(chunks[0]);

      expect(metadata).toBeTruthy();
      expect(metadata.chunkId.equals(chunks[0])).toBe(true);
    });

    it('should return null for non-existent chunk', () => {
      const fakeId = new ChunkId('fake', 99, 99);
      const metadata = registry.getMetadata(fakeId);

      expect(metadata).toBeNull();
    });
  });

  describe('getParagraphChunks', () => {
    it('should return all chunks for paragraph', async () => {
      await registry.registerParagraph(0, 'Test', mockAudioData, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);

      expect(chunks.length).toBe(3);
    });

    it('should return empty array for non-existent paragraph', () => {
      const chunks = registry.getParagraphChunks(99);

      expect(chunks).toEqual([]);
    });
  });

  describe('getNextChunks', () => {
    beforeEach(async () => {
      await registry.registerParagraph(0, 'Para 0', mockAudioData, 'voice1', 1.0);
      await registry.registerParagraph(1, 'Para 1', mockAudioData, 'voice1', 1.0);
    });

    it('should return next chunks in same paragraph', () => {
      const chunks = registry.getParagraphChunks(0);
      const nextChunks = registry.getNextChunks(chunks[0], 2);

      expect(nextChunks.length).toBe(2);
      expect(nextChunks[0].equals(chunks[1])).toBe(true);
      expect(nextChunks[1].equals(chunks[2])).toBe(true);
    });

    it('should cross paragraph boundaries', () => {
      const para0Chunks = registry.getParagraphChunks(0);
      const lastChunk = para0Chunks[para0Chunks.length - 1];

      const nextChunks = registry.getNextChunks(lastChunk, 2);

      expect(nextChunks.length).toBeGreaterThan(0);
      // First chunk should be from paragraph 1
      expect(nextChunks[0].paragraphIndex).toBe(1);
    });

    it('should respect count limit', () => {
      const chunks = registry.getParagraphChunks(0);
      const nextChunks = registry.getNextChunks(chunks[0], 1);

      expect(nextChunks.length).toBe(1);
    });
  });

  describe('findChunkAtTime', () => {
    beforeEach(async () => {
      await registry.registerParagraph(0, 'Test', mockAudioData, 'voice1', 1.0);

      // Set durations
      const chunks = registry.getParagraphChunks(0);
      registry.updateChunkDuration(chunks[0], 5000);
      registry.updateChunkDuration(chunks[1], 5000);
      registry.updateChunkDuration(chunks[2], 5000);
    });

    it('should find chunk at start time', () => {
      const result = registry.findChunkAtTime(0);

      expect(result).toBeTruthy();
      expect(result.chunkId.chunkIndex).toBe(0);
      expect(result.localTimeMs).toBe(0);
    });

    it('should find chunk in middle', () => {
      const result = registry.findChunkAtTime(7000);

      expect(result).toBeTruthy();
      expect(result.chunkId.chunkIndex).toBe(1);
      expect(result.localTimeMs).toBe(2000); // 7000 - 5000
    });

    it('should return null for out of range time', () => {
      const result = registry.findChunkAtTime(99999999);

      expect(result).toBeNull();
    });

    it('should clamp negative time to zero', () => {
      const result = registry.findChunkAtTime(-1000);

      expect(result).toBeTruthy();
      expect(result.chunkId.chunkIndex).toBe(0);
    });
  });

  describe('updateChunkDuration', () => {
    it('should update chunk duration', async () => {
      await registry.registerParagraph(0, 'Test', mockAudioData, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      registry.updateChunkDuration(chunks[0], 5000);

      const metadata = registry.getMetadata(chunks[0]);
      expect(metadata.durationMs).toBe(5000);
    });

    it('should recalculate total duration', async () => {
      await registry.registerParagraph(0, 'Test', mockAudioData, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      registry.updateChunkDuration(chunks[0], 5000);
      registry.updateChunkDuration(chunks[1], 5000);
      registry.updateChunkDuration(chunks[2], 5000);

      expect(registry.totalDurationMs).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should reset all state', async () => {
      await registry.registerParagraph(0, 'Test', mockAudioData, 'voice1', 1.0);

      await registry.clear();

      expect(registry.chunkIndex.size).toBe(0);
      expect(registry.paragraphMap.size).toBe(0);
      expect(registry.totalChunks).toBe(0);
      expect(registry.totalDurationMs).toBe(0);
    });

    it('should generate new session ID', async () => {
      const oldSessionId = registry.sessionId;

      await registry.clear();

      expect(registry.sessionId).not.toBe(oldSessionId);
    });
  });
});
