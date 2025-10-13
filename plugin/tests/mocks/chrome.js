import { vi } from 'vitest';

/**
 * Mock Chrome Extension APIs
 * Used for testing extension functionality without a browser environment
 */
export const createChromeMock = () => ({
  storage: {
    sync: {
      get: vi.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: vi.fn((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: vi.fn((callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    },
    local: {
      get: vi.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: vi.fn((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: vi.fn((callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    }
  },
  runtime: {
    id: 'test-extension-id',
    getURL: vi.fn((path) => `chrome-extension://test-extension-id/${path}`),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
});
