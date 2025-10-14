import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioQueue } from '../../../../src/content/audio/AudioQueue.js';
import { PLAYER_STATES, TIMEOUTS } from '../../../../src/shared/utils/constants.js';
import { AudioPlaybackError } from '../../../../src/shared/utils/errors.js';

describe('AudioQueue', () => {
  let audioQueue;
  let mockState;
  let mockHighlightManager;
  let mockAudio;

  beforeEach(() => {
    // Mock PlaybackState
    mockState = {
      setState: vi.fn(),
      getParagraph: vi.fn()
    };

    // Mock HighlightManager
    mockHighlightManager = {
      updateHighlight: vi.fn(),
      clearHighlights: vi.fn(),
      restoreParagraph: vi.fn()
    };

    // Mock Audio constructor
    mockAudio = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      currentTime: 0,
      paused: false,
      onended: null,
      onerror: null
    };
    global.Audio = vi.fn(() => mockAudio);

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url-123');
    global.URL.revokeObjectURL = vi.fn();

    // Use fake timers
    vi.useFakeTimers();

    audioQueue = new AudioQueue(mockState, mockHighlightManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with empty queue', () => {
      expect(audioQueue.queue).toEqual([]);
      expect(audioQueue.currentAudio).toBeNull();
      expect(audioQueue.currentMetadata).toBeNull();
      expect(audioQueue.isPlaying).toBe(false);
      expect(audioQueue.pausedQueue).toEqual([]);
    });

    it('should store state and highlightManager references', () => {
      expect(audioQueue.state).toBe(mockState);
      expect(audioQueue.highlightManager).toBe(mockHighlightManager);
    });
  });

  describe('enqueue', () => {
    it('should add item to queue', () => {
      const blob = new Blob(['audio data']);
      const metadata = { start_offset_ms: 0, phrases: [] };

      audioQueue.enqueue(blob, metadata);

      expect(audioQueue.queue).toHaveLength(1);
      expect(audioQueue.queue[0]).toEqual({ blob, metadata });
    });

    it('should add multiple items in order', () => {
      const blob1 = new Blob(['audio 1']);
      const blob2 = new Blob(['audio 2']);
      const metadata1 = { start_offset_ms: 0 };
      const metadata2 = { start_offset_ms: 1000 };

      audioQueue.enqueue(blob1, metadata1);
      audioQueue.enqueue(blob2, metadata2);

      expect(audioQueue.queue).toHaveLength(2);
      expect(audioQueue.queue[0].blob).toBe(blob1);
      expect(audioQueue.queue[1].blob).toBe(blob2);
    });
  });

  describe('clear', () => {
    it('should empty queue', () => {
      audioQueue.enqueue(new Blob(['audio']), {});
      audioQueue.enqueue(new Blob(['audio']), {});

      audioQueue.clear();

      expect(audioQueue.queue).toEqual([]);
    });

    it('should clear pausedQueue', () => {
      audioQueue.pausedQueue = [{ blob: new Blob(), metadata: {} }];

      audioQueue.clear();

      expect(audioQueue.pausedQueue).toEqual([]);
    });

    it('should pause and null currentAudio', () => {
      audioQueue.currentAudio = mockAudio;

      audioQueue.clear();

      expect(mockAudio.pause).toHaveBeenCalled();
      expect(audioQueue.currentAudio).toBeNull();
    });

    it('should handle no current audio', () => {
      expect(() => {
        audioQueue.clear();
      }).not.toThrow();

      expect(audioQueue.currentAudio).toBeNull();
    });

    it('should clear metadata and playing flag', () => {
      audioQueue.currentMetadata = { start_offset_ms: 0 };
      audioQueue.isPlaying = true;

      audioQueue.clear();

      expect(audioQueue.currentMetadata).toBeNull();
      expect(audioQueue.isPlaying).toBe(false);
    });
  });

  describe('play', () => {
    it('should call finish when queue is empty', async () => {
      const finishSpy = vi.spyOn(audioQueue, 'finish');

      await audioQueue.play();

      expect(finishSpy).toHaveBeenCalled();
    });

    it('should dequeue item and create audio', async () => {
      const blob = new Blob(['audio data']);
      const metadata = { start_offset_ms: 0 };
      audioQueue.enqueue(blob, metadata);

      await audioQueue.play();

      expect(audioQueue.queue).toHaveLength(0);
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(global.Audio).toHaveBeenCalledWith('blob:mock-url-123');
    });

    it('should call play on audio element', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });

      await audioQueue.play();

      expect(mockAudio.play).toHaveBeenCalled();
    });

    it('should set state to PLAYING', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });

      await audioQueue.play();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
      expect(audioQueue.isPlaying).toBe(true);
    });

    it('should set currentMetadata', async () => {
      const metadata = { start_offset_ms: 100, phrases: [] };
      audioQueue.enqueue(new Blob(['audio']), metadata);

      await audioQueue.play();

      expect(audioQueue.currentMetadata).toBe(metadata);
    });

    it('should setup audio events', async () => {
      const setupSpy = vi.spyOn(audioQueue, 'setupAudioEvents');
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });

      await audioQueue.play();

      expect(setupSpy).toHaveBeenCalledWith('blob:mock-url-123');
    });

    it('should setup highlight sync', async () => {
      const setupSpy = vi.spyOn(audioQueue, 'setupHighlightSync');
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });

      await audioQueue.play();

      expect(setupSpy).toHaveBeenCalled();
    });

    it('should throw AudioPlaybackError on play failure', async () => {
      mockAudio.play.mockRejectedValue(new Error('Playback failed'));
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });

      await expect(audioQueue.play()).rejects.toThrow(AudioPlaybackError);
    });

    it('should revoke URL on play error', async () => {
      mockAudio.play.mockRejectedValue(new Error('Playback failed'));
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });

      try {
        await audioQueue.play();
      } catch (e) {
        // Expected
      }

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url-123');
    });
  });

  describe('pause', () => {
    beforeEach(async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });
      await audioQueue.play();
    });

    it('should pause current audio', () => {
      audioQueue.pause();

      expect(mockAudio.pause).toHaveBeenCalled();
    });

    it('should save queue to pausedQueue', () => {
      const item1 = { blob: new Blob(), metadata: {} };
      const item2 = { blob: new Blob(), metadata: {} };
      audioQueue.queue = [item1, item2];

      audioQueue.pause();

      expect(audioQueue.pausedQueue).toEqual([item1, item2]);
    });

    it('should set isPlaying to false', () => {
      audioQueue.pause();

      expect(audioQueue.isPlaying).toBe(false);
    });

    it('should set state to PAUSED', () => {
      audioQueue.pause();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.PAUSED);
    });

    it('should not pause if not playing', () => {
      audioQueue.isPlaying = false;
      mockAudio.pause.mockClear();

      audioQueue.pause();

      expect(mockAudio.pause).not.toHaveBeenCalled();
    });

    it('should not pause if no current audio', () => {
      audioQueue.currentAudio = null;
      audioQueue.isPlaying = false;

      audioQueue.pause();

      // Should not throw and state remains false
      expect(audioQueue.isPlaying).toBe(false);
    });
  });

  describe('resume', () => {
    beforeEach(async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 100 });
      await audioQueue.play();
      audioQueue.pause();
    });

    it('should resume audio playback', async () => {
      await audioQueue.resume();

      expect(mockAudio.play).toHaveBeenCalled();
      expect(audioQueue.isPlaying).toBe(true);
    });

    it('should set state to PLAYING', async () => {
      mockState.setState.mockClear();

      await audioQueue.resume();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
    });

    it('should update highlight with current position', async () => {
      mockAudio.currentTime = 2.5; // 2.5 seconds
      audioQueue.currentMetadata = { start_offset_ms: 1000 };

      await audioQueue.resume();

      const expectedTimeMs = 1000 + (2.5 * 1000); // 3500ms
      expect(mockHighlightManager.updateHighlight).toHaveBeenCalledWith(expectedTimeMs);
    });

    it('should handle resume error by playing next', async () => {
      mockAudio.play.mockRejectedValueOnce(new Error('Resume failed'));
      const playSpy = vi.spyOn(audioQueue, 'play');

      await audioQueue.resume();

      expect(playSpy).toHaveBeenCalled();
    });

    it('should not resume if already playing', async () => {
      audioQueue.isPlaying = true;
      mockAudio.play.mockClear();

      await audioQueue.resume();

      expect(mockAudio.play).not.toHaveBeenCalled();
    });

    it('should not resume if no current audio', async () => {
      audioQueue.currentAudio = null;
      audioQueue.isPlaying = false;
      mockAudio.play.mockClear();

      await audioQueue.resume();

      // Should not throw
      expect(mockAudio.play).not.toHaveBeenCalled();
    });
  });

  describe('setupAudioEvents', () => {
    it('should setup onended handler', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });
      await audioQueue.play();

      expect(mockAudio.onended).toBeDefined();
    });

    it('should revoke URL and play next on ended', async () => {
      const audioUrl = 'blob:mock-url-123';
      audioQueue.enqueue(new Blob(['audio 1']), { start_offset_ms: 0 });
      audioQueue.enqueue(new Blob(['audio 2']), { start_offset_ms: 1000 });
      await audioQueue.play();

      const playSpy = vi.spyOn(audioQueue, 'play');

      // Trigger onended
      mockAudio.onended();

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(audioUrl);
      expect(playSpy).toHaveBeenCalled();
    });

    it('should setup onerror handler', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });
      await audioQueue.play();

      expect(mockAudio.onerror).toBeDefined();
    });

    it('should revoke URL and play next on error', async () => {
      const audioUrl = 'blob:mock-url-123';
      audioQueue.enqueue(new Blob(['audio 1']), { start_offset_ms: 0 });
      audioQueue.enqueue(new Blob(['audio 2']), { start_offset_ms: 1000 });
      await audioQueue.play();

      const playSpy = vi.spyOn(audioQueue, 'play');

      // Trigger onerror
      mockAudio.onerror();

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(audioUrl);
      expect(playSpy).toHaveBeenCalled();
    });
  });

  describe('setupHighlightSync', () => {
    it('should add timeupdate listener', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });
      await audioQueue.play();

      const calls = mockAudio.addEventListener.mock.calls;
      const timeupdateCall = calls.find(call => call[0] === 'timeupdate');
      expect(timeupdateCall).toBeDefined();
    });

    it('should update highlight on timeupdate', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 1000 });
      await audioQueue.play();

      mockAudio.currentTime = 2.5;
      mockAudio.paused = false;

      // Get and call the timeupdate handler
      const timeupdateHandler = mockAudio.addEventListener.mock.calls.find(
        call => call[0] === 'timeupdate'
      )[1];
      timeupdateHandler();

      const expectedTime = 1000 + (2.5 * 1000); // 3500ms
      expect(mockHighlightManager.updateHighlight).toHaveBeenCalledWith(expectedTime);
    });

    it('should not update highlight when paused', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 1000 });
      await audioQueue.play();

      mockAudio.paused = true;
      mockHighlightManager.updateHighlight.mockClear();

      const timeupdateHandler = mockAudio.addEventListener.mock.calls.find(
        call => call[0] === 'timeupdate'
      )[1];
      timeupdateHandler();

      expect(mockHighlightManager.updateHighlight).not.toHaveBeenCalled();
    });

    it('should add play listener', async () => {
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: 0 });
      await audioQueue.play();

      const calls = mockAudio.addEventListener.mock.calls;
      const playCall = calls.find(call => call[0] === 'play');
      expect(playCall).toBeDefined();
    });

    it('should update highlight to start offset on play', async () => {
      const startOffset = 2000;
      audioQueue.enqueue(new Blob(['audio']), { start_offset_ms: startOffset });
      await audioQueue.play();

      mockHighlightManager.updateHighlight.mockClear();

      const playHandler = mockAudio.addEventListener.mock.calls.find(
        call => call[0] === 'play'
      )[1];
      playHandler();

      expect(mockHighlightManager.updateHighlight).toHaveBeenCalledWith(startOffset);
    });

    it('should not setup if no metadata', async () => {
      audioQueue.enqueue(new Blob(['audio']), null);
      mockAudio.addEventListener.mockClear();

      await audioQueue.play();

      const calls = mockAudio.addEventListener.mock.calls;
      expect(calls).toHaveLength(0);
    });
  });

  describe('finish', () => {
    it('should set isPlaying to false', () => {
      audioQueue.isPlaying = true;

      audioQueue.finish();

      expect(audioQueue.isPlaying).toBe(false);
    });

    it('should set state to IDLE', () => {
      audioQueue.finish();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
    });

    it('should null currentAudio and metadata', () => {
      audioQueue.currentAudio = mockAudio;
      audioQueue.currentMetadata = { start_offset_ms: 0 };

      audioQueue.finish();

      expect(audioQueue.currentAudio).toBeNull();
      expect(audioQueue.currentMetadata).toBeNull();
    });

    it('should clear highlights', () => {
      audioQueue.finish();

      expect(mockHighlightManager.clearHighlights).toHaveBeenCalled();
    });

    it('should restore paragraph immediately', () => {
      const mockParagraph = document.createElement('p');
      mockState.getParagraph.mockReturnValue(mockParagraph);

      audioQueue.finish();

      expect(mockState.getParagraph).toHaveBeenCalled();
      expect(mockHighlightManager.restoreParagraph).toHaveBeenCalledWith(mockParagraph);
    });

    it('should not restore paragraph if none exists', () => {
      mockState.getParagraph.mockReturnValue(null);

      audioQueue.finish();

      expect(mockHighlightManager.restoreParagraph).not.toHaveBeenCalled();
    });
  });

  describe('full playback flow', () => {
    it('should play multiple items in sequence', async () => {
      const blob1 = new Blob(['audio 1']);
      const blob2 = new Blob(['audio 2']);
      const blob3 = new Blob(['audio 3']);

      audioQueue.enqueue(blob1, { start_offset_ms: 0 });
      audioQueue.enqueue(blob2, { start_offset_ms: 1000 });
      audioQueue.enqueue(blob3, { start_offset_ms: 2000 });

      await audioQueue.play();
      expect(audioQueue.queue).toHaveLength(2);

      mockAudio.onended();
      await vi.runAllTimersAsync();
      expect(audioQueue.queue).toHaveLength(1);

      mockAudio.onended();
      await vi.runAllTimersAsync();
      expect(audioQueue.queue).toHaveLength(0);
    });

    it('should handle pause and resume mid-playback', async () => {
      audioQueue.enqueue(new Blob(['audio 1']), { start_offset_ms: 0 });
      audioQueue.enqueue(new Blob(['audio 2']), { start_offset_ms: 1000 });

      await audioQueue.play();
      expect(audioQueue.isPlaying).toBe(true);

      audioQueue.pause();
      expect(audioQueue.isPlaying).toBe(false);
      expect(audioQueue.pausedQueue).toHaveLength(1);

      await audioQueue.resume();
      expect(audioQueue.isPlaying).toBe(true);
    });
  });
});
