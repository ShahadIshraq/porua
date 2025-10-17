import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrefetchManager } from '../../../../src/content/prefetch/PrefetchManager.js';

// Mock modules
vi.mock('../../../../src/shared/services/TTSService.js', () => ({
  ttsService: {
    synthesizeStream: vi.fn()
  }
}));

vi.mock('../../../../src/content/audio/StreamParser.js', () => ({
  StreamParser: {
    parseMultipartStream: vi.fn(),
    buildPhraseTimeline: vi.fn()
  }
}));

describe('PrefetchManager', () => {
  let prefetchManager;
  let mockSettingsStore;
  let mockTtsService;
  let mockStreamParser;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock settings store
    mockSettingsStore = {
      get: vi.fn().mockResolvedValue({
        apiUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })
    };

    // Create prefetch manager instance
    prefetchManager = new PrefetchManager(mockSettingsStore);

    // Setup TTSService mock
    mockTtsService = (await import('../../../../src/shared/services/TTSService.js')).ttsService;

    // Setup StreamParser mock
    mockStreamParser = (await import('../../../../src/content/audio/StreamParser.js')).StreamParser;
  });

  describe('initial state', () => {
    it('should initialize with empty cache', () => {
      const stats = prefetchManager.getStats();
      expect(stats.cacheSize).toBe(0);
    });

    it('should initialize with no pending fetches', () => {
      const stats = prefetchManager.getStats();
      expect(stats.pendingFetches).toBe(0);
    });

    it('should have correct max cache size', () => {
      const stats = prefetchManager.getStats();
      expect(stats.maxCacheSize).toBe(3);
    });
  });

  describe('hasPrefetched', () => {
    it('should return false for uncached text', () => {
      expect(prefetchManager.hasPrefetched('test text')).toBe(false);
    });

    it('should return true for cached text', async () => {
      // Setup mocks for successful prefetch
      const mockReader = { read: vi.fn() };
      mockTtsService.synthesizeStream.mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue('multipart/mixed; boundary=test')
        },
        body: {
          getReader: () => mockReader
        }
      });

      mockStreamParser.parseMultipartStream.mockResolvedValue([
        {
          type: 'metadata',
          metadata: { chunk_index: 0, phrases: [] }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3])
        }
      ]);

      mockStreamParser.buildPhraseTimeline.mockReturnValue([]);

      await prefetchManager.prefetch('test text');

      expect(prefetchManager.hasPrefetched('test text')).toBe(true);
    });

    it('should trim text before checking', async () => {
      // Setup successful prefetch
      mockTtsService.synthesizeStream.mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue('multipart/mixed; boundary=test')
        },
        body: {
          getReader: () => ({ read: vi.fn() })
        }
      });

      mockStreamParser.parseMultipartStream.mockResolvedValue([
        { type: 'metadata', metadata: {} },
        { type: 'audio', audioData: new Uint8Array([1]) }
      ]);

      mockStreamParser.buildPhraseTimeline.mockReturnValue([]);

      await prefetchManager.prefetch('  test text  ');

      expect(prefetchManager.hasPrefetched('test text')).toBe(true);
      expect(prefetchManager.hasPrefetched('  test text  ')).toBe(true);
    });
  });

  describe('getPrefetched', () => {
    it('should return null for uncached text', async () => {
      const result = await prefetchManager.getPrefetched('unknown');
      expect(result).toBeNull();
    });

    it('should return cached data', async () => {
      // Setup successful prefetch
      const mockAudioData = new Uint8Array([1, 2, 3]);
      mockTtsService.synthesizeStream.mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue('multipart/mixed; boundary=test')
        },
        body: {
          getReader: () => ({ read: vi.fn() })
        }
      });

      mockStreamParser.parseMultipartStream.mockResolvedValue([
        {
          type: 'metadata',
          metadata: { chunk_index: 0, text: 'test', phrases: [] }
        },
        {
          type: 'audio',
          audioData: mockAudioData
        }
      ]);

      const mockTimeline = [{ phrase: 'test', startTime: 0, endTime: 1000 }];
      mockStreamParser.buildPhraseTimeline.mockReturnValue(mockTimeline);

      await prefetchManager.prefetch('test text');

      const result = await prefetchManager.getPrefetched('test text');

      expect(result).not.toBeNull();
      expect(result.audioBlobs).toBeDefined();
      expect(result.metadataArray).toBeDefined();
      expect(result.phraseTimeline).toEqual(mockTimeline);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('prefetch', () => {
    it('should not prefetch if already cached', async () => {
      // First prefetch
      mockTtsService.synthesizeStream.mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue('multipart/mixed; boundary=test')
        },
        body: {
          getReader: () => ({ read: vi.fn() })
        }
      });

      mockStreamParser.parseMultipartStream.mockResolvedValue([
        { type: 'metadata', metadata: {} },
        { type: 'audio', audioData: new Uint8Array([1]) }
      ]);

      mockStreamParser.buildPhraseTimeline.mockReturnValue([]);

      await prefetchManager.prefetch('test');

      // Reset mock
      mockTtsService.synthesizeStream.mockClear();

      // Second prefetch should skip
      await prefetchManager.prefetch('test');

      expect(mockTtsService.synthesizeStream).not.toHaveBeenCalled();
    });

    it('should not start duplicate prefetch for same text', async () => {
      // Setup a slow response
      let resolveFirst;
      const firstPromise = new Promise(resolve => {
        resolveFirst = resolve;
      });

      mockTtsService.synthesizeStream.mockReturnValue(firstPromise);

      // Start first prefetch (doesn't await)
      const firstFetch = prefetchManager.prefetch('test');

      // Start second prefetch while first is pending
      const secondFetch = prefetchManager.prefetch('test');

      // Resolve first
      resolveFirst({
        headers: {
          get: vi.fn().mockReturnValue('multipart/mixed; boundary=test')
        },
        body: {
          getReader: () => ({ read: vi.fn() })
        }
      });

      mockStreamParser.parseMultipartStream.mockResolvedValue([
        { type: 'metadata', metadata: {} },
        { type: 'audio', audioData: new Uint8Array([1]) }
      ]);

      mockStreamParser.buildPhraseTimeline.mockReturnValue([]);

      await Promise.all([firstFetch, secondFetch]);

      // Should only call once
      expect(mockTtsService.synthesizeStream).toHaveBeenCalledTimes(1);
    });

    it('should handle prefetch failure gracefully', async () => {
      mockTtsService.synthesizeStream.mockRejectedValue(new Error('Network error'));

      await expect(prefetchManager.prefetch('test')).rejects.toThrow('Network error');

      // Should not cache failed result
      expect(prefetchManager.hasPrefetched('test')).toBe(false);
    });

    it('should handle abort errors silently', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      mockTtsService.synthesizeStream.mockRejectedValue(abortError);

      // Should not throw
      await prefetchManager.prefetch('test');

      expect(prefetchManager.hasPrefetched('test')).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should evict oldest entry when cache exceeds limit', async () => {
      // Setup mock for successful prefetches
      mockTtsService.synthesizeStream.mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue('multipart/mixed; boundary=test')
        },
        body: {
          getReader: () => ({ read: vi.fn() })
        }
      });

      mockStreamParser.parseMultipartStream.mockResolvedValue([
        { type: 'metadata', metadata: {} },
        { type: 'audio', audioData: new Uint8Array([1]) }
      ]);

      mockStreamParser.buildPhraseTimeline.mockReturnValue([]);

      // Add 4 items (max is 3)
      await prefetchManager.prefetch('text1');
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      await prefetchManager.prefetch('text2');
      await new Promise(resolve => setTimeout(resolve, 10));
      await prefetchManager.prefetch('text3');
      await new Promise(resolve => setTimeout(resolve, 10));
      await prefetchManager.prefetch('text4');

      // Should have evicted oldest (text1)
      expect(prefetchManager.hasPrefetched('text1')).toBe(false);
      expect(prefetchManager.hasPrefetched('text2')).toBe(true);
      expect(prefetchManager.hasPrefetched('text3')).toBe(true);
      expect(prefetchManager.hasPrefetched('text4')).toBe(true);

      const stats = prefetchManager.getStats();
      expect(stats.cacheSize).toBe(3);
    });
  });

  describe('cancelPending', () => {
    it('should cancel all pending fetches', async () => {
      let abortCalled = false;
      const mockAbortController = {
        signal: {},
        abort: () => { abortCalled = true; }
      };

      // Mock AbortController
      global.AbortController = vi.fn(() => mockAbortController);

      // Start a prefetch but don't await
      mockTtsService.synthesizeStream.mockImplementation(() =>
        new Promise(() => {}) // Never resolves
      );

      prefetchManager.prefetch('test');

      // Give it a moment to register
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel
      prefetchManager.cancelPending();

      expect(abortCalled).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached entries', async () => {
      // Setup mock
      mockTtsService.synthesizeStream.mockResolvedValue({
        headers: {
          get: vi.fn().mockReturnValue('multipart/mixed; boundary=test')
        },
        body: {
          getReader: () => ({ read: vi.fn() })
        }
      });

      mockStreamParser.parseMultipartStream.mockResolvedValue([
        { type: 'metadata', metadata: {} },
        { type: 'audio', audioData: new Uint8Array([1]) }
      ]);

      mockStreamParser.buildPhraseTimeline.mockReturnValue([]);

      await prefetchManager.prefetch('text1');
      await prefetchManager.prefetch('text2');

      prefetchManager.clearCache();

      expect(prefetchManager.hasPrefetched('text1')).toBe(false);
      expect(prefetchManager.hasPrefetched('text2')).toBe(false);

      const stats = prefetchManager.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', async () => {
      const initialStats = prefetchManager.getStats();

      expect(initialStats).toEqual({
        cacheSize: 0,
        maxCacheSize: 3,
        pendingFetches: 0
      });
    });
  });
});
