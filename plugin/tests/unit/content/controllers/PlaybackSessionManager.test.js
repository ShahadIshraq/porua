import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PlaybackSessionManager } from '../../../../src/content/controllers/PlaybackSessionManager.js';
import { PLAYER_STATES } from '../../../../src/shared/utils/constants.js';

// Mock dependencies
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

describe('PlaybackSessionManager', () => {
  let manager;
  let mockState;
  let mockHighlightManager;
  let mockTTSService;
  let mockSettingsStore;
  let mockParagraph1;
  let mockParagraph2;
  let mockParagraph3;

  beforeEach(() => {
    // Create mock state
    mockState = {
      setState: vi.fn(),
      getState: vi.fn(() => PLAYER_STATES.IDLE),
      isContinuousMode: vi.fn(() => false),
      setContinuousMode: vi.fn(),
      setPlayingParagraph: vi.fn(),
      getPlayingParagraph: vi.fn(),
      setPhraseTimeline: vi.fn(),
      getPhraseTimeline: vi.fn(() => [])
    };

    // Create mock highlight manager
    mockHighlightManager = {
      updateHighlight: vi.fn(),
      clearHighlights: vi.fn(),
      restoreParagraph: vi.fn(),
      wrapPhrases: vi.fn(),
      transitionToParagraph: vi.fn()
    };

    // Create mock TTS service
    mockTTSService = {
      synthesizeStream: vi.fn(() => Promise.resolve({
        audioBlobs: [new Blob(['test audio'])],
        metadataArray: [{ start_offset_ms: 0, phrases: [] }],
        phraseTimeline: [{ text: 'test', start_ms: 0, end_ms: 1000 }]
      }))
    };

    // Create mock settings store
    mockSettingsStore = {
      get: vi.fn(() => Promise.resolve({
        selectedVoiceId: 'voice-1',
        speed: 1.0
      }))
    };

    // Create mock paragraphs
    mockParagraph1 = document.createElement('p');
    mockParagraph1.textContent = 'First paragraph text';

    mockParagraph2 = document.createElement('p');
    mockParagraph2.textContent = 'Second paragraph text';

    mockParagraph3 = document.createElement('p');
    mockParagraph3.textContent = 'Third paragraph text';

    // Create manager instance
    manager = new PlaybackSessionManager(
      mockState,
      mockHighlightManager,
      mockTTSService,
      mockSettingsStore
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(manager.state).toBe(mockState);
      expect(manager.highlightManager).toBe(mockHighlightManager);
      expect(manager.ttsService).toBe(mockTTSService);
      expect(manager.settingsStore).toBe(mockSettingsStore);
    });

    it('should initialize audio registry and player', () => {
      expect(manager.audioRegistry).toBeTruthy();
      expect(manager.audioPlayer).toBeTruthy();
    });

    it('should initialize empty paragraph tracking', () => {
      expect(manager.paragraphs).toEqual([]);
      expect(manager.currentParagraphIndex).toBe(-1);
    });

    it('should initialize null voice and speed', () => {
      expect(manager.voiceId).toBeNull();
      expect(manager.speed).toBeNull();
    });

    it('should initialize empty callbacks array', () => {
      expect(manager.queueCompleteCallbacks).toEqual([]);
    });
  });

  describe('playContinuous', () => {
    it('should setup paragraphs and start playback', async () => {
      await manager.playContinuous(mockParagraph1, [mockParagraph2, mockParagraph3]);

      expect(manager.paragraphs).toHaveLength(3);
      expect(manager.currentParagraphIndex).toBe(0);
    });

    it('should fetch settings from store', async () => {
      await manager.playContinuous(mockParagraph1, []);

      expect(mockSettingsStore.get).toHaveBeenCalled();
      expect(manager.voiceId).toBe('voice-1');
      expect(manager.speed).toBe(1.0);
    });

    it('should enable continuous mode', async () => {
      await manager.playContinuous(mockParagraph1, []);

      expect(mockState.setContinuousMode).toHaveBeenCalledWith(true);
    });

    it('should synthesize audio for first paragraph', async () => {
      await manager.playContinuous(mockParagraph1, []);

      expect(mockTTSService.synthesizeStream).toHaveBeenCalledWith(
        'First paragraph text',
        { voice: 'voice-1', speed: 1.0 }
      );
    });

    it('should wrap phrases for highlighting', async () => {
      await manager.playContinuous(mockParagraph1, []);

      expect(mockHighlightManager.wrapPhrases).toHaveBeenCalled();
    });

    it('should register paragraph in audio registry', async () => {
      await manager.playContinuous(mockParagraph1, []);

      const chunks = manager.audioRegistry.getParagraphChunks(0);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should update state with playing paragraph', async () => {
      await manager.playContinuous(mockParagraph1, []);

      expect(mockState.setPlayingParagraph).toHaveBeenCalledWith(mockParagraph1);
    });

    it('should handle errors and stop playback', async () => {
      mockTTSService.synthesizeStream.mockRejectedValue(new Error('Synthesis failed'));

      await expect(manager.playContinuous(mockParagraph1, [])).rejects.toThrow('Synthesis failed');

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
    });

    it('should throw error when no audio data received', async () => {
      mockTTSService.synthesizeStream.mockResolvedValue({
        audioBlobs: [],
        metadataArray: [],
        phraseTimeline: []
      });

      await expect(manager.playContinuous(mockParagraph1, [])).rejects.toThrow('No audio data received');
    });
  });

  describe('loadAndPlayParagraph', () => {
    beforeEach(async () => {
      manager.paragraphs = [mockParagraph1, mockParagraph2];
      manager.voiceId = 'voice-1';
      manager.speed = 1.0;
    });

    it('should throw error for invalid paragraph index', async () => {
      await expect(manager.loadAndPlayParagraph(99)).rejects.toThrow('Paragraph not found');
    });

    it('should synthesize audio for paragraph', async () => {
      await manager.loadAndPlayParagraph(0);

      expect(mockTTSService.synthesizeStream).toHaveBeenCalledWith(
        'First paragraph text',
        { voice: 'voice-1', speed: 1.0 }
      );
    });

    it('should set phrase timeline in state', async () => {
      await manager.loadAndPlayParagraph(0);

      expect(mockState.setPhraseTimeline).toHaveBeenCalled();
    });

    it('should update current paragraph index', async () => {
      await manager.loadAndPlayParagraph(1);

      expect(manager.currentParagraphIndex).toBe(1);
    });
  });

  describe('prefetchParagraphs', () => {
    beforeEach(() => {
      manager.paragraphs = [mockParagraph1, mockParagraph2, mockParagraph3];
      manager.voiceId = 'voice-1';
      manager.speed = 1.0;
    });

    it('should prefetch specified paragraphs', async () => {
      await manager.prefetchParagraphs([1, 2]);

      expect(mockTTSService.synthesizeStream).toHaveBeenCalledTimes(2);
    });

    it('should skip indices beyond paragraph count', async () => {
      await manager.prefetchParagraphs([1, 99]);

      expect(mockTTSService.synthesizeStream).toHaveBeenCalledTimes(1);
    });

    it('should register prefetched audio in registry', async () => {
      await manager.prefetchParagraphs([1]);

      const chunks = manager.audioRegistry.getParagraphChunks(1);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle prefetch errors gracefully', async () => {
      mockTTSService.synthesizeStream.mockRejectedValueOnce(new Error('Network error'));

      await expect(manager.prefetchParagraphs([1])).resolves.not.toThrow();
    });
  });

  describe('handleAudioQueueEmpty', () => {
    beforeEach(async () => {
      manager.paragraphs = [mockParagraph1, mockParagraph2];
      manager.currentParagraphIndex = 0;
    });

    it('should do nothing if not in continuous mode', async () => {
      mockState.isContinuousMode.mockReturnValue(false);

      await manager.handleAudioQueueEmpty();

      expect(mockState.setPlayingParagraph).not.toHaveBeenCalled();
    });

    it('should transition to next paragraph if available', async () => {
      mockState.isContinuousMode.mockReturnValue(true);
      manager.voiceId = 'voice-1';
      manager.speed = 1.0;

      // Prefetch paragraph 1 first
      await manager.prefetchParagraphs([1]);

      await manager.handleAudioQueueEmpty();

      expect(manager.currentParagraphIndex).toBe(1);
    });

    it('should call handleQueueComplete when no more paragraphs', async () => {
      mockState.isContinuousMode.mockReturnValue(true);
      manager.currentParagraphIndex = 1; // Last paragraph

      await manager.handleAudioQueueEmpty();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
    });
  });

  describe('transitionToNext', () => {
    beforeEach(() => {
      manager.paragraphs = [mockParagraph1, mockParagraph2, mockParagraph3];
      manager.currentParagraphIndex = 0;
      manager.voiceId = 'voice-1';
      manager.speed = 1.0;
    });

    it('should load on-demand if paragraph not prefetched', async () => {
      await manager.transitionToNext(1);

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.LOADING);
      expect(mockTTSService.synthesizeStream).toHaveBeenCalled();
    });

    it('should play prefetched paragraph if available', async () => {
      // Prefetch paragraph 1
      await manager.prefetchParagraphs([1]);

      await manager.transitionToNext(1);

      expect(manager.currentParagraphIndex).toBe(1);
      expect(mockState.setPlayingParagraph).toHaveBeenCalledWith(mockParagraph2);
    });

    it('should update highlights when transitioning', async () => {
      await manager.prefetchParagraphs([1]);

      await manager.transitionToNext(1);

      expect(mockHighlightManager.transitionToParagraph).toHaveBeenCalled();
    });

    it('should handle transition errors by trying next paragraph', async () => {
      mockTTSService.synthesizeStream
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          audioBlobs: [new Blob(['test'])],
          metadataArray: [{ start_offset_ms: 0, phrases: [] }],
          phraseTimeline: []
        });

      await manager.transitionToNext(1);

      // Should have tried paragraph 2 after paragraph 1 failed
      expect(mockTTSService.synthesizeStream).toHaveBeenCalledTimes(2);
    });

    it('should stop if transition fails and no more paragraphs', async () => {
      manager.currentParagraphIndex = 1;
      mockTTSService.synthesizeStream.mockRejectedValue(new Error('Failed'));

      await manager.transitionToNext(2);

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
    });

    it('should call handleQueueComplete if next paragraph not found', async () => {
      await manager.transitionToNext(99);

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
    });
  });

  describe('handleQueueComplete', () => {
    beforeEach(() => {
      manager.paragraphs = [mockParagraph1, mockParagraph2];
      manager.currentParagraphIndex = 1;
    });

    it('should set state to idle', () => {
      manager.handleQueueComplete();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
    });

    it('should disable continuous mode', () => {
      manager.handleQueueComplete();

      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
    });

    it('should clear highlights', () => {
      manager.handleQueueComplete();

      expect(mockHighlightManager.clearHighlights).toHaveBeenCalled();
    });

    it('should restore last paragraph', () => {
      manager.handleQueueComplete();

      expect(mockHighlightManager.restoreParagraph).toHaveBeenCalledWith(mockParagraph2);
    });

    it('should reset playing paragraph', () => {
      manager.handleQueueComplete();

      expect(mockState.setPlayingParagraph).toHaveBeenCalledWith(null);
      expect(manager.currentParagraphIndex).toBe(-1);
    });

    it('should call registered callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      manager.onQueueComplete(callback1);
      manager.onQueueComplete(callback2);

      manager.handleQueueComplete();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
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

  describe('stop', () => {
    beforeEach(() => {
      manager.paragraphs = [mockParagraph1, mockParagraph2];
      manager.currentParagraphIndex = 1;
    });

    it('should clear audio player', () => {
      const clearSpy = vi.spyOn(manager.audioPlayer, 'clear');

      manager.stop();

      expect(clearSpy).toHaveBeenCalled();
    });

    it('should set state to idle', () => {
      manager.stop();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
    });

    it('should disable continuous mode', () => {
      manager.stop();

      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
    });

    it('should clear highlights and restore paragraph', () => {
      manager.stop();

      expect(mockHighlightManager.clearHighlights).toHaveBeenCalled();
      expect(mockHighlightManager.restoreParagraph).toHaveBeenCalledWith(mockParagraph2);
    });

    it('should reset state', () => {
      manager.stop();

      expect(mockState.setPlayingParagraph).toHaveBeenCalledWith(null);
      expect(manager.paragraphs).toEqual([]);
      expect(manager.currentParagraphIndex).toBe(-1);
    });
  });

  describe('clear', () => {
    it('should stop playback', async () => {
      const stopSpy = vi.spyOn(manager, 'stop');

      await manager.clear();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should clear audio registry', async () => {
      const clearSpy = vi.spyOn(manager.audioRegistry, 'clear');

      await manager.clear();

      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('seek', () => {
    it('should delegate to audio player', async () => {
      const seekSpy = vi.spyOn(manager.audioPlayer, 'seek').mockResolvedValue(true);

      const result = await manager.seek(5);

      expect(seekSpy).toHaveBeenCalledWith(5);
      expect(result).toBe(true);
    });
  });

  describe('callbacks', () => {
    it('should register queue complete callback', () => {
      const callback = vi.fn();

      manager.onQueueComplete(callback);

      expect(manager.queueCompleteCallbacks).toContain(callback);
    });

    it('should register multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      manager.onQueueComplete(callback1);
      manager.onQueueComplete(callback2);

      expect(manager.queueCompleteCallbacks).toHaveLength(2);
    });

    it('should set progress callback on audio player', () => {
      const callback = vi.fn();
      const setSpy = vi.spyOn(manager.audioPlayer, 'setOnProgress');

      manager.setOnProgress(callback);

      expect(setSpy).toHaveBeenCalledWith(callback);
    });
  });

  describe('getStats', () => {
    it('should return registry statistics', async () => {
      const mockStats = {
        sessionId: 'test-session',
        totalChunks: 10,
        totalParagraphs: 2
      };

      vi.spyOn(manager.audioRegistry, 'getStats').mockResolvedValue(mockStats);

      const stats = await manager.getStats();

      expect(stats).toEqual(mockStats);
    });
  });

  describe('integration', () => {
    it('should complete full playback workflow', async () => {
      const completeCallback = vi.fn();
      manager.onQueueComplete(completeCallback);

      // Start playback
      await manager.playContinuous(mockParagraph1, [mockParagraph2]);

      expect(manager.paragraphs).toHaveLength(2);
      expect(manager.currentParagraphIndex).toBe(0);

      // Simulate first paragraph completion
      mockState.isContinuousMode.mockReturnValue(true);
      await manager.handleAudioQueueEmpty();

      expect(manager.currentParagraphIndex).toBe(1);

      // Simulate second paragraph completion
      await manager.handleAudioQueueEmpty();

      expect(completeCallback).toHaveBeenCalled();
      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
    });

    it('should handle pause and resume', async () => {
      await manager.playContinuous(mockParagraph1, []);

      manager.pause();
      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.PAUSED);

      await manager.resume();
      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
    });

    it('should handle stop during playback', async () => {
      await manager.playContinuous(mockParagraph1, [mockParagraph2]);

      manager.stop();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
      expect(manager.paragraphs).toEqual([]);
      expect(manager.currentParagraphIndex).toBe(-1);
    });
  });

  describe('prefetchNextChunks', () => {
    beforeEach(async () => {
      manager.paragraphs = [mockParagraph1, mockParagraph2];
      manager.voiceId = 'voice-1';
      manager.speed = 1.0;

      // Start playback to have a current chunk
      await manager.playContinuous(mockParagraph1, [mockParagraph2]);
    });

    it('should do nothing if no current chunk', () => {
      manager.audioPlayer.currentChunkId = null;

      expect(() => manager.prefetchNextChunks()).not.toThrow();
    });

    it('should prefetch next chunks', () => {
      const prefetchSpy = vi.spyOn(manager.audioRegistry, 'prefetchChunks');

      manager.prefetchNextChunks();

      expect(prefetchSpy).toHaveBeenCalled();
    });
  });
});
