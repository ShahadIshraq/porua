/**
 * Cache Statistics Component
 * Displays cache usage and provides clear functionality
 */

import { createElement, replaceContent } from '../shared/utils/domBuilder.js';

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
    const view = createElement('div', 'cache-stats-section', [
      createElement('div', 'cache-header', [
        createElement('span', 'cache-label', 'Cache'),
        createElement('span', { className: 'cache-size', id: 'cache-size' }, '-- MB / 100 MB')
      ]),
      createElement('button', { type: 'button', id: 'clear-cache-btn', className: 'btn-clear-cache' }, 'Clear Cache')
    ]);

    replaceContent(this.container, view);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const clearBtn = this.container.querySelector('#clear-cache-btn');
    clearBtn.addEventListener('click', () => this.clearCache());
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

    // Update size display
    this.container.querySelector('#cache-size').textContent = `${sizeMB} MB / ${maxMB} MB`;
  }

  /**
   * Display error state
   */
  displayError() {
    const sizeElem = this.container.querySelector('#cache-size');
    if (sizeElem) sizeElem.textContent = 'Error loading cache';
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
