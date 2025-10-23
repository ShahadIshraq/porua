import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceSelector } from '../../../src/popup/VoiceSelector.js';
import { ttsService } from '../../../src/shared/services/TTSService.js';
import { SettingsStore } from '../../../src/shared/storage/SettingsStore.js';
import { TimeoutError } from '../../../src/shared/utils/timeout.js';

// Mock dependencies
vi.mock('../../../src/shared/services/TTSService.js', () => ({
  ttsService: {
    getVoices: vi.fn(),
    fetchVoiceSample: vi.fn()
  }
}));

vi.mock('../../../src/shared/storage/SettingsStore.js', () => ({
  SettingsStore: {
    getSelectedVoice: vi.fn(),
    setSelectedVoice: vi.fn()
  }
}));

vi.mock('../../../src/popup/AudioPreview.js', () => ({
  AudioPreview: vi.fn(() => ({
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    isPaused: vi.fn().mockReturnValue(false),
    isPlaying: vi.fn().mockReturnValue(false),
    cleanup: vi.fn(),
    onPlayStateChange: null
  }))
}));

describe('VoiceSelector', () => {
  let voiceSelector;
  let mockContainer;
  let mockStatusMessage;
  let mockAudioPreview;

  beforeEach(() => {
    // Create mock container
    mockContainer = document.createElement('div');
    document.body.appendChild(mockContainer);

    // Mock status message
    mockStatusMessage = {
      show: vi.fn()
    };

    // Mock audio preview
    mockAudioPreview = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      isPaused: vi.fn().mockReturnValue(false),
      isPlaying: vi.fn().mockReturnValue(false),
      cleanup: vi.fn(),
      onPlayStateChange: null
    };

    // Reset mocks
    SettingsStore.getSelectedVoice.mockResolvedValue({
      id: 'bf_lily',
      name: 'Lily'
    });

    ttsService.getVoices.mockResolvedValue({
      voices: [
        { id: 'bf_lily', name: 'Lily', gender: 'Female', language: 'AmericanEnglish' },
        { id: 'bm_adam', name: 'Adam', gender: 'Male', language: 'AmericanEnglish' }
      ]
    });

    ttsService.fetchVoiceSample.mockResolvedValue(
      new Blob(['audio'], { type: 'audio/wav' })
    );

    voiceSelector = new VoiceSelector(mockContainer, mockStatusMessage, mockAudioPreview);
  });

  afterEach(() => {
    document.body.removeChild(mockContainer);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should store container and statusMessage references', () => {
      expect(voiceSelector.container).toBe(mockContainer);
      expect(voiceSelector.statusMessage).toBe(mockStatusMessage);
    });

    it('should use provided audioPreview', () => {
      expect(voiceSelector.audioPreview).toBe(mockAudioPreview);
    });

    it('should initialize state', () => {
      expect(voiceSelector.voices).toEqual([]);
      expect(voiceSelector.selectedVoiceId).toBeNull();
      expect(voiceSelector.selectedVoiceName).toBeNull();
      expect(voiceSelector.loading).toBe(false);
      expect(voiceSelector.error).toBeNull();
    });
  });

  describe('init', () => {
    it('should load selected voice from storage', async () => {
      await voiceSelector.init();

      expect(SettingsStore.getSelectedVoice).toHaveBeenCalled();
      expect(voiceSelector.selectedVoiceId).toBe('bf_lily');
      expect(voiceSelector.selectedVoiceName).toBe('Lily');
    });

    it('should render collapsed view', async () => {
      await voiceSelector.init();

      expect(mockContainer.querySelector('.voice-selector-collapsed')).toBeTruthy();
      expect(mockContainer.textContent).toContain('Lily');
    });
  });

  describe('handlePlayClick - timeout and error handling', () => {
    beforeEach(async () => {
      await voiceSelector.init();
      await voiceSelector.expand();
    });

    it('should fetch and play voice sample successfully', async () => {
      const audioBlob = new Blob(['audio'], { type: 'audio/wav' });
      ttsService.fetchVoiceSample.mockResolvedValue(audioBlob);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(ttsService.fetchVoiceSample).toHaveBeenCalledWith('bf_lily');
      expect(mockAudioPreview.play).toHaveBeenCalledWith('bf_lily', audioBlob);
    });

    it('should pause if already playing', async () => {
      mockAudioPreview.isPlaying.mockReturnValue(true);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(mockAudioPreview.pause).toHaveBeenCalled();
      expect(ttsService.fetchVoiceSample).not.toHaveBeenCalled();
    });

    it('should resume if paused', async () => {
      mockAudioPreview.isPlaying.mockReturnValue(false);
      mockAudioPreview.isPaused.mockReturnValue(true);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(mockAudioPreview.resume).toHaveBeenCalled();
      expect(ttsService.fetchVoiceSample).not.toHaveBeenCalled();
    });

    it('should handle timeout error with specific message', async () => {
      const timeoutError = new TimeoutError('Sample loading timeout (60s)');
      ttsService.fetchVoiceSample.mockRejectedValue(timeoutError);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('error');
      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Sample loading timeout (60s)',
        'error'
      );
    });

    it('should handle auth error (401)', async () => {
      const authError = new Error('Unauthorized');
      authError.status = 401;
      ttsService.fetchVoiceSample.mockRejectedValue(authError);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('error');
      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Authentication failed',
        'error'
      );
    });

    it('should handle auth error (403)', async () => {
      const authError = new Error('Forbidden');
      authError.status = 403;
      ttsService.fetchVoiceSample.mockRejectedValue(authError);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('error');
      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Authentication failed',
        'error'
      );
    });

    it('should handle network error with details', async () => {
      const networkError = new Error('Network connection failed');
      ttsService.fetchVoiceSample.mockRejectedValue(networkError);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('error');
      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Failed to load sample: Network connection failed',
        'error'
      );
    });

    it('should handle HTTPS error with details', async () => {
      const httpsError = new Error('SSL certificate error');
      ttsService.fetchVoiceSample.mockRejectedValue(httpsError);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('error');
      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Failed to load sample: SSL certificate error',
        'error'
      );
    });

    it('should handle generic error', async () => {
      const genericError = new Error();
      ttsService.fetchVoiceSample.mockRejectedValue(genericError);

      await voiceSelector.handlePlayClick('bf_lily');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('error');
      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Failed to load voice sample',
        'error'
      );
    });
  });

  describe('expand and loadVoices', () => {
    it('should load voices from API', async () => {
      await voiceSelector.expand();

      expect(ttsService.getVoices).toHaveBeenCalled();
      expect(voiceSelector.voices).toHaveLength(2);
    });

    it('should render expanded view with voices', async () => {
      await voiceSelector.expand();

      expect(mockContainer.querySelector('.voice-selector-expanded')).toBeTruthy();
      expect(mockContainer.textContent).toContain('Lily');
      expect(mockContainer.textContent).toContain('Adam');
    });

    it('should handle voices loading error', async () => {
      ttsService.getVoices.mockRejectedValue(new Error('API error'));

      await voiceSelector.expand();

      expect(mockContainer.querySelector('.voice-selector-error')).toBeTruthy();
      expect(mockContainer.textContent).toContain('Failed to load voices');
    });
  });

  describe('handleSelectClick', () => {
    beforeEach(async () => {
      await voiceSelector.init();
      await voiceSelector.expand();
    });

    it('should save selected voice to storage', async () => {
      SettingsStore.setSelectedVoice.mockResolvedValue(undefined);

      await voiceSelector.handleSelectClick('bm_adam');

      expect(SettingsStore.setSelectedVoice).toHaveBeenCalledWith('bm_adam', 'Adam');
    });

    it('should update local state', async () => {
      SettingsStore.setSelectedVoice.mockResolvedValue(undefined);

      await voiceSelector.handleSelectClick('bm_adam');

      expect(voiceSelector.selectedVoiceId).toBe('bm_adam');
      expect(voiceSelector.selectedVoiceName).toBe('Adam');
    });

    it('should show success message', async () => {
      SettingsStore.setSelectedVoice.mockResolvedValue(undefined);

      await voiceSelector.handleSelectClick('bm_adam');

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Voice changed to Adam',
        'success'
      );
    });

    it('should handle save error', async () => {
      SettingsStore.setSelectedVoice.mockRejectedValue(new Error('Save failed'));

      await voiceSelector.handleSelectClick('bm_adam');

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Failed to save voice selection',
        'error'
      );
    });
  });

  describe('handlePlaybackStateChange', () => {
    it('should update playback state', () => {
      voiceSelector.handlePlaybackStateChange('bf_lily', 'playing');

      expect(voiceSelector.playbackStates['bf_lily']).toBe('playing');
    });

    it('should show error message on error state', () => {
      voiceSelector.handlePlaybackStateChange('bf_lily', 'error', 'Audio playback error');

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Audio error: Audio playback error',
        'error'
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup audio preview', () => {
      voiceSelector.cleanup();

      expect(mockAudioPreview.cleanup).toHaveBeenCalled();
    });
  });
});
