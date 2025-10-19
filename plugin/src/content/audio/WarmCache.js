import { openDB } from 'idb';
import { ChunkId } from './ChunkId.js';

/**
 * L2 Warm Cache - IndexedDB storage for individual audio chunks
 * Implements LRU eviction with chunk-level granularity
 */
export class WarmCache {
  /**
   * @param {number} maxSizeBytes - Maximum cache size in bytes (default 100MB)
   */
  constructor(maxSizeBytes = 100 * 1024 * 1024) {
    this.maxSize = maxSizeBytes;
    this.dbName = 'tts-chunk-cache';
    this.storeName = 'chunks';
    this.db = null;
    this.currentSize = 0;
  }

  /**
   * Initialize IndexedDB connection
   * @private
   */
  async init() {
    if (this.db) return;

    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        const store = db.createObjectStore('chunks', { keyPath: 'chunkId' });
        store.createIndex('lastAccess', 'lastAccess');
        store.createIndex('size', 'size');
        store.createIndex('paragraphIndex', 'paragraphIndex');
      }
    });

    // Calculate current cache size
    await this.calculateSize();
  }

  /**
   * Get chunk blob from cache
   * @param {ChunkId} chunkId
   * @returns {Promise<Blob|null>}
   */
  async get(chunkId) {
    await this.init();

    try {
      const key = chunkId.toString();
      const entry = await this.db.get(this.storeName, key);

      if (!entry) return null;

      // Update access time
      entry.lastAccess = Date.now();
      await this.db.put(this.storeName, entry);

      return entry.blob;
    } catch (error) {
      console.error('[WarmCache] Get error:', error);
      return null;
    }
  }

  /**
   * Store chunk blob in cache
   * @param {ChunkId} chunkId
   * @param {Blob} blob
   * @param {Object} metadata - Chunk metadata
   */
  async set(chunkId, blob, metadata) {
    await this.init();

    try {
      const key = chunkId.toString();

      // Check if updating existing entry
      const existing = await this.db.get(this.storeName, key);
      if (existing) {
        this.currentSize -= existing.size;
      }

      const entry = {
        chunkId: key,
        blob,
        lastAccess: Date.now(),
        size: blob.size,
        paragraphIndex: chunkId.paragraphIndex,
        metadata: {
          startOffsetMs: metadata.startOffsetMs,
          durationMs: metadata.durationMs
        }
      };

      await this.db.put(this.storeName, entry);
      this.currentSize += blob.size;
    } catch (error) {
      console.error('[WarmCache] Set error:', error);
      throw error;
    }
  }

  /**
   * Delete chunk from cache
   * @param {ChunkId} chunkId
   */
  async delete(chunkId) {
    await this.init();

    try {
      const key = chunkId.toString();
      const entry = await this.db.get(this.storeName, key);

      if (entry) {
        this.currentSize -= entry.size;
        await this.db.delete(this.storeName, key);
      }
    } catch (error) {
      console.error('[WarmCache] Delete error:', error);
    }
  }

  /**
   * Check if chunk exists in cache
   * @param {ChunkId} chunkId
   * @returns {Promise<boolean>}
   */
  async has(chunkId) {
    await this.init();

    try {
      const key = chunkId.toString();
      const entry = await this.db.get(this.storeName, key);
      return !!entry;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if cache should evict entries
   * @returns {boolean}
   */
  shouldEvict() {
    return this.currentSize > this.maxSize;
  }

  /**
   * Select chunks to evict using LRU
   * @param {number} count - Number of chunks to evict
   * @returns {Promise<ChunkId[]>}
   */
  async selectEvictionCandidates(count = 10) {
    await this.init();

    try {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const index = tx.objectStore(this.storeName).index('lastAccess');

      // Get all entries sorted by lastAccess (oldest first)
      const entries = await index.getAll();

      const candidates = entries
        .slice(0, count)
        .map(e => ChunkId.fromString(e.chunkId));

      return candidates;
    } catch (error) {
      console.error('[WarmCache] Select eviction candidates error:', error);
      return [];
    }
  }

  /**
   * Evict old entries to make room
   * @param {number} targetSizeBytes - Size to free up
   */
  async evictToSize(targetSizeBytes) {
    await this.init();

    let freedSize = 0;
    const candidates = await this.selectEvictionCandidates(20);

    for (const chunkId of candidates) {
      if (freedSize >= targetSizeBytes) break;

      const entry = await this.db.get(this.storeName, chunkId.toString());
      if (entry) {
        freedSize += entry.size;
        await this.delete(chunkId);
      }
    }

    return freedSize;
  }

  /**
   * Calculate total cache size
   * @private
   */
  async calculateSize() {
    await this.init();

    try {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const all = await store.getAll();

      this.currentSize = all.reduce((sum, entry) => sum + (entry.size || 0), 0);
    } catch (error) {
      console.error('[WarmCache] Calculate size error:', error);
      this.currentSize = 0;
    }
  }

  /**
   * Get current cache size
   * @returns {number}
   */
  getCurrentSize() {
    return this.currentSize;
  }

  /**
   * Clear all cached chunks
   */
  async clear() {
    await this.init();

    try {
      await this.db.clear(this.storeName);
      this.currentSize = 0;
    } catch (error) {
      console.error('[WarmCache] Clear error:', error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    await this.init();

    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const count = await store.count();

    return {
      count,
      currentSizeBytes: this.currentSize,
      maxSizeBytes: this.maxSize,
      utilizationPercent: (this.currentSize / this.maxSize * 100).toFixed(2)
    };
  }
}
