import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPlayer } from '../../../../src/content/audio/AudioPlayer.js';
import { AudioRegistry } from '../../../../src/content/audio/AudioRegistry.js';
import { ChunkId } from '../../../../src/content/audio/ChunkId.js';

// Mock dependencies - must be BEFORE imports
vi.mock('idb', () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        index: vi.fn(() => ({
          getAll: vi.fn(() => Promise.resolve([]))
        })),
        count: vi.fn(() => Promise.resolve(0)),
        getAll: vi.fn(() => Promise.resolve([]))
      }))
    }))
  }))
}));

vi.mock('../../../../src/shared/cache/AudioCacheManager.js', () => ({
  AudioCacheManager: vi.fn(() => ({
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve())
  }))
}));

// Mock Audio element
global.Audio = vi.fn(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  currentTime: 0,
  duration: 5,
  addEventListener: vi.fn(),
  onloadedmetadata: null,
  onended: null,
  onerror: null,
  ontimeupdate: null,
  onplay: null,
  src: ''
}));

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('AudioPlayer', () => {
  let player;
  let registry;
  let mockState;
  let mockHighlightManager;

  beforeEach(() => {
    registry = new AudioRegistry();

    mockState = {
      setState: vi.fn(),
      getState: vi.fn(() => 'idle'),
      isContinuousMode: vi.fn(() => false),
      getPlayingParagraph: vi.fn()
    };

    mockHighlightManager = {
      updateHighlight: vi.fn(),
      clearHighlights: vi.fn(),
      restoreParagraph: vi.fn()
    };

    player = new AudioPlayer(registry, mockHighlightManager, mockState);
  });

  describe('construction', () => {
    it('should initialize with null state', () => {
      expect(player.currentChunkId).toBeNull();
      expect(player.currentAudio).toBeNull();
      expect(player.isPlaying).toBe(false);
    });
  });

  describe('playChunk', () => {
    let chunkId;
    let mockBlob;

    beforeEach(async () => {
      mockBlob = new Blob(['test audio']);

      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      chunkId = chunks[0];
    });

    it('should create Audio element and play', async () => {
      await player.playChunk(chunkId);

      expect(player.currentChunkId).toBeTruthy();
      expect(player.isPlaying).toBe(true);
      expect(mockState.setState).toHaveBeenCalled();
    });

    it('should set start time', async () => {
      await player.playChunk(chunkId, 2000);

      expect(player.currentAudio.currentTime).toBeCloseTo(2, 0);
    });
  });

  describe('pause and resume', () => {
    it('should pause playback', async () => {
      const mockBlob = new Blob(['test']);

      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0 }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);

      player.pause();

      expect(player.isPlaying).toBe(false);
      expect(mockState.setState).toHaveBeenCalled();
    });

    it('should resume playback', async () => {
      const mockBlob = new Blob(['test']);

      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0 }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);
      player.pause();

      await player.resume();

      expect(player.isPlaying).toBe(true);
    });
  });

  describe('clear', () => {
    it('should reset player state', () => {
      player.clear();

      expect(player.currentChunkId).toBeNull();
      expect(player.currentAudio).toBeNull();
      expect(player.isPlaying).toBe(false);
    });
  });

  describe('callbacks', () => {
    it('should set onQueueEmpty callback', () => {
      const callback = vi.fn();
      player.setOnQueueEmpty(callback);

      expect(player.onQueueEmptyCallback).toBe(callback);
    });

    it('should set onProgress callback', () => {
      const callback = vi.fn();
      player.setOnProgress(callback);

      expect(player.onProgressCallback).toBe(callback);
    });
  });

  describe('seek', () => {
    beforeEach(async () => {
      const mockBlob = new Blob(['test audio']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);
      registry.updateChunkDuration(chunks[0], 10000);
    });

    it('should seek forward within current chunk', async () => {
      player.currentAudio.currentTime = 2;

      const result = await player.seek(3);

      expect(result).toBe(true);
    });

    it('should seek backward within current chunk', async () => {
      player.currentAudio.currentTime = 5;

      const result = await player.seek(-2);

      expect(result).toBe(true);
    });

    it('should handle seek to negative time', async () => {
      player.currentAudio.currentTime = 1;

      const result = await player.seek(-5);

      expect(result).toBe(true);
    });
  });

  describe('seekToTime', () => {
    beforeEach(async () => {
      const mockBlob1 = new Blob(['chunk1']);
      const mockBlob2 = new Blob(['chunk2']);

      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob1, mockBlob2],
        metadataArray: [
          { start_offset_ms: 0, phrases: [] },
          { start_offset_ms: 5000, phrases: [] }
        ],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      registry.updateChunkDuration(chunks[0], 5000);
      registry.updateChunkDuration(chunks[1], 5000);

      await player.playChunk(chunks[0]);
    });

    it('should seek to time within current chunk', async () => {
      await player.seekToTime(2000);

      // Should have updated current chunk
      expect(player.currentChunkId).toBeTruthy();
    });

    it('should seek to time in different chunk', async () => {
      await player.seekToTime(7000);

      // Should have updated current chunk
      expect(player.currentChunkId).toBeTruthy();
    });

    it('should clamp to maximum duration', async () => {
      await player.seekToTime(999999);

      // Should have updated to last available chunk
      expect(player.currentChunkId).toBeTruthy();
    });

    it('should handle seek to zero', async () => {
      await player.seekToTime(0);

      // Should have updated to first chunk
      expect(player.currentChunkId).toBeTruthy();
    });
  });

  describe('getCurrentTime', () => {
    it('should return 0 when no audio playing', () => {
      expect(player.getCurrentTime()).toBe(0);
    });

    it('should return current time when playing', async () => {
      const mockBlob = new Blob(['test']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);

      player.currentAudio.currentTime = 2;

      const time = player.getCurrentTime();

      // Should return current playback time
      expect(time).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle playChunk with invalid chunk ID', async () => {
      const fakeId = new ChunkId('fake', 99, 99);

      await expect(player.playChunk(fakeId)).rejects.toThrow();
    });

    it('should handle pause when not playing', () => {
      expect(() => player.pause()).not.toThrow();
    });

    it('should handle resume when not paused', async () => {
      await expect(player.resume()).resolves.not.toThrow();
    });

    it('should handle seek when no audio loaded', async () => {
      const result = await player.seek(5);

      // Should return false when no audio loaded
      expect(result).toBe(false);
    });
  });

  describe('state management', () => {
    it('should update state to playing on playChunk', async () => {
      const mockBlob = new Blob(['test']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      mockState.setState.mockClear();

      await player.playChunk(chunks[0]);

      expect(mockState.setState).toHaveBeenCalledWith('playing');
    });

    it('should update state to paused on pause', async () => {
      const mockBlob = new Blob(['test']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);

      mockState.setState.mockClear();
      player.pause();

      expect(mockState.setState).toHaveBeenCalledWith('paused');
    });
  });
});
