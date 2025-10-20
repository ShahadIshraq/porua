import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkipControl } from '../../../src/popup/SkipControl.js';

describe('SkipControl', () => {
  let container;
  let skipControl;

  beforeEach(() => {
    // Create a fresh container for each test
    container = document.createElement('div');
    document.body.appendChild(container);

    skipControl = new SkipControl(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('constructor', () => {
    it('should initialize with container', () => {
      expect(skipControl.container).toBe(container);
    });

    it('should set default skip interval to 10 seconds', () => {
      expect(skipControl.currentSkipInterval).toBe(10);
    });

    it('should initialize with null onChange callback', () => {
      expect(skipControl.onChangeCallback).toBeNull();
    });

    it('should have predefined presets', () => {
      expect(skipControl.PRESETS).toEqual([
        { value: 5, label: '5s' },
        { value: 10, label: '10s' },
        { value: 15, label: '15s' },
        { value: 30, label: '30s' }
      ]);
    });

    it('should initialize preset buttons array', () => {
      expect(skipControl.presetButtons).toEqual([]);
    });
  });

  describe('init', () => {
    it('should set initial skip interval', () => {
      skipControl.init(15);

      expect(skipControl.currentSkipInterval).toBe(15);
    });

    it('should use default interval when not provided', () => {
      skipControl.init();

      expect(skipControl.currentSkipInterval).toBe(10);
    });

    it('should render the UI', () => {
      skipControl.init();

      expect(container.querySelector('.skip-control')).toBeTruthy();
      expect(container.querySelector('.skip-label')).toBeTruthy();
      expect(container.querySelector('.skip-presets')).toBeTruthy();
    });

    it('should create preset buttons', () => {
      skipControl.init();

      const buttons = container.querySelectorAll('.skip-preset-btn');
      expect(buttons.length).toBe(4);
    });

    it('should cache preset buttons', () => {
      skipControl.init();

      expect(skipControl.presetButtons.length).toBe(4);
    });
  });

  describe('render', () => {
    it('should create skip control structure', () => {
      skipControl.render();

      expect(container.querySelector('.skip-control')).toBeTruthy();
    });

    it('should create label', () => {
      skipControl.render();

      const label = container.querySelector('.skip-label');
      expect(label.textContent).toBe('Skip Interval');
    });

    it('should create help text', () => {
      skipControl.render();

      const helpText = container.querySelector('.help-text');
      expect(helpText.textContent).toContain('skip');
    });

    it('should create button for each preset', () => {
      skipControl.render();

      const buttons = container.querySelectorAll('.skip-preset-btn');
      expect(buttons.length).toBe(skipControl.PRESETS.length);
    });

    it('should set correct interval data attribute', () => {
      skipControl.render();

      const button5s = container.querySelector('[data-interval="5"]');
      expect(button5s).toBeTruthy();
      expect(button5s.textContent.trim()).toBe('5s');
    });

    it('should mark current interval as active', () => {
      skipControl.currentSkipInterval = 15;
      skipControl.render();

      const button15s = container.querySelector('[data-interval="15"]');
      expect(button15s.classList.contains('active')).toBe(true);
      expect(button15s.getAttribute('aria-pressed')).toBe('true');
    });

    it('should not mark other intervals as active', () => {
      skipControl.currentSkipInterval = 15;
      skipControl.render();

      const button10s = container.querySelector('[data-interval="10"]');
      expect(button10s.classList.contains('active')).toBe(false);
      expect(button10s.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('setupEventListeners', () => {
    it('should handle button clicks', () => {
      skipControl.init(10);

      const button15s = container.querySelector('[data-interval="15"]');
      button15s.click();

      expect(skipControl.currentSkipInterval).toBe(15);
    });

    it('should update UI when button clicked', () => {
      skipControl.init(10);

      const button5s = container.querySelector('[data-interval="5"]');
      button5s.click();

      expect(button5s.classList.contains('active')).toBe(true);
    });

    it('should trigger onChange callback', () => {
      const callback = vi.fn();
      skipControl.onChange(callback);
      skipControl.init();

      const button30s = container.querySelector('[data-interval="30"]');
      button30s.click();

      expect(callback).toHaveBeenCalledWith(30);
    });
  });

  describe('setSkipInterval', () => {
    beforeEach(() => {
      skipControl.init();
    });

    it('should update current skip interval', () => {
      skipControl.setSkipInterval(30);

      expect(skipControl.currentSkipInterval).toBe(30);
    });

    it('should update preset buttons', () => {
      skipControl.setSkipInterval(15);

      const button15s = container.querySelector('[data-interval="15"]');
      expect(button15s.classList.contains('active')).toBe(true);
    });

    it('should call onChange callback when set', () => {
      const callback = vi.fn();
      skipControl.onChange(callback);

      skipControl.setSkipInterval(5);

      expect(callback).toHaveBeenCalledWith(5);
    });

    it('should not throw when onChange callback not set', () => {
      expect(() => skipControl.setSkipInterval(20)).not.toThrow();
    });
  });

  describe('getSkipInterval', () => {
    it('should return current skip interval', () => {
      skipControl.currentSkipInterval = 15;

      expect(skipControl.getSkipInterval()).toBe(15);
    });

    it('should return default interval initially', () => {
      expect(skipControl.getSkipInterval()).toBe(10);
    });
  });

  describe('updatePresetButtons', () => {
    beforeEach(() => {
      skipControl.init();
    });

    it('should mark correct button as active', () => {
      skipControl.currentSkipInterval = 5;
      skipControl.updatePresetButtons();

      const button5s = container.querySelector('[data-interval="5"]');
      expect(button5s.classList.contains('active')).toBe(true);
    });

    it('should remove active from other buttons', () => {
      skipControl.currentSkipInterval = 5;
      skipControl.updatePresetButtons();

      const button10s = container.querySelector('[data-interval="10"]');
      expect(button10s.classList.contains('active')).toBe(false);
    });

    it('should set aria-pressed correctly', () => {
      skipControl.currentSkipInterval = 30;
      skipControl.updatePresetButtons();

      const button30s = container.querySelector('[data-interval="30"]');
      expect(button30s.getAttribute('aria-pressed')).toBe('true');

      const button10s = container.querySelector('[data-interval="10"]');
      expect(button10s.getAttribute('aria-pressed')).toBe('false');
    });

    it('should handle all preset values', () => {
      skipControl.PRESETS.forEach(preset => {
        skipControl.currentSkipInterval = preset.value;
        skipControl.updatePresetButtons();

        const button = container.querySelector(`[data-interval="${preset.value}"]`);
        expect(button.classList.contains('active')).toBe(true);
      });
    });
  });

  describe('onChange', () => {
    it('should register callback', () => {
      const callback = vi.fn();

      skipControl.onChange(callback);

      expect(skipControl.onChangeCallback).toBe(callback);
    });

    it('should replace previous callback', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      skipControl.onChange(callback1);
      skipControl.onChange(callback2);

      expect(skipControl.onChangeCallback).toBe(callback2);
    });
  });

  describe('cleanup', () => {
    it('should not throw when called', () => {
      skipControl.init();

      expect(() => skipControl.cleanup()).not.toThrow();
    });
  });

  describe('integration', () => {
    it('should complete full workflow', () => {
      const callback = vi.fn();

      // Initialize with default
      skipControl.init();
      expect(skipControl.getSkipInterval()).toBe(10);

      // Register callback
      skipControl.onChange(callback);

      // Change interval via UI click
      const button15s = container.querySelector('[data-interval="15"]');
      button15s.click();

      // Verify state
      expect(skipControl.getSkipInterval()).toBe(15);
      expect(callback).toHaveBeenCalledWith(15);
      expect(button15s.classList.contains('active')).toBe(true);
    });

    it('should handle multiple interval changes', () => {
      const callback = vi.fn();
      skipControl.onChange(callback);
      skipControl.init();

      // Change multiple times
      container.querySelector('[data-interval="5"]').click();
      container.querySelector('[data-interval="30"]').click();
      container.querySelector('[data-interval="10"]').click();

      expect(callback).toHaveBeenCalledTimes(3);
      expect(skipControl.getSkipInterval()).toBe(10);
    });
  });
});
