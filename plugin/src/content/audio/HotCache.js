/**
 * L1 Hot Cache - In-memory LRU cache for audio blobs
 * Implements sliding window protection around current playback position
 */
export class HotCache {
  /**
   * @param {number} maxSizeBytes - Maximum cache size in bytes (default 10MB)
   */
  constructor(maxSizeBytes = 10 * 1024 * 1024) {
    this.maxSize = maxSizeBytes;
    this.currentSize = 0;
    this.cache = new Map(); // chunkId.toString() → {blob, lastAccess, chunkId}

    // Sliding window configuration
    this.windowBefore = 15;  // Keep 15 chunks before current
    this.windowAhead = 25;   // Keep 25 chunks ahead for prefetch
  }

  /**
   * Get blob from cache
   * @param {ChunkId} chunkId
   * @returns {Blob|null}
   */
  get(chunkId) {
    const key = chunkId.toString();
    const entry = this.cache.get(key);

    if (entry) {
      entry.lastAccess = Date.now();
      return entry.blob;
    }

    return null;
  }

  /**
   * Store blob in cache
   * @param {ChunkId} chunkId
   * @param {Blob} blob
   */
  set(chunkId, blob) {
    const key = chunkId.toString();

    // Remove old entry if exists
    if (this.cache.has(key)) {
      const old = this.cache.get(key);
      this.currentSize -= old.blob.size;
    }

    // Add new entry
    this.cache.set(key, {
      blob,
      lastAccess: Date.now(),
      chunkId: chunkId.clone()
    });

    this.currentSize += blob.size;
  }

  /**
   * Remove blob from cache
   * @param {ChunkId} chunkId
   */
  delete(chunkId) {
    const key = chunkId.toString();
    const entry = this.cache.get(key);

    if (entry) {
      this.currentSize -= entry.blob.size;
      this.cache.delete(key);
    }
  }

  /**
   * Check if cache has blob for chunk
   * @param {ChunkId} chunkId
   * @returns {boolean}
   */
  has(chunkId) {
    return this.cache.has(chunkId.toString());
  }

  /**
   * Check if cache should evict entries
   * @returns {boolean}
   */
  shouldEvict() {
    return this.currentSize > this.maxSize;
  }

  /**
   * Select chunks to evict using sliding window + LRU
   * Protects chunks within sliding window around current playback position
   * @param {ChunkId} currentChunkId - Current playback position
   * @param {number} count - Number of chunks to evict
   * @returns {ChunkId[]}
   */
  selectEvictionCandidates(currentChunkId, count = 5) {
    const candidates = [];

    if (!currentChunkId) {
      // No current position, just use LRU
      const entries = [...this.cache.values()]
        .sort((a, b) => a.lastAccess - b.lastAccess);

      for (let i = 0; i < Math.min(count, entries.length); i++) {
        candidates.push(entries[i].chunkId);
      }

      return candidates;
    }

    // Calculate protected window
    const protectedStart = Math.max(0, currentChunkId.chunkIndex - this.windowBefore);
    const protectedEnd = currentChunkId.chunkIndex + this.windowAhead;

    // Filter entries outside protected window, sort by LRU
    const entries = [...this.cache.values()]
      .filter(entry => {
        const chunkId = entry.chunkId;
        // Protect if same paragraph and within window
        if (chunkId.sessionId === currentChunkId.sessionId &&
            chunkId.paragraphIndex === currentChunkId.paragraphIndex) {
          return chunkId.chunkIndex < protectedStart || chunkId.chunkIndex > protectedEnd;
        }
        // Other paragraphs: protect if close to current paragraph
        const paragraphDistance = Math.abs(chunkId.paragraphIndex - currentChunkId.paragraphIndex);
        return paragraphDistance > 2; // Protect current paragraph ± 2
      })
      .sort((a, b) => a.lastAccess - b.lastAccess);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      candidates.push(entries[i].chunkId);
    }

    return candidates;
  }

  /**
   * Get current cache size in bytes
   * @returns {number}
   */
  getCurrentSize() {
    return this.currentSize;
  }

  /**
   * Get number of cached chunks
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * Clear all cached blobs
   */
  clear() {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    return {
      size: this.cache.size,
      currentSizeBytes: this.currentSize,
      maxSizeBytes: this.maxSize,
      utilizationPercent: (this.currentSize / this.maxSize * 100).toFixed(2)
    };
  }
}
