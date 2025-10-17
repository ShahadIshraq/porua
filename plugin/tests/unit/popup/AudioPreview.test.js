import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPreview } from '../../../src/popup/AudioPreview.js';

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

describe('AudioPreview', () => {
  let audioPreview;
  let mockCallback;
  let mockBlob;

  beforeEach(() => {
    vi.clearAllMocks();
    audioPreview = new AudioPreview();
    mockCallback = vi.fn();
    audioPreview.onPlayStateChange = mockCallback;
    mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
  });

  describe('constructor', () => {
    it('should initialize with null currentVoiceId', () => {
      expect(audioPreview.currentVoiceId).toBeNull();
    });

    it('should create Audio element', () => {
      expect(audioPreview.audioElement).toBeInstanceOf(MockAudio);
    });

    it('should initialize onPlayStateChange to null', () => {
      const preview = new AudioPreview();
      expect(preview.onPlayStateChange).toBeNull();
    });
  });

  describe('play', () => {
    it('should set current voice ID', async () => {
      await audioPreview.play('af_nova', mockBlob);
      expect(audioPreview.currentVoiceId).toBe('af_nova');
    });

    it('should create object URL from blob', async () => {
      await audioPreview.play('af_nova', mockBlob);
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });

    it('should set audio source to object URL', async () => {
      await audioPreview.play('af_nova', mockBlob);
      expect(audioPreview.audioElement.src).toMatch(/^blob:mock-url-/);
      expect(audioPreview.currentObjectUrl).toMatch(/^blob:mock-url-/);
    });

    it('should notify loading state', async () => {
      await audioPreview.play('af_nova', mockBlob);
      expect(mockCallback).toHaveBeenCalledWith('af_nova', 'loading');
    });

    it('should call audio.play()', async () => {
      const playSpy = vi.spyOn(audioPreview.audioElement, 'play');
      await audioPreview.play('af_nova', mockBlob);
      expect(playSpy).toHaveBeenCalled();
    });

    it('should stop previous playback before starting new', async () => {
      // Start first playback
      await audioPreview.play('af_nova', mockBlob);
      expect(audioPreview.currentVoiceId).toBe('af_nova');

      // Start second playback
      const mockBlob2 = new Blob(['audio data 2'], { type: 'audio/wav' });
      await audioPreview.play('bf_lily', mockBlob2);
      expect(audioPreview.currentVoiceId).toBe('bf_lily');
    });

    it('should revoke old object URL when playing new audio', async () => {
      await audioPreview.play('af_nova', mockBlob);
      const firstUrl = audioPreview.currentObjectUrl;

      const mockBlob2 = new Blob(['audio data 2'], { type: 'audio/wav' });
      await audioPreview.play('bf_lily', mockBlob2);

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
    });

    it('should handle play errors', async () => {
      audioPreview.audioElement.play = vi.fn().mockRejectedValue(new Error('Play failed'));
      await audioPreview.play('af_nova', mockBlob);

      expect(mockCallback).toHaveBeenCalledWith('af_nova', 'error', 'Play failed');
      expect(audioPreview.currentVoiceId).toBeNull();
    });

    it('should cleanup object URL on play error', async () => {
      audioPreview.audioElement.play = vi.fn().mockRejectedValue(new Error('Play failed'));
      await audioPreview.play('af_nova', mockBlob);

      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      expect(audioPreview.currentObjectUrl).toBeNull();
    });
  });

  describe('stop', () => {
    it('should pause audio', () => {
      audioPreview.audioElement.paused = false;
      const pauseSpy = vi.spyOn(audioPreview.audioElement, 'pause');

      audioPreview.stop();

      expect(pauseSpy).toHaveBeenCalled();
    });

    it('should reset currentTime', () => {
      audioPreview.audioElement.currentTime = 10;
      audioPreview.stop();
      expect(audioPreview.audioElement.currentTime).toBe(0);
    });

    it('should notify stopped state', async () => {
      await audioPreview.play('af_nova', mockBlob);
      mockCallback.mockClear();

      audioPreview.stop();

      expect(mockCallback).toHaveBeenCalledWith('af_nova', 'stopped');
    });

    it('should clear currentVoiceId', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.stop();
      expect(audioPreview.currentVoiceId).toBeNull();
    });

    it('should revoke object URL', async () => {
      await audioPreview.play('af_nova', mockBlob);
      const objectUrl = audioPreview.currentObjectUrl;

      audioPreview.stop();

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
      expect(audioPreview.currentObjectUrl).toBeNull();
    });
  });

  describe('isPlaying', () => {
    it('should return true when voice is playing', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.audioElement.paused = false;

      expect(audioPreview.isPlaying('af_nova')).toBe(true);
    });

    it('should return false when voice is paused', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.audioElement.paused = true;

      expect(audioPreview.isPlaying('af_nova')).toBe(false);
    });

    it('should return false for different voice', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.audioElement.paused = false;

      expect(audioPreview.isPlaying('bf_lily')).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return idle for different voice', () => {
      audioPreview.currentVoiceId = 'af_nova';
      expect(audioPreview.getState('bf_lily')).toBe('idle');
    });

    it('should return loading when readyState < 3', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.audioElement.readyState = 2;

      expect(audioPreview.getState('af_nova')).toBe('loading');
    });

    it('should return playing when not paused', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.audioElement.readyState = 4;
      audioPreview.audioElement.paused = false;

      expect(audioPreview.getState('af_nova')).toBe('playing');
    });

    it('should return stopped when paused', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.audioElement.readyState = 4;
      audioPreview.audioElement.paused = true;

      expect(audioPreview.getState('af_nova')).toBe('stopped');
    });
  });

  describe('event handlers', () => {
    it('should handle ended event', async () => {
      await audioPreview.play('af_nova', mockBlob);
      mockCallback.mockClear();

      audioPreview.handleEnded();

      expect(mockCallback).toHaveBeenCalledWith('af_nova', 'stopped');
      expect(audioPreview.currentVoiceId).toBeNull();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      expect(audioPreview.currentObjectUrl).toBeNull();
    });

    it('should handle error event', async () => {
      await audioPreview.play('af_nova', mockBlob);
      mockCallback.mockClear();

      audioPreview.handleError({});

      expect(mockCallback).toHaveBeenCalledWith('af_nova', 'error', 'Failed to load audio sample');
      expect(audioPreview.currentVoiceId).toBeNull();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      expect(audioPreview.currentObjectUrl).toBeNull();
    });

    it('should handle loadstart event', async () => {
      await audioPreview.play('af_nova', mockBlob);
      mockCallback.mockClear();

      audioPreview.handleLoadStart();

      expect(mockCallback).toHaveBeenCalledWith('af_nova', 'loading');
    });

    it('should handle canplay event', async () => {
      await audioPreview.play('af_nova', mockBlob);
      mockCallback.mockClear();

      audioPreview.handleCanPlay();

      expect(mockCallback).toHaveBeenCalledWith('af_nova', 'playing');
    });
  });

  describe('cleanup', () => {
    it('should stop playback', async () => {
      await audioPreview.play('af_nova', mockBlob);
      const stopSpy = vi.spyOn(audioPreview, 'stop');

      audioPreview.cleanup();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should clear audio source', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.cleanup();

      expect(audioPreview.audioElement.src).toBe('');
    });

    it('should clear callback', async () => {
      await audioPreview.play('af_nova', mockBlob);
      audioPreview.cleanup();

      expect(audioPreview.onPlayStateChange).toBeNull();
    });
  });
});
