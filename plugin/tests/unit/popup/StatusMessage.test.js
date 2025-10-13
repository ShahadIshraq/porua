import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusMessage } from '../../../src/popup/StatusMessage.js';
import { TIMEOUTS } from '../../../src/shared/utils/constants.js';

describe('StatusMessage', () => {
  let statusMessage;
  let mockElement;

  beforeEach(() => {
    // Create mock element
    mockElement = document.createElement('div');
    mockElement.classList.add('hidden');

    statusMessage = new StatusMessage(mockElement);

    // Use fake timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should store element reference', () => {
      expect(statusMessage.element).toBe(mockElement);
    });
  });

  describe('show', () => {
    it('should set message text', () => {
      statusMessage.show('Test message');

      expect(mockElement.textContent).toBe('Test message');
    });

    it('should set class with default type', () => {
      statusMessage.show('Test message');

      expect(mockElement.className).toBe('status-message info');
    });

    it('should set class with custom type', () => {
      statusMessage.show('Success message', 'success');

      expect(mockElement.className).toBe('status-message success');
    });

    it('should remove hidden class', () => {
      mockElement.classList.add('hidden');

      statusMessage.show('Test message');

      expect(mockElement.classList.contains('hidden')).toBe(false);
    });

    it('should auto-hide after timeout', () => {
      statusMessage.show('Test message');

      expect(mockElement.classList.contains('hidden')).toBe(false);

      vi.advanceTimersByTime(TIMEOUTS.STATUS_MESSAGE);

      expect(mockElement.classList.contains('hidden')).toBe(true);
    });

    it('should handle error type', () => {
      statusMessage.show('Error message', 'error');

      expect(mockElement.className).toBe('status-message error');
    });

    it('should handle warning type', () => {
      statusMessage.show('Warning message', 'warning');

      expect(mockElement.className).toBe('status-message warning');
    });

    it('should replace previous message', () => {
      statusMessage.show('First message');
      statusMessage.show('Second message');

      expect(mockElement.textContent).toBe('Second message');
    });

    it('should reset timeout when showing new message', () => {
      statusMessage.show('First message');
      vi.advanceTimersByTime(TIMEOUTS.STATUS_MESSAGE - 100);

      statusMessage.show('Second message');

      // Should still be visible because second show() reset the timeout
      expect(mockElement.classList.contains('hidden')).toBe(false);

      vi.advanceTimersByTime(TIMEOUTS.STATUS_MESSAGE);

      // Now should be hidden
      expect(mockElement.classList.contains('hidden')).toBe(true);
    });

    it('should handle empty message', () => {
      statusMessage.show('');

      expect(mockElement.textContent).toBe('');
      expect(mockElement.classList.contains('hidden')).toBe(false);
    });

    it('should handle long messages', () => {
      const longMessage = 'A'.repeat(1000);

      statusMessage.show(longMessage);

      expect(mockElement.textContent).toBe(longMessage);
    });
  });

  describe('hide', () => {
    it('should add hidden class', () => {
      statusMessage.show('Test message');
      mockElement.classList.remove('hidden');

      statusMessage.hide();

      expect(mockElement.classList.contains('hidden')).toBe(true);
    });

    it('should work when already hidden', () => {
      mockElement.classList.add('hidden');

      statusMessage.hide();

      expect(mockElement.classList.contains('hidden')).toBe(true);
    });

    it('should work without prior show', () => {
      expect(() => {
        statusMessage.hide();
      }).not.toThrow();

      expect(mockElement.classList.contains('hidden')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid show calls', () => {
      statusMessage.show('Message 1');
      statusMessage.show('Message 2');
      statusMessage.show('Message 3');

      expect(mockElement.textContent).toBe('Message 3');
      expect(mockElement.classList.contains('hidden')).toBe(false);

      vi.advanceTimersByTime(TIMEOUTS.STATUS_MESSAGE);

      expect(mockElement.classList.contains('hidden')).toBe(true);
    });

    it('should handle show after hide', () => {
      statusMessage.show('First');
      statusMessage.hide();

      statusMessage.show('Second');

      expect(mockElement.textContent).toBe('Second');
      expect(mockElement.classList.contains('hidden')).toBe(false);
    });

    it('should handle special characters in message', () => {
      const specialMessage = '<script>alert("xss")</script>';

      statusMessage.show(specialMessage);

      // textContent sets text, not HTML, so it's safe
      expect(mockElement.textContent).toBe(specialMessage);
    });
  });
});
