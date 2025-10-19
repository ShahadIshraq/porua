/**
 * Global chunk identifier
 * Uniquely identifies an audio chunk across the entire playback session
 */
export class ChunkId {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {number} paragraphIndex - 0-based paragraph index
   * @param {number} chunkIndex - 0-based chunk index within paragraph
   */
  constructor(sessionId, paragraphIndex, chunkIndex) {
    this.sessionId = sessionId;
    this.paragraphIndex = paragraphIndex;
    this.chunkIndex = chunkIndex;
  }

  /**
   * Convert to string representation for use as Map key
   * @returns {string}
   */
  toString() {
    return `${this.sessionId}:${this.paragraphIndex}:${this.chunkIndex}`;
  }

  /**
   * Create ChunkId from string representation
   * @param {string} str - String in format "sessionId:paragraphIndex:chunkIndex"
   * @returns {ChunkId}
   */
  static fromString(str) {
    const parts = str.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid ChunkId string: ${str}`);
    }
    return new ChunkId(parts[0], parseInt(parts[1], 10), parseInt(parts[2], 10));
  }

  /**
   * Check equality with another ChunkId
   * @param {ChunkId} other
   * @returns {boolean}
   */
  equals(other) {
    if (!other) return false;
    return this.sessionId === other.sessionId &&
           this.paragraphIndex === other.paragraphIndex &&
           this.chunkIndex === other.chunkIndex;
  }

  /**
   * Create a copy of this ChunkId
   * @returns {ChunkId}
   */
  clone() {
    return new ChunkId(this.sessionId, this.paragraphIndex, this.chunkIndex);
  }
}
