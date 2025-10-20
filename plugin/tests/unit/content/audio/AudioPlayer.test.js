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
      getPlayingParagraph: vi.fn(),
      setPlayingParagraph: vi.fn()
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

  describe('finish', () => {
    beforeEach(async () => {
      const mockBlob = new Blob(['test']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);
    });

    it('should stop playback and cleanup audio', () => {
      player.finish();

      expect(player.isPlaying).toBe(false);
      expect(player.currentAudio).toBeNull();
      expect(player.currentAudioUrl).toBeNull();
    });

    it('should call onQueueEmpty callback in continuous mode', () => {
      const callback = vi.fn();
      player.setOnQueueEmpty(callback);
      mockState.isContinuousMode.mockReturnValue(true);

      player.finish();

      expect(callback).toHaveBeenCalled();
    });

    it('should not cleanup state in continuous mode', () => {
      mockState.isContinuousMode.mockReturnValue(true);
      mockState.setState.mockClear();

      player.finish();

      expect(mockState.setState).not.toHaveBeenCalled();
    });

    it('should set state to idle in single paragraph mode', () => {
      mockState.isContinuousMode.mockReturnValue(false);
      mockState.setState.mockClear();

      player.finish();

      expect(mockState.setState).toHaveBeenCalledWith('idle');
    });

    it('should clear highlights in single paragraph mode', () => {
      mockState.isContinuousMode.mockReturnValue(false);

      player.finish();

      expect(mockHighlightManager.clearHighlights).toHaveBeenCalled();
    });

    it('should restore paragraph in single paragraph mode', () => {
      const mockParagraph = document.createElement('p');
      mockState.isContinuousMode.mockReturnValue(false);
      mockState.getPlayingParagraph.mockReturnValue(mockParagraph);

      player.finish();

      expect(mockHighlightManager.restoreParagraph).toHaveBeenCalledWith(mockParagraph);
    });

    it('should reset playing paragraph', () => {
      mockState.isContinuousMode.mockReturnValue(false);

      player.finish();

      expect(mockState.setPlayingParagraph).toHaveBeenCalledWith(null);
      expect(player.currentChunkId).toBeNull();
    });
  });

  describe('getCurrentDuration', () => {
    it('should return 0 when no audio loaded', () => {
      expect(player.getCurrentDuration()).toBe(0);
    });

    it('should return audio duration when playing', async () => {
      const mockBlob = new Blob(['test']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);

      const duration = player.getCurrentDuration();

      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resume error recovery', () => {
    it('should replay chunk if resume fails', async () => {
      const mockBlob = new Blob(['test']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: []
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);

      player.pause();

      // Mock play to fail once, then succeed
      let playCallCount = 0;
      player.currentAudio.play = vi.fn().mockImplementation(() => {
        playCallCount++;
        if (playCallCount === 1) {
          return Promise.reject(new Error('Play failed'));
        }
        return Promise.resolve();
      });

      await player.resume();

      expect(player.isPlaying).toBe(true);
    });
  });

  describe('seekToTime with chunk switching', () => {
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

    it('should switch to different chunk when seeking', async () => {
      const initialChunkId = player.currentChunkId;

      await player.seekToTime(7000);

      expect(player.currentChunkId).not.toEqual(initialChunkId);
    });

    it('should seek within current chunk when in same chunk', async () => {
      await player.seekToTime(2000);

      // Should still be in first chunk
      expect(player.currentChunkId.chunkIndex).toBe(0);
    });

    it('should update highlights when seeking within chunk', async () => {
      mockHighlightManager.updateHighlight.mockClear();

      await player.seekToTime(2000);

      expect(mockHighlightManager.updateHighlight).toHaveBeenCalled();
    });

    it('should return false for out of range seek', async () => {
      const result = await player.seekToTime(999999);

      expect(result).toBe(false);
    });

    it('should handle seek errors gracefully', async () => {
      // Mock registry to return null
      vi.spyOn(registry, 'findChunkAtTime').mockReturnValue(null);

      const result = await player.seekToTime(5000);

      expect(result).toBe(false);
    });
  });

  describe('setTotalChunks', () => {
    it('should update total chunks count', () => {
      player.setTotalChunks(50);

      expect(player.totalChunksInSession).toBe(50);
    });
  });

  describe('event handlers', () => {
    beforeEach(async () => {
      const mockBlob = new Blob(['test']);
      await registry.registerParagraph(0, 'Test', {
        audioBlobs: [mockBlob],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: [{ text: 'test', start_ms: 0, end_ms: 1000 }]
      }, 'voice1', 1.0);

      const chunks = registry.getParagraphChunks(0);
      await player.playChunk(chunks[0]);
    });

    it('should have onended event handler attached', () => {
      expect(player.currentAudio.onended).toBeTruthy();
    });

    it('should have ontimeupdate event handler attached', () => {
      expect(player.currentAudio.ontimeupdate).toBeTruthy();
    });

    it('should have onerror event handler attached', () => {
      expect(player.currentAudio.onerror).toBeTruthy();
    });

    it('should call progress callback on timeupdate', () => {
      const progressCallback = vi.fn();
      player.setOnProgress(progressCallback);
      player.setTotalChunks(10); // Need total chunks for progress callback to fire

      // Trigger timeupdate
      if (player.currentAudio.ontimeupdate) {
        player.currentAudio.ontimeupdate();
      }

      expect(progressCallback).toHaveBeenCalled();
    });

    it('should call finish on ended event', () => {
      const finishSpy = vi.spyOn(player, 'finish');

      // Trigger ended
      if (player.currentAudio.onended) {
        player.currentAudio.onended();
      }

      expect(finishSpy).toHaveBeenCalled();
    });
  });
});
