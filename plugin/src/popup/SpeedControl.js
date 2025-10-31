import { toBlob } from '../shared/api/ResponseHandler.js';
import { createElement, replaceContent } from '../shared/utils/domBuilder.js';

/**
 * SpeedControl component for adjusting TTS playback speed
 * Provides a slider control with preset buttons for common speed values
 */
export class SpeedControl {
  /**
   * @param {HTMLElement} container - The container element for the speed control
   * @param {Object} dependencies - Required dependencies
   * @param {Object} dependencies.audioPreview - AudioPreview instance for testing
   * @param {Object} dependencies.ttsService - TTSService instance for synthesis
   * @param {Object} dependencies.settingsStore - SettingsStore for getting current voice
   * @param {Object} dependencies.statusMessage - StatusMessage for showing errors
   */
  constructor(container, { audioPreview, ttsService, settingsStore, statusMessage }) {
    this.container = container;
    this.currentSpeed = 1.0;
    this.onChangeCallback = null;

    // Required dependencies
    this.audioPreview = audioPreview;
    this.ttsService = ttsService;
    this.settingsStore = settingsStore;
    this.statusMessage = statusMessage;

    // Speed range constants
    this.MIN_SPEED = 0.5;
    this.MAX_SPEED = 2.0;
    this.DEFAULT_SPEED = 1.0;
    this.STEP = 0.05;

    // Preset speeds
    this.PRESETS = [
      { value: 0.75, label: '0.75x' },
      { value: 1.0, label: '1.0x' },
      { value: 1.25, label: '1.25x' },
      { value: 1.5, label: '1.5x' }
    ];

    // Test sample configuration
    this.TEST_SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog. This sentence demonstrates various phonetic sounds at different playback speeds.';
    this.TEST_ID = 'speed-test';

    this.slider = null;
    this.valueDisplay = null;
    this.presetButtons = [];
    this.testButton = null;
    this.isTestingSpeed = false;
  }

  /**
   * Initializes the speed control component
   * @param {number} initialSpeed - The initial speed value (default: 1.0)
   */
  init(initialSpeed = this.DEFAULT_SPEED) {
    this.currentSpeed = this.clampSpeed(initialSpeed);
    this.render();
    this.setupEventListeners();
    // Note: Audio preview callback is managed by SettingsForm for shared instance
  }

  /**
   * Renders the speed control UI
   */
  render() {
    const slider = createElement('input', {
      type: 'range',
      id: 'speed-slider',
      className: 'speed-slider',
      min: this.MIN_SPEED,
      max: this.MAX_SPEED,
      step: this.STEP,
      value: this.currentSpeed,
      'aria-label': 'Playback speed',
      'aria-valuemin': this.MIN_SPEED,
      'aria-valuemax': this.MAX_SPEED,
      'aria-valuenow': this.currentSpeed
    });

    const valueDisplay = createElement('span', 'speed-value', this.formatSpeed(this.currentSpeed));

    const presetButtons = this.PRESETS.map(preset =>
      createElement('button', {
        type: 'button',
        className: `speed-preset-btn ${preset.value === this.currentSpeed ? 'active' : ''}`,
        'data-speed': preset.value,
        'aria-label': `Set speed to ${preset.label}`
      }, preset.label)
    );

    const testButton = createElement('button', {
      type: 'button',
      id: 'speed-test-btn',
      className: 'speed-test-btn',
      'aria-label': 'Test playback speed'
    }, [
      createElement('span', 'test-btn-icon', '▶'),
      createElement('span', 'test-btn-text', 'Test Speed')
    ]);

    const view = createElement('div', 'speed-control', [
      createElement('label', { htmlFor: 'speed-slider', className: 'speed-label' }, 'Playback Speed'),
      createElement('div', 'speed-slider-container', [
        createElement('span', 'speed-min', '0.5x'),
        slider,
        createElement('span', 'speed-max', '2.0x')
      ]),
      createElement('div', { className: 'speed-value-display', 'aria-live': 'polite' }, valueDisplay),
      createElement('div', 'speed-presets', presetButtons),
      createElement('small', 'help-text', 'Adjust the playback speed (0.5x slower to 2.0x faster)'),
      createElement('div', 'speed-test-container', testButton)
    ]);

    replaceContent(this.container, view);

    // Store references to elements
    this.slider = slider;
    this.valueDisplay = valueDisplay;
    this.presetButtons = presetButtons;
    this.testButton = testButton;
  }

  /**
   * Sets up event listeners for the speed control
   */
  setupEventListeners() {
    // Slider input event (fires while dragging)
    this.slider.addEventListener('input', (e) => {
      this.handleSpeedChange(parseFloat(e.target.value), false);
    });

    // Slider change event (fires on release)
    this.slider.addEventListener('change', (e) => {
      this.handleSpeedChange(parseFloat(e.target.value), true);
    });

    // Preset button clicks
    this.presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        const speed = parseFloat(button.dataset.speed);
        this.setSpeed(speed);
        this.handleSpeedChange(speed, true);
      });
    });

    // Test button click
    if (this.testButton) {
      this.testButton.addEventListener('click', () => this.handleTestClick());
    }
  }

  /**
   * Handles speed change events
   * @param {number} speed - The new speed value
   * @param {boolean} fireCallback - Whether to fire the onChange callback
   */
  handleSpeedChange(speed, fireCallback) {
    this.currentSpeed = this.clampSpeed(speed);
    this.updateUI();

    // Stop test audio if it's currently playing
    if (this.isTestingSpeed) {
      this.audioPreview.stop();
      this.isTestingSpeed = false;
      this.updateTestButtonState('idle');
    }

    if (fireCallback && this.onChangeCallback) {
      this.onChangeCallback(this.currentSpeed);
    }
  }

  /**
   * Updates the UI to reflect the current speed
   */
  updateUI() {
    // Update slider
    if (this.slider) {
      this.slider.value = this.currentSpeed;
      this.slider.setAttribute('aria-valuenow', this.currentSpeed);
    }

    // Update value display
    if (this.valueDisplay) {
      this.valueDisplay.textContent = this.formatSpeed(this.currentSpeed);
    }

    // Update preset button states
    this.presetButtons.forEach(button => {
      const presetSpeed = parseFloat(button.dataset.speed);
      if (Math.abs(presetSpeed - this.currentSpeed) < 0.01) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }

  /**
   * Sets the speed value programmatically
   * @param {number} speed - The speed value to set
   */
  setSpeed(speed) {
    this.currentSpeed = this.clampSpeed(speed);
    this.updateUI();
  }

  /**
   * Gets the current speed value
   * @returns {number} The current speed
   */
  getSpeed() {
    return this.currentSpeed;
  }

  /**
   * Registers a callback for speed changes
   * @param {Function} callback - Callback function called with the new speed value
   */
  onChange(callback) {
    this.onChangeCallback = callback;
  }

  /**
   * Clamps the speed value to valid range
   * @param {number} speed - The speed value to clamp
   * @returns {number} The clamped speed value
   */
  clampSpeed(speed) {
    return Math.max(this.MIN_SPEED, Math.min(this.MAX_SPEED, speed));
  }

  /**
   * Formats speed value for display
   * @param {number} speed - The speed value to format
   * @returns {string} Formatted speed string
   */
  formatSpeed(speed) {
    return `${speed.toFixed(2)}x`;
  }

  /**
   * Handle audio preview state changes (called by SettingsForm's shared callback)
   * @param {string} id - The audio ID
   * @param {string} state - The playback state
   * @param {string} error - Error message if state is 'error'
   */
  handleAudioPreviewStateChange(id, state, error) {
    if (id !== this.TEST_ID) return;

    this.updateTestButtonState(state);

    if (state === 'error') {
      this.isTestingSpeed = false;
      this.statusMessage.show(`Preview error: ${error || 'Unknown error'}`, 'error');
    } else if (state === 'stopped') {
      this.isTestingSpeed = false;
    }
  }

  /**
   * Handle test button click
   */
  async handleTestClick() {
    // Check if we're currently playing and should pause
    if (this.isTestingSpeed && !this.audioPreview.isPaused()) {
      this.audioPreview.pause();
      return;
    }

    // Check if we're paused and should resume
    if (this.isTestingSpeed && this.audioPreview.isPaused()) {
      await this.audioPreview.resume();
      return;
    }

    // Start new test
    this.isTestingSpeed = true;
    this.updateTestButtonState('loading');

    try {
      // Get current voice from settings
      const voice = await this.settingsStore.getSelectedVoice();

      // Synthesize test audio with current speed
      const response = await this.ttsService.synthesize(this.TEST_SAMPLE_TEXT, {
        voice: voice.id,
        speed: this.currentSpeed
      });

      // Convert response to blob using ResponseHandler
      // Server may return application/octet-stream or audio/wav
      const contentType = response.headers.get('Content-Type') || '';
      const expectedType = contentType.includes('audio/') ? 'audio/' : 'application/octet-stream';
      const audioBlob = await toBlob(response, expectedType);

      // Play the audio
      await this.audioPreview.play(this.TEST_ID, audioBlob);
    } catch (error) {
      console.error('[SpeedControl] Test failed:', error);
      this.isTestingSpeed = false;
      this.updateTestButtonState('idle');

      let errorMessage = 'Failed to test speed';

      if (error.status === 401 || error.status === 403) {
        errorMessage = 'Authentication failed. Check your API key.';
      } else if (error.message) {
        errorMessage = `Test failed: ${error.message}`;
      }

      this.statusMessage.show(errorMessage, 'error');
    }
  }

  /**
   * Update test button visual state
   * @param {string} state - 'idle', 'loading', 'playing', 'paused', 'stopped', or 'error'
   */
  updateTestButtonState(state) {
    if (!this.testButton) return;

    const icon = this.testButton.querySelector('.test-btn-icon');
    const text = this.testButton.querySelector('.test-btn-text');

    switch (state) {
      case 'loading':
        icon.textContent = '⋯';
        text.textContent = 'Loading...';
        this.testButton.disabled = false;
        this.testButton.classList.add('loading');
        this.testButton.classList.remove('playing', 'paused');
        break;

      case 'playing':
        icon.textContent = '❚❚';
        text.textContent = 'Pause';
        this.testButton.disabled = false;
        this.testButton.classList.remove('loading', 'paused');
        this.testButton.classList.add('playing');
        break;

      case 'paused':
        icon.textContent = '▶';
        text.textContent = 'Resume';
        this.testButton.disabled = false;
        this.testButton.classList.remove('loading', 'playing');
        this.testButton.classList.add('paused');
        break;

      case 'idle':
      case 'stopped':
      case 'error':
      default:
        icon.textContent = '▶';
        text.textContent = 'Test Speed';
        this.testButton.disabled = false;
        this.testButton.classList.remove('loading', 'playing', 'paused');
        break;
    }
  }

  /**
   * Cleanup method to remove event listeners
   */
  cleanup() {
    // Stop any ongoing test
    if (this.isTestingSpeed) {
      this.audioPreview.stop();
    }

    // Note: Don't clear audio preview callback - it's shared and managed by SettingsForm

    // Event listeners will be removed when the DOM is cleared
    this.slider = null;
    this.valueDisplay = null;
    this.presetButtons = [];
    this.testButton = null;
    this.onChangeCallback = null;
    this.isTestingSpeed = false;
  }
}
