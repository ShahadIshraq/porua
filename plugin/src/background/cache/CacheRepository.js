/**
 * Cache Repository
 * High-level CRUD operations for cache entries
 */

import { IndexedDBAdapter } from './IndexedDBAdapter.js';
import { CacheKeyGenerator } from './CacheKeyGenerator.js';
import { CACHE_CONFIG } from './constants.js';

export class CacheRepository {
  constructor() {
    this.adapter = new IndexedDBAdapter();
  }

  /**
   * Initialize repository
   * @returns {Promise<void>}
   */
  async init() {
    await this.adapter.init();
    await this._ensureMetadataExists();
  }

  /**
   * Get cache entry
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<Object|null>} Cache entry or null if not found
   */
  async get(text, voiceId, speed) {
    const key = await CacheKeyGenerator.generate(text, voiceId, speed);
    const entry = await this.adapter.get(CACHE_CONFIG.STORE_AUDIO_CACHE, key);
    return entry || null;
  }

  /**
   * Store cache entry
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @param {Object} data - Cache data
   * @returns {Promise<void>}
   */
  async set(text, voiceId, speed, data) {
    const key = await CacheKeyGenerator.generate(text, voiceId, speed);
    const textHash = await CacheKeyGenerator.hashText(CacheKeyGenerator.normalizeText(text));

    // Calculate total size
    const totalSizeBytes = data.audioBlobs.reduce((sum, blob) => sum + blob.size, 0);

    // Prepare audio chunks with size info
    const audioChunks = data.audioBlobs.map((blob) => ({
      blob: blob,
      size: blob.size,
    }));

    const entry = {
      key,
      audioChunks,
      metadataArray: data.metadataArray,
      phraseTimeline: data.phraseTimeline,
      totalSizeBytes,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      textHash,
      textPreview: text.substring(0, CACHE_CONFIG.TEXT_PREVIEW_LENGTH),
      voiceId,
      speed,
    };

    await this.adapter.put(CACHE_CONFIG.STORE_AUDIO_CACHE, entry);
  }

  /**
   * Check if entry exists
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<boolean>}
   */
  async has(text, voiceId, speed) {
    const entry = await this.get(text, voiceId, speed);
    return entry !== null;
  }

  /**
   * Remove cache entry
   * @param {string} text - Text content
   * @param {string} voiceId - Voice identifier
   * @param {number} speed - Playback speed
   * @returns {Promise<boolean>} True if removed
   */
  async remove(text, voiceId, speed) {
    const key = await CacheKeyGenerator.generate(text, voiceId, speed);
    const entry = await this.adapter.get(CACHE_CONFIG.STORE_AUDIO_CACHE, key);

    if (entry) {
      await this.adapter.delete(CACHE_CONFIG.STORE_AUDIO_CACHE, key);
      return true;
    }

    return false;
  }

  /**
   * Remove multiple entries by keys
   * @param {string[]} keys - Array of cache keys
   * @returns {Promise<void>}
   */
  async removeMultiple(keys) {
    await this.adapter.deleteMultiple(CACHE_CONFIG.STORE_AUDIO_CACHE, keys);
  }

  /**
   * Update access tracking for entry
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async updateAccessTime(key) {
    const entry = await this.adapter.get(CACHE_CONFIG.STORE_AUDIO_CACHE, key);

    if (entry) {
      entry.lastAccessedAt = Date.now();
      entry.accessCount += 1;
      await this.adapter.put(CACHE_CONFIG.STORE_AUDIO_CACHE, entry);
    }
  }

  /**
   * Get all entries sorted by lastAccessedAt (oldest first)
   * @returns {Promise<Array>}
   */
  async getEntriesSortedByLRU() {
    const entries = await this.adapter.getAll(CACHE_CONFIG.STORE_AUDIO_CACHE);
    return entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  }

  /**
   * Get all cache entries
   * @returns {Promise<Array>}
   */
  async getAllEntries() {
    return await this.adapter.getAll(CACHE_CONFIG.STORE_AUDIO_CACHE);
  }

  /**
   * Clear all cache entries
   * @returns {Promise<void>}
   */
  async clearAll() {
    await this.adapter.clear(CACHE_CONFIG.STORE_AUDIO_CACHE);
  }

  /**
   * Get cache metadata (global stats)
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    const metadata = await this.adapter.get(CACHE_CONFIG.STORE_METADATA, 'globalStats');
    return metadata || this._getDefaultMetadata();
  }

  /**
   * Update cache metadata
   * @param {Object} metadata - Metadata object
   * @returns {Promise<void>}
   */
  async updateMetadata(metadata) {
    await this.adapter.put(CACHE_CONFIG.STORE_METADATA, metadata);
  }

  /**
   * Ensure metadata exists in database
   * @private
   */
  async _ensureMetadataExists() {
    const existing = await this.adapter.get(CACHE_CONFIG.STORE_METADATA, 'globalStats');

    if (!existing) {
      await this.adapter.put(CACHE_CONFIG.STORE_METADATA, this._getDefaultMetadata());
    }
  }

  /**
   * Get default metadata structure
   * @private
   */
  _getDefaultMetadata() {
    return {
      key: 'globalStats',
      totalSizeBytes: 0,
      maxSizeBytes: CACHE_CONFIG.MAX_CACHE_SIZE_BYTES,
      entryCount: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      lastEvictionAt: 0,
      lastIntegrityCheckAt: 0,
      schemaVersion: 1,
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.adapter.close();
  }
}
