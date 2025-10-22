import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MESSAGE_TYPES } from '../../../../../src/background/messages/protocol.js';

// Mock the CacheService module
const mockCacheInstance = {
  getStats: vi.fn(),
  clear: vi.fn(),
  configure: vi.fn(),
};

vi.mock('../../../../../src/background/cache/CacheService.js', () => ({
  CacheService: {
    getInstance: vi.fn(() => Promise.resolve(mockCacheInstance)),
  },
}));

describe('CacheHandlers', () => {
  let registerCacheHandlers;
  let mockRouter;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import after mocks are set up
    const module = await import('../../../../../src/background/messages/handlers/CacheHandlers.js');
    registerCacheHandlers = module.registerCacheHandlers;

    mockRouter = {
      registerHandler: vi.fn(),
    };
  });

  describe('registerCacheHandlers', () => {
    it('should register CACHE_GET_STATS handler', () => {
      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const statsHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_GET_STATS);

      expect(statsHandler).toBeDefined();
      expect(statsHandler[1]).toBeInstanceOf(Function);
    });

    it('should register CACHE_CLEAR handler', () => {
      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const clearHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_CLEAR);

      expect(clearHandler).toBeDefined();
      expect(clearHandler[1]).toBeInstanceOf(Function);
    });

    it('should register CACHE_CONFIGURE handler', () => {
      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const configHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_CONFIGURE);

      expect(configHandler).toBeDefined();
      expect(configHandler[1]).toBeInstanceOf(Function);
    });
  });

  describe('CACHE_GET_STATS handler', () => {
    it('should return cache statistics', async () => {
      const mockStats = {
        totalSizeBytes: 10000,
        maxSizeBytes: 100000,
        usagePercent: 0.1,
        entryCount: 5,
        hits: 50,
        misses: 10,
        hitRate: 0.83,
        evictions: 2,
      };

      mockCacheInstance.getStats.mockResolvedValue(mockStats);

      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const statsHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_GET_STATS);
      const handlerFn = statsHandler[1];

      const result = await handlerFn();

      expect(result).toEqual(mockStats);
      expect(mockCacheInstance.getStats).toHaveBeenCalled();
    });
  });

  describe('CACHE_CLEAR handler', () => {
    it('should clear cache and return success', async () => {
      mockCacheInstance.clear.mockResolvedValue(undefined);

      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const clearHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_CLEAR);
      const handlerFn = clearHandler[1];

      const result = await handlerFn();

      expect(result).toEqual({ cleared: true });
      expect(mockCacheInstance.clear).toHaveBeenCalled();
    });

    it('should propagate errors from cache.clear', async () => {
      mockCacheInstance.clear.mockRejectedValue(new Error('Clear failed'));

      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const clearHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_CLEAR);
      const handlerFn = clearHandler[1];

      await expect(handlerFn()).rejects.toThrow('Clear failed');
    });
  });

  describe('CACHE_CONFIGURE handler', () => {
    it('should configure cache with provided settings', async () => {
      const config = { maxSizeBytes: 200 * 1024 * 1024 };
      mockCacheInstance.configure.mockResolvedValue(undefined);

      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const configHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_CONFIGURE);
      const handlerFn = configHandler[1];

      const result = await handlerFn(config);

      expect(result).toEqual({ updated: true });
      expect(mockCacheInstance.configure).toHaveBeenCalledWith(config);
    });

    it('should propagate errors from cache.configure', async () => {
      const config = { maxSizeBytes: 50 * 1024 * 1024 };
      mockCacheInstance.configure.mockRejectedValue(new Error('Configure failed'));

      registerCacheHandlers(mockRouter);

      const calls = mockRouter.registerHandler.mock.calls;
      const configHandler = calls.find((call) => call[0] === MESSAGE_TYPES.CACHE_CONFIGURE);
      const handlerFn = configHandler[1];

      await expect(handlerFn(config)).rejects.toThrow('Configure failed');
    });
  });
});
