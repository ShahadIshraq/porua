import { openDB } from 'idb';
import { CACHE_CONFIG } from '../utils/constants.js';

/**
 * Persistent cache using IndexedDB for audio storage
 * Implements 100MB size limit and 7-day time-based eviction
 */
export class PersistentCache {
  constructor(dbName = CACHE_CONFIG.WARM_CACHE_DB_NAME, version = CACHE_CONFIG.WARM_CACHE_VERSION) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.storeName = 'audioCache';
    this.totalSize = 0;  // Track total cache size in bytes
    this.cleanupInterval = null;
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    if (this.db) return;

    this.db = await openDB(this.dbName, this.version, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Create object store with indexes
        if (!db.objectStoreNames.contains('audioCache')) {
          const store = db.createObjectStore('audioCache', { keyPath: 'key' });
          store.createIndex('timestamp', 'metadata.timestamp');
          store.createIndex('lastAccess', 'metadata.lastAccess');
          store.createIndex('voiceId', 'metadata.voiceId');
          store.createIndex('size', 'metadata.size');
        }
      }
    });

    // Calculate initial total size
    await this.calculateTotalSize();

    // Start periodic cleanup for time-based eviction
    this.startPeriodicCleanup();
  }

  /**
   * Get cached entry by key
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} Cached data or null
   */
  async get(key) {
    await this.init();

    try {
      const entry = await this.db.get(this.storeName, key);
      if (!entry) return null;

      // Update last access time
      entry.metadata.lastAccess = Date.now();
      await this.db.put(this.storeName, entry);

      return {
        audioBlobs: entry.audioBlobs,
        metadataArray: entry.metadataArray,
        phraseTimeline: entry.phraseTimeline
      };
    } catch (error) {
      console.error('[PersistentCache] Get error:', error);
      return null;
    }
  }

  /**
   * Store entry in cache
   * Enforces 100MB size limit with LRU eviction
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   */
  async set(key, data) {
    await this.init();

    const entrySize = data.metadata.size;

    // Enforce 100MB size limit (evict LRU entries if needed)
    await this.enforceSizeLimit(entrySize);

    const entry = {
      key,
      audioBlobs: data.audioBlobs,
      metadataArray: data.metadataArray,
      phraseTimeline: data.phraseTimeline,
      metadata: {
        ...data.metadata,
        timestamp: Date.now(),
        lastAccess: Date.now()
      }
    };

    try {
      // Check if updating existing entry
      const existing = await this.db.get(this.storeName, key);
      if (existing) {
        this.totalSize -= existing.metadata.size || 0;
      }

      await this.db.put(this.storeName, entry);
      this.totalSize += entrySize;

    } catch (error) {
      console.error('[PersistentCache] Set error:', error);
      throw error;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if exists
   */
  async has(key) {
    await this.init();
    const entry = await this.db.get(this.storeName, key);
    return !!entry;
  }

  /**
   * Delete entry by key
   * @param {string} key - Cache key
   */
  async delete(key) {
    await this.init();

    const entry = await this.db.get(this.storeName, key);
    if (entry) {
      this.totalSize -= entry.metadata.size || 0;
    }

    await this.db.delete(this.storeName, key);
  }

  /**
   * Delete entries matching predicate
   * @param {Function} predicate - Function to test entries
   */
  async deleteMatching(predicate) {
    await this.init();

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const entries = await store.getAll();

    for (const entry of entries) {
      if (predicate(entry)) {
        await store.delete(entry.key);
        this.totalSize -= entry.metadata.size || 0;
      }
    }

    await tx.done;
  }

  /**
   * Evict least recently used entry (based on lastAccess time)
   * @returns {Promise<Object|null>} Evicted entry or null
   */
  async evictLRU() {
    await this.init();

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const index = store.index('lastAccess');

    // Get least recently accessed entry
    const cursor = await index.openCursor();
    if (!cursor) return null;

    const evicted = cursor.value;
    this.totalSize -= evicted.metadata.size || 0;
    await cursor.delete();
    await tx.done;

    return evicted;
  }

  /**
   * Clear all entries
   */
  async clear() {
    await this.init();
    await this.db.clear(this.storeName);
    this.totalSize = 0;
  }

  /**
   * Get cache size
   * @returns {Promise<number>} Number of entries
   */
  async size() {
    await this.init();
    const count = await this.db.count(this.storeName);
    return count;
  }

  /**
   * Get quota information
   * @returns {Promise<Object>} Quota info
   */
  async getQuotaInfo() {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { usage: 0, quota: Infinity, percent: 0 };
    }

    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      percent: (estimate.usage / estimate.quota) * 100
    };
  }

  /**
   * Get all entries for debugging
   * @returns {Promise<Array>} All entries
   */
  async getAllEntries() {
    await this.init();
    return await this.db.getAll(this.storeName);
  }

  /**
   * Calculate total size of all cached entries
   * @returns {Promise<number>} Total size in bytes
   */
  async calculateTotalSize() {
    await this.init();
    const entries = await this.db.getAll(this.storeName);

    this.totalSize = entries.reduce((sum, entry) => {
      const entrySize = entry.metadata?.size || 0;
      return sum + entrySize;
    }, 0);

    return this.totalSize;
  }

  /**
   * Start periodic cleanup to remove stale entries
   */
  startPeriodicCleanup() {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(async () => {
      await this.removeStaleEntries();
    }, CACHE_CONFIG.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Remove entries older than MAX_ENTRY_AGE_MS (7 days)
   */
  async removeStaleEntries() {
    await this.init();

    const now = Date.now();
    const maxAge = CACHE_CONFIG.MAX_ENTRY_AGE_MS;
    const cutoffTime = now - maxAge;

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const entries = await store.getAll();

    let removedCount = 0;
    let reclaimedSize = 0;

    for (const entry of entries) {
      if (entry.metadata.timestamp < cutoffTime) {
        await store.delete(entry.key);
        removedCount++;
        reclaimedSize += entry.metadata.size || 0;
        this.totalSize -= entry.metadata.size || 0;
      }
    }

    await tx.done;

    if (removedCount > 0) {
    }
  }

  /**
   * Check if we need to evict entries due to size limit
   * @param {number} newEntrySize - Size of new entry to add
   */
  async enforceSizeLimit(newEntrySize) {
    const maxSize = CACHE_CONFIG.MAX_CACHE_SIZE_BYTES;

    while (this.totalSize + newEntrySize > maxSize) {
      const evicted = await this.evictLRU();
      if (!evicted) {
        throw new Error('Cannot evict more entries, cache full');
      }
    }
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
}
