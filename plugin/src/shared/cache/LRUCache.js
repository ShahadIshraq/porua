/**
 * Node in doubly linked list for LRU cache
 */
class LRUNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

/**
 * LRU (Least Recently Used) Cache implementation
 * All operations are O(1) time complexity
 */
export class LRUCache {
  constructor(maxSize = 5) {
    this.maxSize = maxSize;
    this.cache = new Map();

    // Doubly linked list for O(1) reordering
    this.head = new LRUNode(null, null);  // Dummy head
    this.tail = new LRUNode(null, null);  // Dummy tail
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get value from cache
   * Moves accessed item to front (most recently used)
   * @param {string} key - Cache key
   * @returns {*} Cached value or null if not found
   */
  get(key) {
    if (!this.cache.has(key)) return null;

    const node = this.cache.get(key);
    this.moveToFront(node);  // Mark as recently used
    return node.value;
  }

  /**
   * Set value in cache
   * Adds to front (most recently used)
   * Evicts LRU item if over capacity
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    if (this.cache.has(key)) {
      // Update existing
      const node = this.cache.get(key);
      node.value = value;
      this.moveToFront(node);
    } else {
      // Add new
      const node = new LRUNode(key, value);
      this.cache.set(key, node);
      this.addToFront(node);

      // Evict if over capacity
      if (this.cache.size > this.maxSize) {
        this.evictLRU();
      }
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    if (!this.cache.has(key)) return false;

    const node = this.cache.get(key);
    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Clear all entries from cache
   */
  clear() {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get current cache size
   * @returns {number} Number of entries
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Move node to front of list (most recently used)
   * @private
   */
  moveToFront(node) {
    this.removeNode(node);
    this.addToFront(node);
  }

  /**
   * Add node to front of list
   * @private
   */
  addToFront(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /**
   * Remove node from list
   * @private
   */
  removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  /**
   * Evict least recently used entry
   * @returns {*} Evicted value or null if empty
   */
  evictLRU() {
    const lru = this.tail.prev;
    if (lru === this.head) return null;  // Empty

    this.removeNode(lru);
    this.cache.delete(lru.key);
    return lru.value;
  }
}
