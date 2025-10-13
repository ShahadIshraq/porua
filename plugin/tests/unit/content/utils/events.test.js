import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventManager } from '../../../../src/content/utils/events.js';

describe('EventManager', () => {
  let eventManager;
  let mockElement;

  beforeEach(() => {
    eventManager = new EventManager();
    mockElement = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
  });

  describe('on', () => {
    it('should add event listener to element', () => {
      const handler = vi.fn();

      eventManager.on(mockElement, 'click', handler);

      expect(mockElement.addEventListener).toHaveBeenCalledWith('click', handler, undefined);
    });

    it('should store handler in map', () => {
      const handler = vi.fn();

      eventManager.on(mockElement, 'click', handler);

      expect(eventManager.handlers.has(mockElement)).toBe(true);
      const handlers = eventManager.handlers.get(mockElement);
      expect(handlers).toHaveLength(1);
      expect(handlers[0]).toEqual({ event: 'click', handler, options: undefined });
    });

    it('should support event listener options', () => {
      const handler = vi.fn();
      const options = { once: true, passive: true };

      eventManager.on(mockElement, 'scroll', handler, options);

      expect(mockElement.addEventListener).toHaveBeenCalledWith('scroll', handler, options);
      const handlers = eventManager.handlers.get(mockElement);
      expect(handlers[0].options).toEqual(options);
    });

    it('should handle multiple handlers for same element', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventManager.on(mockElement, 'click', handler1);
      eventManager.on(mockElement, 'mouseover', handler2);

      const handlers = eventManager.handlers.get(mockElement);
      expect(handlers).toHaveLength(2);
      expect(handlers[0].event).toBe('click');
      expect(handlers[1].event).toBe('mouseover');
    });

    it('should handle multiple elements', () => {
      const mockElement2 = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventManager.on(mockElement, 'click', handler1);
      eventManager.on(mockElement2, 'click', handler2);

      expect(eventManager.handlers.size).toBe(2);
      expect(eventManager.handlers.has(mockElement)).toBe(true);
      expect(eventManager.handlers.has(mockElement2)).toBe(true);
    });
  });

  describe('off', () => {
    it('should remove event listener from element', () => {
      const handler = vi.fn();

      eventManager.off(mockElement, 'click', handler);

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('click', handler);
    });

    it('should remove event listener that was added', () => {
      const handler = vi.fn();
      eventManager.on(mockElement, 'click', handler);

      eventManager.off(mockElement, 'click', handler);

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('click', handler);
    });

    it('should handle removing non-existent handler gracefully', () => {
      const handler = vi.fn();

      // Should not throw
      expect(() => {
        eventManager.off(mockElement, 'click', handler);
      }).not.toThrow();

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('click', handler);
    });
  });

  describe('cleanup', () => {
    it('should remove all event listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventManager.on(mockElement, 'click', handler1);
      eventManager.on(mockElement, 'mouseover', handler2);

      eventManager.cleanup();

      expect(mockElement.removeEventListener).toHaveBeenCalledTimes(2);
      expect(mockElement.removeEventListener).toHaveBeenCalledWith('click', handler1);
      expect(mockElement.removeEventListener).toHaveBeenCalledWith('mouseover', handler2);
    });

    it('should clear handlers map', () => {
      const handler = vi.fn();
      eventManager.on(mockElement, 'click', handler);

      eventManager.cleanup();

      expect(eventManager.handlers.size).toBe(0);
    });

    it('should handle multiple elements', () => {
      const mockElement2 = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventManager.on(mockElement, 'click', handler1);
      eventManager.on(mockElement2, 'mouseover', handler2);

      eventManager.cleanup();

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('click', handler1);
      expect(mockElement2.removeEventListener).toHaveBeenCalledWith('mouseover', handler2);
      expect(eventManager.handlers.size).toBe(0);
    });

    it('should work on empty event manager', () => {
      expect(() => {
        eventManager.cleanup();
      }).not.toThrow();

      expect(eventManager.handlers.size).toBe(0);
    });

    it('should handle cleanup called multiple times', () => {
      const handler = vi.fn();
      eventManager.on(mockElement, 'click', handler);

      eventManager.cleanup();
      eventManager.cleanup(); // Second cleanup

      expect(eventManager.handlers.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle same handler added twice for same event', () => {
      const handler = vi.fn();

      eventManager.on(mockElement, 'click', handler);
      eventManager.on(mockElement, 'click', handler);

      const handlers = eventManager.handlers.get(mockElement);
      expect(handlers).toHaveLength(2);
      expect(mockElement.addEventListener).toHaveBeenCalledTimes(2);
    });

    it('should preserve independence between multiple event managers', () => {
      const eventManager2 = new EventManager();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventManager.on(mockElement, 'click', handler1);
      eventManager2.on(mockElement, 'click', handler2);

      expect(eventManager.handlers.size).toBe(1);
      expect(eventManager2.handlers.size).toBe(1);

      eventManager.cleanup();

      expect(eventManager.handlers.size).toBe(0);
      expect(eventManager2.handlers.size).toBe(1);
    });
  });
});
