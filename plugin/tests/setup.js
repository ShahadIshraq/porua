import { vi } from 'vitest';

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
