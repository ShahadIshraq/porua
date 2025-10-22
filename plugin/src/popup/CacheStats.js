/**
 * Cache Statistics Component
 * Displays cache usage and provides clear functionality
 */

export class CacheStats {
  constructor() {
    this.container = null;
    this.stats = null;
  }

  /**
   * Initialize component
   * @param {HTMLElement} container - Container element
   */
  init(container) {
    this.container = container;
    this.render();
    this.attachEventListeners();
    this.loadStats();
  }

  /**
   * Render component HTML
   */
  render() {
    this.container.innerHTML = `
      <div class="cache-stats-section">
        <h3>Cache Statistics</h3>

        <div class="cache-stats-grid">
          <div class="stat-item">
            <span class="stat-label">Size:</span>
            <span class="stat-value" id="cache-size">-- MB / 100 MB</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Entries:</span>
            <span class="stat-value" id="cache-entries">--</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Hit Rate:</span>
            <span class="stat-value" id="cache-hit-rate">--%</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Hits:</span>
            <span class="stat-value" id="cache-hits">--</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Misses:</span>
            <span class="stat-value" id="cache-misses">--</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Evictions:</span>
            <span class="stat-value" id="cache-evictions">--</span>
          </div>
        </div>

        <div class="progress-bar-container">
          <div class="progress-bar">
            <div class="progress-fill" id="cache-usage-bar" style="width: 0%"></div>
          </div>
          <span class="progress-label" id="cache-usage-label">0%</span>
        </div>

        <div class="cache-actions">
          <button type="button" id="clear-cache-btn" class="btn btn-secondary">
            Clear Cache
          </button>
          <button type="button" id="refresh-stats-btn" class="btn btn-link">
            Refresh
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const clearBtn = this.container.querySelector('#clear-cache-btn');
    const refreshBtn = this.container.querySelector('#refresh-stats-btn');

    clearBtn.addEventListener('click', () => this.clearCache());
    refreshBtn.addEventListener('click', () => this.loadStats());
  }

  /**
   * Load cache statistics
   */
  async loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CACHE_GET_STATS',
        payload: {},
      });

      if (response.success) {
        this.stats = response.data;
        this.displayStats();
      } else {
        console.error('Failed to load cache stats:', response.error);
        this.displayError();
      }
    } catch (error) {
      console.error('Failed to load cache stats:', error);
      this.displayError();
    }
  }

  /**
   * Display statistics
   */
  displayStats() {
    if (!this.stats) return;

    const sizeMB = (this.stats.totalSizeBytes / (1024 * 1024)).toFixed(1);
    const maxMB = (this.stats.maxSizeBytes / (1024 * 1024)).toFixed(0);
    const usagePercent = (this.stats.usagePercent * 100).toFixed(1);
    const hitRate = (this.stats.hitRate * 100).toFixed(1);

    // Update values
    this.container.querySelector('#cache-size').textContent = `${sizeMB} MB / ${maxMB} MB`;
    this.container.querySelector('#cache-entries').textContent = this.stats.entryCount;
    this.container.querySelector('#cache-hit-rate').textContent = `${hitRate}%`;
    this.container.querySelector('#cache-hits').textContent = this.stats.hits;
    this.container.querySelector('#cache-misses').textContent = this.stats.misses;
    this.container.querySelector('#cache-evictions').textContent = this.stats.evictions;
    this.container.querySelector('#cache-usage-label').textContent = `${usagePercent}%`;

    // Update progress bar
    const progressBar = this.container.querySelector('#cache-usage-bar');
    progressBar.style.width = `${usagePercent}%`;

    // Color code based on usage
    progressBar.className = 'progress-fill';
    if (this.stats.usagePercent > 0.9) {
      progressBar.classList.add('danger');
    } else if (this.stats.usagePercent > 0.7) {
      progressBar.classList.add('warning');
    }
  }

  /**
   * Display error state
   */
  displayError() {
    const elements = ['cache-size', 'cache-entries', 'cache-hit-rate', 'cache-hits', 'cache-misses', 'cache-evictions'];
    elements.forEach((id) => {
      const elem = this.container.querySelector(`#${id}`);
      if (elem) elem.textContent = 'Error';
    });
  }

  /**
   * Clear cache
   */
  async clearCache() {
    if (!confirm('Clear all cached audio? This cannot be undone.')) {
      return;
    }

    const clearBtn = this.container.querySelector('#clear-cache-btn');
    const originalText = clearBtn.textContent;

    try {
      clearBtn.disabled = true;
      clearBtn.textContent = 'Clearing...';

      const response = await chrome.runtime.sendMessage({
        type: 'CACHE_CLEAR',
        payload: {},
      });

      if (response.success) {
        // Reload stats to show cleared state
        await this.loadStats();

        // Show success message briefly
        clearBtn.textContent = 'Cleared!';
        setTimeout(() => {
          clearBtn.textContent = originalText;
        }, 2000);
      } else {
        console.error('Failed to clear cache:', response.error);
        clearBtn.textContent = 'Error';
        setTimeout(() => {
          clearBtn.textContent = originalText;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
      clearBtn.textContent = 'Error';
      setTimeout(() => {
        clearBtn.textContent = originalText;
      }, 2000);
    } finally {
      clearBtn.disabled = false;
    }
  }
}
