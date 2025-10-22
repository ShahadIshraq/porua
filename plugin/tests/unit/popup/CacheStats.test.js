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
      expect(container.querySelector('h3').textContent).toBe('Cache Statistics');
    });

    it('should render all stat elements', () => {
      cacheStats.init(container);

      expect(container.querySelector('#cache-size')).toBeTruthy();
      expect(container.querySelector('#cache-entries')).toBeTruthy();
      expect(container.querySelector('#cache-hit-rate')).toBeTruthy();
      expect(container.querySelector('#cache-hits')).toBeTruthy();
      expect(container.querySelector('#cache-misses')).toBeTruthy();
      expect(container.querySelector('#cache-evictions')).toBeTruthy();
    });

    it('should render progress bar', () => {
      cacheStats.init(container);

      expect(container.querySelector('.progress-bar-container')).toBeTruthy();
      expect(container.querySelector('#cache-usage-bar')).toBeTruthy();
      expect(container.querySelector('#cache-usage-label')).toBeTruthy();
    });

    it('should render action buttons', () => {
      cacheStats.init(container);

      expect(container.querySelector('#clear-cache-btn')).toBeTruthy();
      expect(container.querySelector('#refresh-stats-btn')).toBeTruthy();
    });
  });

  describe('displayStats', () => {
    beforeEach(() => {
      cacheStats.init(container);
    });

    it('should display cache size correctly', () => {
      cacheStats.stats = {
        totalSizeBytes: 10 * 1024 * 1024, // 10 MB
        maxSizeBytes: 100 * 1024 * 1024, // 100 MB
        usagePercent: 0.1,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-size').textContent).toBe('10.0 MB / 100 MB');
    });

    it('should display entry count', () => {
      cacheStats.stats = {
        totalSizeBytes: 0,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0,
        entryCount: 42,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-entries').textContent).toBe('42');
    });

    it('should display hit rate as percentage', () => {
      cacheStats.stats = {
        totalSizeBytes: 0,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0,
        entryCount: 0,
        hits: 75,
        misses: 25,
        hitRate: 0.75,
        evictions: 0,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-hit-rate').textContent).toBe('75.0%');
    });

    it('should display hits and misses', () => {
      cacheStats.stats = {
        totalSizeBytes: 0,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0,
        entryCount: 0,
        hits: 156,
        misses: 42,
        hitRate: 0.78,
        evictions: 0,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-hits').textContent).toBe('156');
      expect(container.querySelector('#cache-misses').textContent).toBe('42');
    });

    it('should display evictions count', () => {
      cacheStats.stats = {
        totalSizeBytes: 0,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 7,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-evictions').textContent).toBe('7');
    });

    it('should update progress bar width', () => {
      cacheStats.stats = {
        totalSizeBytes: 50 * 1024 * 1024,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0.5,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      const progressBar = container.querySelector('#cache-usage-bar');
      // Browser may strip trailing .0
      expect(progressBar.style.width).toMatch(/^50(\.0)?%$/);
    });

    it('should update progress bar label', () => {
      cacheStats.stats = {
        totalSizeBytes: 30 * 1024 * 1024,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0.3,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      expect(container.querySelector('#cache-usage-label').textContent).toBe('30.0%');
    });

    it('should add danger class when usage > 90%', () => {
      cacheStats.stats = {
        totalSizeBytes: 95 * 1024 * 1024,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0.95,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      const progressBar = container.querySelector('#cache-usage-bar');
      expect(progressBar.classList.contains('danger')).toBe(true);
    });

    it('should add warning class when usage between 70-90%', () => {
      cacheStats.stats = {
        totalSizeBytes: 80 * 1024 * 1024,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0.8,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      const progressBar = container.querySelector('#cache-usage-bar');
      expect(progressBar.classList.contains('warning')).toBe(true);
    });

    it('should not add warning/danger class when usage < 70%', () => {
      cacheStats.stats = {
        totalSizeBytes: 50 * 1024 * 1024,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0.5,
        entryCount: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };

      cacheStats.displayStats();

      const progressBar = container.querySelector('#cache-usage-bar');
      expect(progressBar.classList.contains('warning')).toBe(false);
      expect(progressBar.classList.contains('danger')).toBe(false);
    });
  });

  describe('displayError', () => {
    beforeEach(() => {
      cacheStats.init(container);
    });

    it('should display "Error" for all stats', () => {
      cacheStats.displayError();

      expect(container.querySelector('#cache-size').textContent).toBe('Error');
      expect(container.querySelector('#cache-entries').textContent).toBe('Error');
      expect(container.querySelector('#cache-hit-rate').textContent).toBe('Error');
      expect(container.querySelector('#cache-hits').textContent).toBe('Error');
      expect(container.querySelector('#cache-misses').textContent).toBe('Error');
      expect(container.querySelector('#cache-evictions').textContent).toBe('Error');
    });
  });

  describe('loadStats', () => {
    beforeEach(() => {
      cacheStats.init(container);
    });

    it('should send message to get cache stats', async () => {
      const mockStats = {
        totalSizeBytes: 1000,
        maxSizeBytes: 100000,
        usagePercent: 0.01,
        entryCount: 5,
        hits: 10,
        misses: 2,
        hitRate: 0.83,
        evictions: 0,
      };

      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: mockStats,
      });

      await cacheStats.loadStats();

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CACHE_GET_STATS',
        payload: {},
      });
    });

    it('should store and display stats on success', async () => {
      const mockStats = {
        totalSizeBytes: 5 * 1024 * 1024,
        maxSizeBytes: 100 * 1024 * 1024,
        usagePercent: 0.05,
        entryCount: 3,
        hits: 20,
        misses: 5,
        hitRate: 0.8,
        evictions: 1,
      };

      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: mockStats,
      });

      await cacheStats.loadStats();

      expect(cacheStats.stats).toEqual(mockStats);
      expect(container.querySelector('#cache-entries').textContent).toBe('3');
    });

    it('should handle error response', async () => {
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: { message: 'Failed to get stats' },
      });

      await cacheStats.loadStats();

      // Should call displayError
      expect(container.querySelector('#cache-size').textContent).toBe('Error');
    });

    it('should handle promise rejection', async () => {
      global.chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));

      await cacheStats.loadStats();

      // Should call displayError
      expect(container.querySelector('#cache-size').textContent).toBe('Error');
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      // Mock loadStats to prevent it from being called during init
      global.chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {},
      });
      cacheStats.init(container);
      // Clear the mock after init
      global.chrome.runtime.sendMessage.mockClear();
    });

    it('should ask for confirmation', async () => {
      global.confirm.mockReturnValue(false);

      await cacheStats.clearCache();

      expect(global.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Clear all cached audio')
      );
    });

    it('should not clear if user cancels', async () => {
      global.confirm.mockReturnValue(false);

      await cacheStats.clearCache();

      expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('should send clear message when confirmed', async () => {
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      await cacheStats.clearCache();

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CACHE_CLEAR',
        payload: {},
      });
    });

    it('should reload stats after clearing', async () => {
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true }) // clear
        .mockResolvedValueOnce({ success: true, data: {} }); // reload stats

      await cacheStats.clearCache();

      // Should be called twice: once for clear, once for reload
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should update button text during operation', async () => {
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockImplementation(() => {
        // Check button text during operation
        const btn = container.querySelector('#clear-cache-btn');
        expect(btn.textContent).toBe('Clearing...');
        expect(btn.disabled).toBe(true);

        return Promise.resolve({ success: true });
      });

      await cacheStats.clearCache();

      // Should restore button text after operation
      await vi.waitFor(() => {
        const btn = container.querySelector('#clear-cache-btn');
        expect(btn.disabled).toBe(false);
      });
    });

    it('should handle clear errors gracefully', async () => {
      global.confirm.mockReturnValue(true);
      global.chrome.runtime.sendMessage.mockRejectedValue(new Error('Clear failed'));

      await cacheStats.clearCache();

      // Should restore button state
      await vi.waitFor(() => {
        const btn = container.querySelector('#clear-cache-btn');
        expect(btn.disabled).toBe(false);
      });
    });
  });

  describe('event listeners', () => {
    it('should call loadStats when refresh button is clicked', async () => {
      cacheStats.init(container);

      const spy = vi.spyOn(cacheStats, 'loadStats');
      const refreshBtn = container.querySelector('#refresh-stats-btn');

      refreshBtn.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should call clearCache when clear button is clicked', async () => {
      cacheStats.init(container);

      const spy = vi.spyOn(cacheStats, 'clearCache');
      const clearBtn = container.querySelector('#clear-cache-btn');

      clearBtn.click();

      expect(spy).toHaveBeenCalled();
    });
  });
});
