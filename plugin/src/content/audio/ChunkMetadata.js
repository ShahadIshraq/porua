import { ChunkId } from './ChunkId.js';

/**
 * Metadata for an audio chunk
 * Lightweight structure kept in memory for all chunks
 */
export class ChunkMetadata {
  /**
   * @param {Object} options
   * @param {ChunkId} options.chunkId - Unique chunk identifier
   * @param {number} options.startOffsetMs - Cumulative time offset from session start
   * @param {number} options.durationMs - Duration of this chunk in milliseconds
   * @param {number} options.paragraphIndex - Paragraph index this chunk belongs to
   * @param {string} options.paragraphText - First 50 chars of paragraph (for debugging)
   * @param {string} options.storageLocation - Where blob is stored: 'hot' | 'warm' | 'cold'
   * @param {number} options.size - Blob size in bytes
   * @param {Array} options.phrases - Phrase timing data for highlighting
   */
  constructor({
    chunkId,
    startOffsetMs,
    durationMs = 0,
    paragraphIndex,
    paragraphText = '',
    storageLocation = 'hot',
    size,
    phrases = []
  }) {
    this.chunkId = chunkId;
    this.startOffsetMs = startOffsetMs;
    this.durationMs = durationMs;
    this.paragraphIndex = paragraphIndex;
    this.paragraphText = paragraphText.substring(0, 50);
    this.storageLocation = storageLocation;
    this.size = size;
    this.phrases = phrases;

    // Access tracking
    this.lastAccess = Date.now();
    this.accessCount = 0;
  }

  /**
   * Get the end time of this chunk
   * @returns {number}
   */
  getEndOffsetMs() {
    return this.startOffsetMs + this.durationMs;
  }

  /**
   * Check if a given absolute time falls within this chunk
   * @param {number} absoluteTimeMs
   * @returns {boolean}
   */
  containsTime(absoluteTimeMs) {
    return absoluteTimeMs >= this.startOffsetMs &&
           absoluteTimeMs < this.getEndOffsetMs();
  }

  /**
   * Update access tracking
   */
  recordAccess() {
    this.lastAccess = Date.now();
    this.accessCount++;
  }

  /**
   * Update storage location
   * @param {'hot' | 'warm' | 'cold'} location
   */
  setStorageLocation(location) {
    this.storageLocation = location;
  }

  /**
   * Update duration (set when audio metadata loads)
   * @param {number} durationMs
   */
  setDuration(durationMs) {
    this.durationMs = durationMs;
  }
}
