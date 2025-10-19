import { vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

// Mock console methods globally to keep test output clean
beforeEach(() => {
  global.consoleMocks = {
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Setup global mocks
global.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn()
    },
    local: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  runtime: {
    id: 'test-extension-id'
  }
};

// Mock crypto.subtle
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      importKey: vi.fn(),
      deriveKey: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn()
    },
    getRandomValues: vi.fn((arr) => arr.map((_, i) => i))
  },
  writable: true,
  configurable: true
});
