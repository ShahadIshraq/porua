import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceSelector } from '../../src/popup/VoiceSelector.js';
import { AudioPreview } from '../../src/popup/AudioPreview.js';
import { ttsService } from '../../src/shared/services/TTSService.js';
import { SettingsStore } from '../../src/shared/storage/SettingsStore.js';

// Mock Audio API
class MockAudio {
  constructor() {
    this.src = '';
    this.paused = true;
    this.currentTime = 0;
    this.readyState = 0;
    this.listeners = {};
  }

  addEventListener(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  play() {
    this.paused = false;
    this.readyState = 4; // HAVE_ENOUGH_DATA
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  trigger(event, data = {}) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(handler => handler(data));
    }
  }
}

global.Audio = MockAudio;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn((blob) => `blob:mock-url-${Math.random()}`);
global.URL.revokeObjectURL = vi.fn();

// Mock TTSService
vi.mock('../../src/shared/services/TTSService.js', () => ({
  ttsService: {
    getVoices: vi.fn(),
    fetchVoiceSample: vi.fn(),
  },
}));

// Mock SettingsStore
vi.mock('../../src/shared/storage/SettingsStore.js', () => ({
  SettingsStore: {
    getSelectedVoice: vi.fn(),
    setSelectedVoice: vi.fn(),
  },
}));

describe('VoiceSelector - Playback Integration', () => {
  let voiceSelector;
  let container;
  let statusMessage;
  let mockVoices;

  beforeEach(() => {
    // Setup DOM
    container = document.createElement('div');
    document.body.appendChild(container);

    // Setup mock status message
    statusMessage = {
      show: vi.fn(),
    };

    // Setup mock voices
    mockVoices = [
      { id: 'af_nova', name: 'Nova', gender: 'Female', language: 'AmericanEnglish', sample_url: '/samples/nova.wav' },
      { id: 'bf_lily', name: 'Lily', gender: 'Female', language: 'BritishEnglish', sample_url: '/samples/lily.wav' },
      { id: 'am_ryan', name: 'Ryan', gender: 'Male', language: 'AmericanEnglish', sample_url: '/samples/ryan.wav' },
    ];

    // Setup mock implementations
    SettingsStore.getSelectedVoice.mockResolvedValue({ id: 'af_nova', name: 'Nova' });
    ttsService.getVoices.mockResolvedValue({ voices: mockVoices });
    ttsService.fetchVoiceSample.mockImplementation((voiceId) => {
      return Promise.resolve(new Blob([`audio-${voiceId}`], { type: 'audio/wav' }));
    });

    // Create voice selector
    voiceSelector = new VoiceSelector(container, statusMessage);
  });

  afterEach(() => {
    if (voiceSelector) {
      voiceSelector.cleanup();
    }
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  describe('Bug: Pause Voice A, Play Voice B', () => {
    it('should play Voice B instead of resuming Voice A when clicking different voice', async () => {
      // Initialize and expand voice selector
      await voiceSelector.init();
      await voiceSelector.expand();

      // Get play buttons for Voice A (Nova) and Voice B (Lily)
      const novaPlayBtn = container.querySelector('[data-voice-id="af_nova"].btn-play');
      const lilyPlayBtn = container.querySelector('[data-voice-id="bf_lily"].btn-play');

      expect(novaPlayBtn).toBeTruthy();
      expect(lilyPlayBtn).toBeTruthy();

      // Step 1: Play Voice A (Nova)
      await voiceSelector.handlePlayClick('af_nova');
      expect(voiceSelector.audioPreview.currentVoiceId).toBe('af_nova');
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(false);

      // Simulate some playback time
      voiceSelector.audioPreview.audioElement.currentTime = 1.5;

      // Step 2: Pause Voice A
      voiceSelector.audioPreview.pause();
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(true);
      expect(voiceSelector.audioPreview.currentVoiceId).toBe('af_nova');
      expect(voiceSelector.audioPreview.isPaused('af_nova')).toBe(true);

      // Track the fetch call count before clicking Voice B
      const fetchCallCountBefore = ttsService.fetchVoiceSample.mock.calls.length;

      // Step 3: Click Play on Voice B (Lily)
      await voiceSelector.handlePlayClick('bf_lily');

      // Verify that Voice B is now playing, NOT Voice A
      expect(voiceSelector.audioPreview.currentVoiceId).toBe('bf_lily');
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(false);

      // Verify that we fetched Voice B's sample (not just resumed Voice A)
      expect(ttsService.fetchVoiceSample.mock.calls.length).toBe(fetchCallCountBefore + 1);
      expect(ttsService.fetchVoiceSample).toHaveBeenCalledWith('bf_lily');

      // Verify Voice A is no longer the current voice
      expect(voiceSelector.audioPreview.isPaused('af_nova')).toBe(false);
      expect(voiceSelector.audioPreview.isPlaying('af_nova')).toBe(false);
    });

    it('should correctly resume same voice when clicked again after pausing', async () => {
      // Initialize and expand voice selector
      await voiceSelector.init();
      await voiceSelector.expand();

      // Step 1: Play Voice A (Nova)
      await voiceSelector.handlePlayClick('af_nova');
      expect(voiceSelector.audioPreview.currentVoiceId).toBe('af_nova');
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(false);

      // Simulate some playback time
      voiceSelector.audioPreview.audioElement.currentTime = 1.5;
      const currentTime = voiceSelector.audioPreview.audioElement.currentTime;

      // Step 2: Pause Voice A
      voiceSelector.audioPreview.pause();
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(true);
      expect(voiceSelector.audioPreview.isPaused('af_nova')).toBe(true);

      // Track the fetch call count before resuming
      const fetchCallCountBefore = ttsService.fetchVoiceSample.mock.calls.length;

      // Step 3: Click Play on Voice A again (should resume, not re-fetch)
      await voiceSelector.handlePlayClick('af_nova');

      // Verify that Voice A resumed (same currentVoiceId, playing state)
      expect(voiceSelector.audioPreview.currentVoiceId).toBe('af_nova');
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(false);

      // Verify we did NOT fetch a new sample (just resumed)
      expect(ttsService.fetchVoiceSample.mock.calls.length).toBe(fetchCallCountBefore);

      // Verify currentTime preserved (resume from same position)
      expect(voiceSelector.audioPreview.audioElement.currentTime).toBe(currentTime);
    });

    it('should stop previous voice when starting a new one', async () => {
      // Initialize and expand voice selector
      await voiceSelector.init();
      await voiceSelector.expand();

      // Step 1: Play Voice A (Nova)
      await voiceSelector.handlePlayClick('af_nova');
      expect(voiceSelector.audioPreview.currentVoiceId).toBe('af_nova');
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(false);

      // Step 2: Play Voice B (Lily) without pausing Voice A first
      await voiceSelector.handlePlayClick('bf_lily');

      // Verify that Voice B is now playing
      expect(voiceSelector.audioPreview.currentVoiceId).toBe('bf_lily');
      expect(voiceSelector.audioPreview.audioElement.paused).toBe(false);

      // Verify Voice A is no longer playing or paused
      expect(voiceSelector.audioPreview.isPlaying('af_nova')).toBe(false);
      expect(voiceSelector.audioPreview.isPaused('af_nova')).toBe(false);
    });
  });

  describe('Playback State Management', () => {
    it('should update playback states correctly during play/pause/resume cycle', async () => {
      await voiceSelector.init();
      await voiceSelector.expand();

      // Initial state
      expect(voiceSelector.playbackStates['af_nova']).toBe('idle');

      // Play
      await voiceSelector.handlePlayClick('af_nova');

      // Trigger the canplay event to transition from loading to playing
      voiceSelector.audioPreview.audioElement.trigger('canplay');

      expect(voiceSelector.playbackStates['af_nova']).toBe('playing');

      // Pause
      voiceSelector.audioPreview.pause();
      expect(voiceSelector.playbackStates['af_nova']).toBe('paused');

      // Resume
      await voiceSelector.audioPreview.resume();
      expect(voiceSelector.playbackStates['af_nova']).toBe('playing');
    });

    it('should handle multiple voices with independent states', async () => {
      await voiceSelector.init();
      await voiceSelector.expand();

      // Play Voice A
      await voiceSelector.handlePlayClick('af_nova');

      // Trigger canplay to transition to playing state
      voiceSelector.audioPreview.audioElement.trigger('canplay');

      expect(voiceSelector.playbackStates['af_nova']).toBe('playing');
      expect(voiceSelector.playbackStates['bf_lily']).toBe('idle');

      // Pause Voice A
      voiceSelector.audioPreview.pause();
      voiceSelector.audioPreview.audioElement.currentTime = 1.5;
      expect(voiceSelector.playbackStates['af_nova']).toBe('paused');

      // Play Voice B (should stop/reset Voice A's state)
      await voiceSelector.handlePlayClick('bf_lily');

      // Trigger canplay for Voice B
      voiceSelector.audioPreview.audioElement.trigger('canplay');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('playing');
      // Voice A should be stopped (not paused anymore)
      expect(voiceSelector.playbackStates['af_nova']).toBe('stopped');
    });
  });
});
