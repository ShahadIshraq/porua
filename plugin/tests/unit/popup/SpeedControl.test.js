import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeedControl } from '../../../src/popup/SpeedControl.js';

describe('SpeedControl', () => {
  let speedControl;
  let mockContainer;
  let mockDependencies;

  beforeEach(() => {
    // Create mock container
    mockContainer = document.createElement('div');
    document.body.appendChild(mockContainer);

    // Create mock dependencies
    mockDependencies = {
      audioPreview: {
        play: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        isPlaying: vi.fn().mockReturnValue(false),
        onPlayStateChange: null,
        cleanup: vi.fn()
      },
      ttsService: {
        synthesize: vi.fn().mockResolvedValue({
          status: 200,
          headers: new Headers({ 'Content-Type': 'audio/wav' }),
          blob: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }))
        })
      },
      settingsStore: {
        getSelectedVoice: vi.fn().mockResolvedValue({ id: 'bf_lily', name: 'Lily' })
      },
      statusMessage: {
        show: vi.fn()
      }
    };

    speedControl = new SpeedControl(mockContainer, mockDependencies);
  });

  afterEach(() => {
    document.body.removeChild(mockContainer);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should store container reference', () => {
      expect(speedControl.container).toBe(mockContainer);
    });

    it('should initialize with default speed', () => {
      expect(speedControl.currentSpeed).toBe(1.0);
    });

    it('should set speed range constants', () => {
      expect(speedControl.MIN_SPEED).toBe(0.5);
      expect(speedControl.MAX_SPEED).toBe(2.0);
      expect(speedControl.DEFAULT_SPEED).toBe(1.0);
      expect(speedControl.STEP).toBe(0.05);
    });

    it('should initialize presets array', () => {
      expect(speedControl.PRESETS).toHaveLength(4);
      expect(speedControl.PRESETS[0]).toEqual({ value: 0.75, label: '0.75x' });
      expect(speedControl.PRESETS[1]).toEqual({ value: 1.0, label: '1.0x' });
      expect(speedControl.PRESETS[2]).toEqual({ value: 1.25, label: '1.25x' });
      expect(speedControl.PRESETS[3]).toEqual({ value: 1.5, label: '1.5x' });
    });
  });

  describe('init', () => {
    it('should initialize with default speed when no parameter provided', () => {
      speedControl.init();

      expect(speedControl.currentSpeed).toBe(1.0);
      expect(mockContainer.querySelector('#speed-slider')).toBeTruthy();
    });

    it('should initialize with provided speed', () => {
      speedControl.init(1.5);

      expect(speedControl.currentSpeed).toBe(1.5);
      const slider = mockContainer.querySelector('#speed-slider');
      expect(slider.value).toBe('1.5');
    });

    it('should clamp initial speed to valid range', () => {
      speedControl.init(3.0);

      expect(speedControl.currentSpeed).toBe(2.0);
    });

    it('should render the UI', () => {
      speedControl.init();

      expect(mockContainer.querySelector('.speed-control')).toBeTruthy();
      expect(mockContainer.querySelector('#speed-slider')).toBeTruthy();
      expect(mockContainer.querySelector('.speed-value')).toBeTruthy();
      expect(mockContainer.querySelectorAll('.speed-preset-btn')).toHaveLength(4);
    });

    it('should setup event listeners', () => {
      speedControl.init();

      const slider = mockContainer.querySelector('#speed-slider');
      expect(slider).toBeTruthy();

      // Verify preset buttons have click handlers
      const presetButtons = mockContainer.querySelectorAll('.speed-preset-btn');
      expect(presetButtons.length).toBeGreaterThan(0);
    });
  });

  describe('render', () => {
    it('should create slider element with correct attributes', () => {
      speedControl.init(1.25);

      const slider = mockContainer.querySelector('#speed-slider');
      expect(slider.type).toBe('range');
      expect(slider.min).toBe('0.5');
      expect(slider.max).toBe('2');
      expect(slider.step).toBe('0.05');
      expect(slider.value).toBe('1.25');
    });

    it('should create value display with formatted speed', () => {
      speedControl.init(1.5);

      const valueDisplay = mockContainer.querySelector('.speed-value');
      expect(valueDisplay.textContent).toBe('1.50x');
    });

    it('should create preset buttons', () => {
      speedControl.init();

      const presetButtons = mockContainer.querySelectorAll('.speed-preset-btn');
      expect(presetButtons).toHaveLength(4);
      expect(presetButtons[0].textContent.trim()).toBe('0.75x');
      expect(presetButtons[1].textContent.trim()).toBe('1.0x');
      expect(presetButtons[2].textContent.trim()).toBe('1.25x');
      expect(presetButtons[3].textContent.trim()).toBe('1.5x');
    });

    it('should mark active preset button', () => {
      speedControl.init(1.25);

      const presetButtons = mockContainer.querySelectorAll('.speed-preset-btn');
      expect(presetButtons[0].classList.contains('active')).toBe(false);
      expect(presetButtons[1].classList.contains('active')).toBe(false);
      expect(presetButtons[2].classList.contains('active')).toBe(true);
      expect(presetButtons[3].classList.contains('active')).toBe(false);
    });

    it('should include accessibility attributes', () => {
      speedControl.init(1.5);

      const slider = mockContainer.querySelector('#speed-slider');
      expect(slider.getAttribute('aria-label')).toBe('Playback speed');
      expect(slider.getAttribute('aria-valuemin')).toBe('0.5');
      expect(slider.getAttribute('aria-valuemax')).toBe('2');
      expect(slider.getAttribute('aria-valuenow')).toBe('1.5');
    });
  });

  describe('handleSpeedChange', () => {
    it('should update current speed', () => {
      speedControl.init(1.0);

      speedControl.handleSpeedChange(1.5, false);

      expect(speedControl.currentSpeed).toBe(1.5);
    });

    it('should update UI', () => {
      speedControl.init(1.0);

      speedControl.handleSpeedChange(1.5, false);

      const slider = mockContainer.querySelector('#speed-slider');
      const valueDisplay = mockContainer.querySelector('.speed-value');
      expect(slider.value).toBe('1.5');
      expect(valueDisplay.textContent).toBe('1.50x');
    });

    it('should fire callback when fireCallback is true', () => {
      const callback = vi.fn();
      speedControl.init(1.0);
      speedControl.onChange(callback);

      speedControl.handleSpeedChange(1.5, true);

      expect(callback).toHaveBeenCalledWith(1.5);
    });

    it('should not fire callback when fireCallback is false', () => {
      const callback = vi.fn();
      speedControl.init(1.0);
      speedControl.onChange(callback);

      speedControl.handleSpeedChange(1.5, false);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should clamp speed to valid range', () => {
      speedControl.init(1.0);

      speedControl.handleSpeedChange(3.0, false);

      expect(speedControl.currentSpeed).toBe(2.0);
    });
  });

  describe('slider interaction', () => {
    it('should update speed on slider input', () => {
      speedControl.init(1.0);
      const slider = mockContainer.querySelector('#speed-slider');

      slider.value = '1.5';
      slider.dispatchEvent(new Event('input'));

      expect(speedControl.currentSpeed).toBe(1.5);
    });

    it('should fire callback on slider change', () => {
      const callback = vi.fn();
      speedControl.init(1.0);
      speedControl.onChange(callback);
      const slider = mockContainer.querySelector('#speed-slider');

      slider.value = '1.5';
      slider.dispatchEvent(new Event('change'));

      expect(callback).toHaveBeenCalledWith(1.5);
    });

    it('should not fire callback on slider input (only change)', () => {
      const callback = vi.fn();
      speedControl.init(1.0);
      speedControl.onChange(callback);
      const slider = mockContainer.querySelector('#speed-slider');

      slider.value = '1.5';
      slider.dispatchEvent(new Event('input'));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('preset button interaction', () => {
    it('should set speed when preset button clicked', () => {
      speedControl.init(1.0);
      const presetButtons = mockContainer.querySelectorAll('.speed-preset-btn');

      presetButtons[2].click(); // 1.25x

      expect(speedControl.currentSpeed).toBe(1.25);
    });

    it('should fire callback when preset button clicked', () => {
      const callback = vi.fn();
      speedControl.init(1.0);
      speedControl.onChange(callback);
      const presetButtons = mockContainer.querySelectorAll('.speed-preset-btn');

      presetButtons[2].click(); // 1.25x

      expect(callback).toHaveBeenCalledWith(1.25);
    });

    it('should update active state when preset clicked', () => {
      speedControl.init(1.0);
      const presetButtons = mockContainer.querySelectorAll('.speed-preset-btn');

      presetButtons[2].click(); // 1.25x

      expect(presetButtons[2].classList.contains('active')).toBe(true);
      expect(presetButtons[1].classList.contains('active')).toBe(false);
    });
  });

  describe('setSpeed', () => {
    it('should set speed programmatically', () => {
      speedControl.init(1.0);

      speedControl.setSpeed(1.75);

      expect(speedControl.currentSpeed).toBe(1.75);
    });

    it('should update UI when speed set programmatically', () => {
      speedControl.init(1.0);

      speedControl.setSpeed(1.75);

      const slider = mockContainer.querySelector('#speed-slider');
      const valueDisplay = mockContainer.querySelector('.speed-value');
      expect(slider.value).toBe('1.75');
      expect(valueDisplay.textContent).toBe('1.75x');
    });

    it('should clamp speed to valid range', () => {
      speedControl.init(1.0);

      speedControl.setSpeed(3.5);

      expect(speedControl.currentSpeed).toBe(2.0);
    });

    it('should not fire callback', () => {
      const callback = vi.fn();
      speedControl.init(1.0);
      speedControl.onChange(callback);

      speedControl.setSpeed(1.5);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getSpeed', () => {
    it('should return current speed', () => {
      speedControl.init(1.5);

      expect(speedControl.getSpeed()).toBe(1.5);
    });

    it('should return updated speed after change', () => {
      speedControl.init(1.0);
      speedControl.setSpeed(1.75);

      expect(speedControl.getSpeed()).toBe(1.75);
    });
  });

  describe('onChange', () => {
    it('should register callback', () => {
      const callback = vi.fn();
      speedControl.init(1.0);

      speedControl.onChange(callback);

      expect(speedControl.onChangeCallback).toBe(callback);
    });

    it('should allow changing callback', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      speedControl.init(1.0);

      speedControl.onChange(callback1);
      speedControl.onChange(callback2);

      expect(speedControl.onChangeCallback).toBe(callback2);
    });
  });

  describe('clampSpeed', () => {
    it('should return speed within range unchanged', () => {
      expect(speedControl.clampSpeed(1.0)).toBe(1.0);
      expect(speedControl.clampSpeed(0.75)).toBe(0.75);
      expect(speedControl.clampSpeed(1.5)).toBe(1.5);
    });

    it('should clamp speed below minimum', () => {
      expect(speedControl.clampSpeed(0.3)).toBe(0.5);
      expect(speedControl.clampSpeed(-1.0)).toBe(0.5);
    });

    it('should clamp speed above maximum', () => {
      expect(speedControl.clampSpeed(2.5)).toBe(2.0);
      expect(speedControl.clampSpeed(10.0)).toBe(2.0);
    });
  });

  describe('formatSpeed', () => {
    it('should format speed with 2 decimal places', () => {
      expect(speedControl.formatSpeed(1.0)).toBe('1.00x');
      expect(speedControl.formatSpeed(1.5)).toBe('1.50x');
      expect(speedControl.formatSpeed(0.75)).toBe('0.75x');
    });

    it('should handle edge cases', () => {
      expect(speedControl.formatSpeed(0.5)).toBe('0.50x');
      expect(speedControl.formatSpeed(2.0)).toBe('2.00x');
      expect(speedControl.formatSpeed(1.234567)).toBe('1.23x');
    });
  });

  describe('updateUI', () => {
    it('should update slider value', () => {
      speedControl.init(1.0);
      speedControl.currentSpeed = 1.5;

      speedControl.updateUI();

      const slider = mockContainer.querySelector('#speed-slider');
      expect(slider.value).toBe('1.5');
    });

    it('should update value display', () => {
      speedControl.init(1.0);
      speedControl.currentSpeed = 1.5;

      speedControl.updateUI();

      const valueDisplay = mockContainer.querySelector('.speed-value');
      expect(valueDisplay.textContent).toBe('1.50x');
    });

    it('should update preset button active states', () => {
      speedControl.init(1.0);
      speedControl.currentSpeed = 1.25;

      speedControl.updateUI();

      const presetButtons = mockContainer.querySelectorAll('.speed-preset-btn');
      expect(presetButtons[2].classList.contains('active')).toBe(true);
      expect(presetButtons[1].classList.contains('active')).toBe(false);
    });

    it('should update aria-valuenow attribute', () => {
      speedControl.init(1.0);
      speedControl.currentSpeed = 1.5;

      speedControl.updateUI();

      const slider = mockContainer.querySelector('#speed-slider');
      expect(slider.getAttribute('aria-valuenow')).toBe('1.5');
    });
  });

  describe('cleanup', () => {
    it('should clear element references', () => {
      speedControl.init(1.0);

      speedControl.cleanup();

      expect(speedControl.slider).toBeNull();
      expect(speedControl.valueDisplay).toBeNull();
      expect(speedControl.presetButtons).toEqual([]);
    });

    it('should clear callback', () => {
      const callback = vi.fn();
      speedControl.init(1.0);
      speedControl.onChange(callback);

      speedControl.cleanup();

      expect(speedControl.onChangeCallback).toBeNull();
    });
  });

  describe('Test functionality', () => {
    describe('render with test button', () => {
      it('should render test button', () => {
        speedControl.init(1.0);

        const testButton = mockContainer.querySelector('#speed-test-btn');
        expect(testButton).toBeTruthy();
        expect(testButton.textContent).toContain('Test Speed');
      });
    });

    describe('handleTestClick', () => {
      it('should synthesize and play audio at current speed', async () => {
        speedControl.init(1.5);

        await speedControl.handleTestClick();

        expect(mockDependencies.settingsStore.getSelectedVoice).toHaveBeenCalled();
        expect(mockDependencies.ttsService.synthesize).toHaveBeenCalledWith(
          'Testing playback speed.',
          {
            voice: 'bf_lily',
            speed: 1.5
          }
        );
        expect(mockDependencies.audioPreview.play).toHaveBeenCalled();
      });

      it('should set isTestingSpeed to true when starting test', async () => {
        speedControl.init(1.0);

        const testPromise = speedControl.handleTestClick();
        expect(speedControl.isTestingSpeed).toBe(true);

        await testPromise;
      });

      it('should stop audio if already testing', async () => {
        speedControl.init(1.0);
        speedControl.isTestingSpeed = true;

        await speedControl.handleTestClick();

        expect(mockDependencies.audioPreview.stop).toHaveBeenCalled();
        expect(speedControl.isTestingSpeed).toBe(false);
      });

      it('should handle synthesis error', async () => {
        speedControl.init(1.0);
        const error = new Error('Synthesis failed');
        mockDependencies.ttsService.synthesize.mockRejectedValue(error);

        await speedControl.handleTestClick();

        expect(speedControl.isTestingSpeed).toBe(false);
        expect(mockDependencies.statusMessage.show).toHaveBeenCalledWith(
          'Test failed: Synthesis failed',
          'error'
        );
      });

      it('should handle blob conversion error', async () => {
        speedControl.init(1.0);
        const mockResponse = {
          status: 200,
          headers: new Headers({ 'Content-Type': 'audio/wav' }),
          blob: vi.fn().mockRejectedValue(new Error('Blob conversion failed'))
        };
        mockDependencies.ttsService.synthesize.mockResolvedValue(mockResponse);

        await speedControl.handleTestClick();

        expect(speedControl.isTestingSpeed).toBe(false);
        expect(mockDependencies.statusMessage.show).toHaveBeenCalledWith(
          'Test failed: API Error 200: Failed to convert response to Blob: Blob conversion failed',
          'error'
        );
      });

      it('should handle auth error (401)', async () => {
        speedControl.init(1.0);
        const error = new Error('Unauthorized');
        error.status = 401;
        mockDependencies.ttsService.synthesize.mockRejectedValue(error);

        await speedControl.handleTestClick();

        expect(mockDependencies.statusMessage.show).toHaveBeenCalledWith(
          'Authentication failed. Check your API key.',
          'error'
        );
      });

      it('should handle auth error (403)', async () => {
        speedControl.init(1.0);
        const error = new Error('Forbidden');
        error.status = 403;
        mockDependencies.ttsService.synthesize.mockRejectedValue(error);

        await speedControl.handleTestClick();

        expect(mockDependencies.statusMessage.show).toHaveBeenCalledWith(
          'Authentication failed. Check your API key.',
          'error'
        );
      });
    });

    describe('updateTestButtonState', () => {
      it('should update button to loading state', () => {
        speedControl.init(1.0);

        speedControl.updateTestButtonState('loading');

        const icon = mockContainer.querySelector('.test-btn-icon');
        const text = mockContainer.querySelector('.test-btn-text');
        const button = mockContainer.querySelector('#speed-test-btn');

        expect(icon.textContent).toBe('⋯');
        expect(text.textContent).toBe('Loading...');
        expect(button.classList.contains('loading')).toBe(true);
      });

      it('should update button to playing state', () => {
        speedControl.init(1.0);

        speedControl.updateTestButtonState('playing');

        const icon = mockContainer.querySelector('.test-btn-icon');
        const text = mockContainer.querySelector('.test-btn-text');
        const button = mockContainer.querySelector('#speed-test-btn');

        expect(icon.textContent).toBe('■');
        expect(text.textContent).toBe('Stop Test');
        expect(button.classList.contains('playing')).toBe(true);
      });

      it('should update button to idle state', () => {
        speedControl.init(1.0);
        speedControl.updateTestButtonState('loading');

        speedControl.updateTestButtonState('idle');

        const icon = mockContainer.querySelector('.test-btn-icon');
        const text = mockContainer.querySelector('.test-btn-text');
        const button = mockContainer.querySelector('#speed-test-btn');

        expect(icon.textContent).toBe('▶');
        expect(text.textContent).toBe('Test Speed');
        expect(button.classList.contains('loading')).toBe(false);
        expect(button.classList.contains('playing')).toBe(false);
      });
    });

    describe('setupAudioPreviewCallback', () => {
      it('should set callback on audio preview', () => {
        speedControl.init(1.0);

        expect(mockDependencies.audioPreview.onPlayStateChange).toBeDefined();
        expect(typeof mockDependencies.audioPreview.onPlayStateChange).toBe('function');
      });

      it('should update button state on state change', () => {
        speedControl.init(1.0);
        const updateSpy = vi.spyOn(speedControl, 'updateTestButtonState');

        mockDependencies.audioPreview.onPlayStateChange('speed-test', 'playing');

        expect(updateSpy).toHaveBeenCalledWith('playing');
      });

      it('should ignore state changes for other IDs', () => {
        speedControl.init(1.0);
        const updateSpy = vi.spyOn(speedControl, 'updateTestButtonState');

        mockDependencies.audioPreview.onPlayStateChange('other-id', 'playing');

        expect(updateSpy).not.toHaveBeenCalled();
      });

      it('should show error message on error state', () => {
        speedControl.init(1.0);

        mockDependencies.audioPreview.onPlayStateChange('speed-test', 'error', 'Test error');

        expect(mockDependencies.statusMessage.show).toHaveBeenCalledWith(
          'Preview error: Test error',
          'error'
        );
      });

      it('should reset isTestingSpeed on stopped state', () => {
        speedControl.init(1.0);
        speedControl.isTestingSpeed = true;

        mockDependencies.audioPreview.onPlayStateChange('speed-test', 'stopped');

        expect(speedControl.isTestingSpeed).toBe(false);
      });
    });

    describe('cleanup with test functionality', () => {
      it('should stop ongoing test', () => {
        speedControl.init(1.0);
        speedControl.isTestingSpeed = true;

        speedControl.cleanup();

        expect(mockDependencies.audioPreview.stop).toHaveBeenCalled();
      });

      it('should clear audio preview callback', () => {
        speedControl.init(1.0);
        mockDependencies.audioPreview.onPlayStateChange = vi.fn();

        speedControl.cleanup();

        expect(speedControl.audioPreview.onPlayStateChange).toBeNull();
      });

      it('should reset isTestingSpeed flag', () => {
        speedControl.init(1.0);
        speedControl.isTestingSpeed = true;

        speedControl.cleanup();

        expect(speedControl.isTestingSpeed).toBe(false);
      });
    });
  });
});
