import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaybackSessionManager } from '../../../../../src/content/controllers/PlaybackSessionManager.js';

// Mock dependencies
vi.mock('idb');
vi.mock('../../../../../src/shared/cache/AudioCacheManager.js', () => ({
  AudioCacheManager: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn()
  }))
}));

global.Audio = vi.fn(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  currentTime: 0,
  duration: 5,
  addEventListener: vi.fn(),
  onloadedmetadata: null,
  onended: null,
  src: ''
}));

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('PlaybackSessionManager', () => {
  let manager;
  let mockState;
  let mockHighlightManager;
  let mockTTSService;
  let mockSettingsStore;

  beforeEach(() => {
    mockState = {
      setState: vi.fn(),
      setContinuousMode: vi.fn(),
      isContinuousMode: vi.fn(() => true),
      setPlayingParagraph: vi.fn(),
      getPlayingParagraph: vi.fn(),
      setPhraseTimeline: vi.fn(),
      getPhraseTimeline: vi.fn(() => [])
    };

    mockHighlightManager = {
      wrapPhrases: vi.fn(),
      updateHighlight: vi.fn(),
      transitionToParagraph: vi.fn(),
      clearHighlights: vi.fn(),
      restoreParagraph: vi.fn()
    };

    mockTTSService = {
      synthesizeStream: vi.fn(() => Promise.resolve({
        audioBlobs: [new Blob(['test'])],
        metadataArray: [{ start_offset_ms: 0 }],
        phraseTimeline: []
      }))
    };

    mockSettingsStore = {
      get: vi.fn(() => Promise.resolve({
        selectedVoiceId: 'voice1',
        speed: 1.0
      }))
    };

    manager = new PlaybackSessionManager(
      mockState,
      mockHighlightManager,
      mockTTSService,
      mockSettingsStore
    );
  });

  describe('constructor', () => {
    it('should initialize with empty state', () => {
      expect(manager.paragraphs).toEqual([]);
      expect(manager.currentParagraphIndex).toBe(-1);
    });

    it('should create audio registry', () => {
      expect(manager.audioRegistry).toBeTruthy();
    });

    it('should create audio player', () => {
      expect(manager.audioPlayer).toBeTruthy();
    });
  });

  describe('playContinuous', () => {
    let mockParagraph1, mockParagraph2;

    beforeEach(() => {
      mockParagraph1 = {
        textContent: 'First paragraph',
        trim: () => 'First paragraph'
      };

      mockParagraph2 = {
        textContent: 'Second paragraph',
        trim: () => 'Second paragraph'
      };
    });

    it('should start playback from first paragraph', async () => {
      await manager.playContinuous(mockParagraph1, [mockParagraph2]);

      expect(manager.paragraphs.length).toBe(2);
      expect(manager.currentParagraphIndex).toBe(0);
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(true);
    });

    it('should fetch audio for first paragraph', async () => {
      await manager.playContinuous(mockParagraph1, [mockParagraph2]);

      expect(mockTTSService.synthesizeStream).toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('should pause audio player', () => {
      const pauseSpy = vi.spyOn(manager.audioPlayer, 'pause');

      manager.pause();

      expect(pauseSpy).toHaveBeenCalled();
    });

    it('should resume audio player', async () => {
      const resumeSpy = vi.spyOn(manager.audioPlayer, 'resume');

      await manager.resume();

      expect(resumeSpy).toHaveBeenCalled();
    });
  });

  describe('seek', () => {
    it('should delegate to audio player', async () => {
      const seekSpy = vi.spyOn(manager.audioPlayer, 'seek').mockResolvedValue(true);

      await manager.seek(10);

      expect(seekSpy).toHaveBeenCalledWith(10);
    });
  });

  describe('stop', () => {
    it('should clear audio player', () => {
      const clearSpy = vi.spyOn(manager.audioPlayer, 'clear');

      manager.stop();

      expect(clearSpy).toHaveBeenCalled();
      expect(mockState.setState).toHaveBeenCalled();
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
    });

    it('should reset paragraph tracking', () => {
      manager.paragraphs = [{}, {}];
      manager.currentParagraphIndex = 1;

      manager.stop();

      expect(manager.paragraphs).toEqual([]);
      expect(manager.currentParagraphIndex).toBe(-1);
    });
  });

  describe('onQueueComplete', () => {
    it('should register callback', () => {
      const callback = vi.fn();

      manager.onQueueComplete(callback);

      expect(manager.queueCompleteCallbacks).toContain(callback);
    });
  });

  describe('setOnProgress', () => {
    it('should set progress callback on audio player', () => {
      const callback = vi.fn();
      const setProgressSpy = vi.spyOn(manager.audioPlayer, 'setOnProgress');

      manager.setOnProgress(callback);

      expect(setProgressSpy).toHaveBeenCalledWith(callback);
    });
  });

  describe('clear', () => {
    it('should stop playback', () => {
      const stopSpy = vi.spyOn(manager, 'stop');

      manager.clear();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should clear audio registry', async () => {
      const clearRegistrySpy = vi.spyOn(manager.audioRegistry, 'clear');

      await manager.clear();

      expect(clearRegistrySpy).toHaveBeenCalled();
    });
  });
});
