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
});
