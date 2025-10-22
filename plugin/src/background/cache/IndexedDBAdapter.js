/**
 * Low-level IndexedDB adapter
 * Handles database initialization and basic operations
 */

import { CACHE_CONFIG, CACHE_ERRORS } from './constants.js';
import { CacheError } from './CacheError.js';

export class IndexedDBAdapter {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Initialize database connection
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    // Return existing initialization if in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return existing connection if already initialized
    if (this.db) {
      return this.db;
    }

    this.initPromise = this._openDatabase();

    try {
      this.db = await this.initPromise;
      return this.db;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Open IndexedDB database
   * @private
   */
  _openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_CONFIG.DB_NAME, CACHE_CONFIG.DB_VERSION);

      request.onerror = () => {
        reject(
          new CacheError(
            'Failed to open IndexedDB',
            CACHE_ERRORS.DB_INIT_FAILED,
            request.error
          )
        );
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create audioCache object store
        if (!db.objectStoreNames.contains(CACHE_CONFIG.STORE_AUDIO_CACHE)) {
          const audioStore = db.createObjectStore(CACHE_CONFIG.STORE_AUDIO_CACHE, {
            keyPath: 'key',
          });

          // Create indexes
          audioStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
          audioStore.createIndex('createdAt', 'createdAt', { unique: false });
          audioStore.createIndex('voiceId', 'voiceId', { unique: false });
          audioStore.createIndex('totalSizeBytes', 'totalSizeBytes', { unique: false });
        }

        // Create cacheMetadata object store
        if (!db.objectStoreNames.contains(CACHE_CONFIG.STORE_METADATA)) {
          db.createObjectStore(CACHE_CONFIG.STORE_METADATA, {
            keyPath: 'key',
          });
        }
      };
    });
  }

  /**
   * Get database connection (lazy initialization)
   * @returns {Promise<IDBDatabase>}
   */
  async getDB() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }

  /**
   * Get a value from object store
   * @param {string} storeName - Object store name
   * @param {string} key - Key to retrieve
   * @returns {Promise<any>}
   */
  async get(storeName, key) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new CacheError('Failed to get from IndexedDB', CACHE_ERRORS.TRANSACTION_FAILED, request.error)
        );
    });
  }

  /**
   * Put a value into object store
   * @param {string} storeName - Object store name
   * @param {any} value - Value to store (must have keyPath property)
   * @returns {Promise<void>}
   */
  async put(storeName, value) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        // Check for quota exceeded error
        if (request.error && request.error.name === 'QuotaExceededError') {
          reject(
            new CacheError('Storage quota exceeded', CACHE_ERRORS.QUOTA_EXCEEDED, request.error)
          );
        } else {
          reject(
            new CacheError('Failed to put to IndexedDB', CACHE_ERRORS.TRANSACTION_FAILED, request.error)
          );
        }
      };
    });
  }

  /**
   * Delete a value from object store
   * @param {string} storeName - Object store name
   * @param {string} key - Key to delete
   * @returns {Promise<void>}
   */
  async delete(storeName, key) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new CacheError('Failed to delete from IndexedDB', CACHE_ERRORS.TRANSACTION_FAILED, request.error)
        );
    });
  }

  /**
   * Get all values from object store
   * @param {string} storeName - Object store name
   * @returns {Promise<Array>}
   */
  async getAll(storeName) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () =>
        reject(
          new CacheError('Failed to get all from IndexedDB', CACHE_ERRORS.TRANSACTION_FAILED, request.error)
        );
    });
  }

  /**
   * Query values using an index
   * @param {string} storeName - Object store name
   * @param {string} indexName - Index name
   * @param {IDBKeyRange|any} query - Query range or value
   * @returns {Promise<Array>}
   */
  async queryByIndex(storeName, indexName, query) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = query ? index.getAll(query) : index.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () =>
        reject(
          new CacheError('Failed to query by index', CACHE_ERRORS.TRANSACTION_FAILED, request.error)
        );
    });
  }

  /**
   * Clear all values from object store
   * @param {string} storeName - Object store name
   * @returns {Promise<void>}
   */
  async clear(storeName) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new CacheError('Failed to clear IndexedDB store', CACHE_ERRORS.TRANSACTION_FAILED, request.error)
        );
    });
  }

  /**
   * Delete multiple keys in a single transaction
   * @param {string} storeName - Object store name
   * @param {string[]} keys - Array of keys to delete
   * @returns {Promise<void>}
   */
  async deleteMultiple(storeName, keys) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      let completed = 0;
      let hasError = false;

      keys.forEach((key) => {
        const request = store.delete(key);
        request.onsuccess = () => {
          completed++;
          if (completed === keys.length && !hasError) {
            resolve();
          }
        };
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(
              new CacheError('Failed to delete multiple from IndexedDB', CACHE_ERRORS.TRANSACTION_FAILED, request.error)
            );
          }
        };
      });

      // Handle empty array
      if (keys.length === 0) {
        resolve();
      }
    });
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
