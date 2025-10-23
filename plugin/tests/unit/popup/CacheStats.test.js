import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheStats } from '../../../src/popup/CacheStats.js';

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
  },
};

// Mock window.confirm
global.confirm = vi.fn();

describe('CacheStats', () => {
  let cacheStats;
  let container;

  beforeEach(() => {
    // Create container element
    container = document.createElement('div');
    document.body.appendChild(container);

    // Reset mocks
    vi.clearAllMocks();
    global.chrome.runtime.sendMessage.mockReset();
    global.confirm.mockReturnValue(true);

    // Create instance
    cacheStats = new CacheStats();
  });

  afterEach(() => {
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('init', () => {
    it('should render component HTML', () => {
      cacheStats.init(container);

      expect(container.querySelector('.cache-stats-section')).toBeTruthy();
      expect(container.querySelector('.cache-header')).toBeTruthy();
    });

    it('should render cache label and size', () => {
      cacheStats.init(container);

      expect(container.querySelector('.cache-label')).toBeTruthy();
      expect(container.querySelector('.cache-label').textContent).toBe('Cache');
      expect(container.querySelector('#cache-size')).toBeTruthy();
    });

    it('should render clear cache button', () => {
      cacheStats.init(container);

      const clearBtn = container.querySelector('#clear-cache-btn');
      expect(clearBtn).toBeTruthy();
      expect(clearBtn.textContent).toContain('Clear Cache');
    });

    it('should attach event listeners', () => {
      cacheStats.init(container);

      const clearBtn = container.querySelector('#clear-cache-btn');
      expect(clearBtn).toBeTruthy();
    });
  });

  describe('displayStats', () => {
    beforeEach(() => {
      // Mock sendMessage before init
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {
          totalSizeBytes: 0,
          maxSizeBytes: 100 * 1024 * 1024,
          usagePercent: 0,
          entryCount: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
          evictions: 0,
        },
      });

      cacheStats.init(container);

      // Clear mock after init
      global.chrome.runtime.sendMessage.mockClear();
    });

    it('should display cache size correctly', () => {
      cacheStats.stats = {
        totalSizeBytes: 10 * 1024 * 1024, // 10 MB
        maxSizeBytes: 100 * 1024 * 1024, // 100 MB
        usagePercent: 0.1,
        entryCount: 5,
        hits: 10,
        misses: 5,
        hitRate: 0.67,
        evictions: 0,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-size').textContent).toBe('10.0 MB / 100 MB');
    });

    it('should display 0 MB when cache is empty', () => {
      cacheStats.stats = {
        totalSizeBytes: 0,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-size').textContent).toBe('0.0 MB / 100 MB');
    });

    it('should handle large cache sizes', () => {
      cacheStats.stats = {
        totalSizeBytes: 95 * 1024 * 1024, // 95 MB
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0.95,
        entryCount: 100,
        hits: 500,
        misses: 100,
        hitRate: 0.83,
        evictions: 10,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-size').textContent).toBe('95.0 MB / 100 MB');
    });
  });

  describe('loadStats', () => {
    beforeEach(() => {
      // Mock sendMessage before init
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {
          totalSizeBytes: 0,
          maxSizeBytes: 100 * 1024 * 1024,
          usagePercent: 0,
          entryCount: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
          evictions: 0,
        },
      });

      cacheStats.init(container);

      // Clear mock after init
      global.chrome.runtime.sendMessage.mockClear();
    });

    it('should send CACHE_GET_STATS message', async () => {
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {
          totalSizeBytes: 10 * 1024 * 1024,
          maxSizeBytes: 100 * 1024 * 1024,
          usagePercent: 0.1,
          entryCount: 5,
          hits: 10,
          misses: 5,
          hitRate: 0.67,
          evictions: 0,
        },
      });

      await cacheStats.loadStats();

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CACHE_GET_STATS',
        payload: {},
      });
    });

    it('should update display on success', async () => {
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {
          totalSizeBytes: 25 * 1024 * 1024,
          maxSizeBytes: 100 * 1024 * 1024,
          usagePercent: 0.25,
          entryCount: 10,
          hits: 20,
          misses: 10,
          hitRate: 0.67,
          evictions: 2,
        },
      });

      await cacheStats.loadStats();

      expect(container.querySelector('#cache-size').textContent).toBe('25.0 MB / 100 MB');
    });

    it('should handle error response', async () => {
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Failed to get cache stats',
      });

      await cacheStats.loadStats();

      expect(container.querySelector('#cache-size').textContent).toBe('Error loading cache');
    });

    it('should handle exception', async () => {
      global.chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));

      await cacheStats.loadStats();

      expect(container.querySelector('#cache-size').textContent).toBe('Error loading cache');
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      // Mock sendMessage before init
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {
          totalSizeBytes: 10 * 1024 * 1024,
          maxSizeBytes: 100 * 1024 * 1024,
          usagePercent: 0.1,
          entryCount: 5,
          hits: 10,
          misses: 5,
          hitRate: 0.67,
          evictions: 0,
        },
      });

      cacheStats.init(container);

      // Clear mock after init
      global.chrome.runtime.sendMessage.mockClear();
    });

    it('should prompt for confirmation', async () => {
      global.confirm.mockReturnValue(false);

      await cacheStats.clearCache();

      expect(global.confirm).toHaveBeenCalledWith('Clear all cached audio? This cannot be undone.');
      expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('should send CACHE_CLEAR message when confirmed', async () => {
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      await cacheStats.clearCache();

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CACHE_CLEAR',
        payload: {},
      });
    });

    it('should update button text while clearing', async () => {
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true, data: {} }), 10);
          })
      );

      const clearBtn = container.querySelector('#clear-cache-btn');
      const clearPromise = cacheStats.clearCache();

      // Check button is disabled and text changed
      expect(clearBtn.disabled).toBe(true);
      expect(clearBtn.textContent).toBe('Clearing...');

      await clearPromise;
    });

    it('should show success message after clearing', async () => {
      vi.useFakeTimers();
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {
          totalSizeBytes: 0,
          maxSizeBytes: 100 * 1024 * 1024,
          usagePercent: 0,
          entryCount: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
          evictions: 0,
        },
      });

      const clearBtn = container.querySelector('#clear-cache-btn');
      await cacheStats.clearCache();

      expect(clearBtn.textContent).toBe('Cleared!');
      expect(clearBtn.disabled).toBe(false);

      // Fast-forward time
      vi.advanceTimersByTime(2000);

      expect(clearBtn.textContent).toContain('Clear Cache');

      vi.useRealTimers();
    });

    it('should handle error during clear', async () => {
      vi.useFakeTimers();
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Failed to clear cache',
      });

      const clearBtn = container.querySelector('#clear-cache-btn');
      await cacheStats.clearCache();

      expect(clearBtn.textContent).toContain('Error');
      expect(clearBtn.disabled).toBe(false);

      // Fast-forward time
      vi.advanceTimersByTime(2000);

      expect(clearBtn.textContent).toContain('Clear Cache');

      vi.useRealTimers();
    });

    it('should handle exception during clear', async () => {
      vi.useFakeTimers();
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));

      const clearBtn = container.querySelector('#clear-cache-btn');
      await cacheStats.clearCache();

      expect(clearBtn.textContent).toContain('Error');
      expect(clearBtn.disabled).toBe(false);

      // Fast-forward time
      vi.advanceTimersByTime(2000);

      expect(clearBtn.textContent).toContain('Clear Cache');

      vi.useRealTimers();
    });
  });
});
