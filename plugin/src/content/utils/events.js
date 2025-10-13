export class EventManager {
  constructor() {
    this.handlers = new Map();
  }

  on(element, event, handler, options) {
    element.addEventListener(event, handler, options);

    if (!this.handlers.has(element)) {
      this.handlers.set(element, []);
    }
    this.handlers.get(element).push({ event, handler, options });
  }

  off(element, event, handler) {
    element.removeEventListener(event, handler);
  }

  cleanup() {
    for (const [element, handlers] of this.handlers) {
      for (const { event, handler } of handlers) {
        element.removeEventListener(event, handler);
      }
    }
    this.handlers.clear();
  }
}
