/**
 * Manages event listeners for DOM elements, providing centralized registration,
 * removal, and cleanup of event handlers. Helps prevent memory leaks by tracking
 * all registered listeners for batch cleanup.
 *
 * @example
 * const eventManager = new EventManager();
 *
 * // Register event listeners
 * eventManager.on(button, 'click', handleClick);
 * eventManager.on(input, 'input', handleInput, { passive: true });
 *
 * // Clean up all listeners at once
 * eventManager.cleanup();
 */
export class EventManager {
  /**
   * Creates a new EventManager instance.
   * Initializes an internal Map to track all registered event handlers.
   */
  constructor() {
    this.handlers = new Map();
  }

  /**
   * Registers an event listener on an element and tracks it for later cleanup.
   *
   * @param {Element} element - The DOM element to attach the event listener to
   * @param {string} event - The event type to listen for (e.g., 'click', 'input')
   * @param {Function} handler - The callback function to execute when the event fires
   * @param {Object} [options] - Optional addEventListener options (e.g., { passive: true, capture: true })
   *
   * @example
   * const eventManager = new EventManager();
   * const button = document.querySelector('#myButton');
   * eventManager.on(button, 'click', () => console.log('clicked'));
   *
   * @example
   * // With options
   * eventManager.on(window, 'scroll', handleScroll, { passive: true });
   */
  on(element, event, handler, options) {
    element.addEventListener(event, handler, options);

    if (!this.handlers.has(element)) {
      this.handlers.set(element, []);
    }
    this.handlers.get(element).push({ event, handler, options });
  }

  /**
   * Removes a specific event listener from an element.
   * Note: This does not remove the handler from the internal tracking Map.
   * For complete cleanup of all handlers, use cleanup() instead.
   *
   * @param {Element} element - The DOM element to remove the event listener from
   * @param {string} event - The event type to remove
   * @param {Function} handler - The callback function to remove
   *
   * @example
   * eventManager.off(button, 'click', handleClick);
   */
  off(element, event, handler) {
    element.removeEventListener(event, handler);
  }

  /**
   * Removes all tracked event listeners and clears the internal handlers Map.
   * This is essential for preventing memory leaks when disposing of components
   * or cleaning up before page navigation.
   *
   * @example
   * // Clean up when component is destroyed
   * componentWillUnmount() {
   *   this.eventManager.cleanup();
   * }
   *
   * @example
   * // Clean up before navigation
   * window.addEventListener('beforeunload', () => {
   *   eventManager.cleanup();
   * });
   */
  cleanup() {
    for (const [element, handlers] of this.handlers) {
      for (const { event, handler } of handlers) {
        element.removeEventListener(event, handler);
      }
    }
    this.handlers.clear();
  }
}
