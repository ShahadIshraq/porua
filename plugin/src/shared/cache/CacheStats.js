/**
 * Tracks cache statistics and performance metrics
 */
export class CacheStats {
  constructor() {
    this.reset();
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.hits = { hot: 0, warm: 0 };
    this.misses = 0;
    this.stores = 0;
    this.evictions = 0;
    this.bytesStored = 0;
    this.bytesSaved = 0;  // Network bandwidth saved
    this.startTime = Date.now();
  }

  /**
   * Record cache hit
   * @param {string} layer - 'hot' or 'warm'
   */
  recordHit(layer) {
    this.hits[layer]++;
    // Estimate network savings (assume avg 1MB per request)
    this.bytesSaved += 1024 * 1024;
  }

  /**
   * Record cache miss
   */
  recordMiss() {
    this.misses++;
  }

  /**
   * Record cache store operation
   * @param {number} bytes - Size of stored data
   */
  recordStore(bytes) {
    this.stores++;
    this.bytesStored += bytes;
  }

  /**
   * Record cache eviction
   * @param {number} bytes - Size of evicted data
   */
  recordEviction(bytes) {
    this.evictions++;
    this.bytesStored -= bytes;
  }

  /**
   * Get cache hit rate percentage
   * @returns {number} Hit rate (0-100)
   */
  getHitRate() {
    const total = this.getTotalHits() + this.misses;
    return total === 0 ? 0 : (this.getTotalHits() / total) * 100;
  }

  /**
   * Get total hits across all layers
   * @returns {number} Total hits
   */
  getTotalHits() {
    return this.hits.hot + this.hits.warm;
  }

  /**
   * Convert stats to plain object
   * @returns {Object} Statistics object
   */
  toObject() {
    return {
      hits: { ...this.hits, total: this.getTotalHits() },
      misses: this.misses,
      hitRate: this.getHitRate().toFixed(2) + '%',
      stores: this.stores,
      evictions: this.evictions,
      bytesStored: this.formatBytes(this.bytesStored),
      bytesSaved: this.formatBytes(this.bytesSaved),
      uptime: this.formatUptime()
    };
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  /**
   * Format uptime to human-readable string
   * @returns {string} Formatted uptime
   */
  formatUptime() {
    const ms = Date.now() - this.startTime;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
