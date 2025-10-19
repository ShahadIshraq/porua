import { ChunkId } from './ChunkId.js';
import { ChunkMetadata } from './ChunkMetadata.js';
import { HotCache } from './HotCache.js';
import { WarmCache } from './WarmCache.js';
import { AudioCacheManager } from '../../shared/cache/AudioCacheManager.js';

/**
 * Unified audio registry
 * Single source of truth for all audio chunks across the playback session
 */
export class AudioRegistry {
  constructor(config = {}) {
    // Generate unique session ID
    this.sessionId = this.generateSessionId();

    // Metadata index (always in memory)
    this.chunkIndex = new Map(); // chunkId.toString() → ChunkMetadata

    // Paragraph mapping
    this.paragraphMap = new Map(); // paragraphIndex → ChunkId[]
    this.paragraphTexts = new Map(); // paragraphIndex → text (for cache lookup)
    this.paragraphVoice = null; // Current voice ID
    this.paragraphSpeed = null; // Current speed

    // Storage tiers
    this.hotCache = new HotCache(config.hotCacheSize);
    this.warmCache = new WarmCache(config.warmCacheSize);
    this.coldCache = new AudioCacheManager(); // Reuse existing paragraph-level cache

    // Session tracking
    this.totalDurationMs = 0;
    this.totalChunks = 0;
  }

  /**
   * Generate unique session ID
   * @private
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Register a paragraph's audio chunks
   * @param {number} paragraphIndex
   * @param {string} paragraphText
   * @param {Object} audioData - {audioBlobs, metadataArray, phraseTimeline}
   * @param {string} voiceId
   * @param {number} speed
   */
  async registerParagraph(paragraphIndex, paragraphText, audioData, voiceId, speed) {
    const { audioBlobs, metadataArray, phraseTimeline } = audioData;

    // Store paragraph context for cache reconstruction
    this.paragraphTexts.set(paragraphIndex, paragraphText);
    this.paragraphVoice = voiceId;
    this.paragraphSpeed = speed;

    const chunkIds = [];

    for (let i = 0; i < audioBlobs.length; i++) {
      const chunkId = new ChunkId(this.sessionId, paragraphIndex, i);
      const chunkMetadataObj = metadataArray[i] || {};

      const metadata = new ChunkMetadata({
        chunkId,
        startOffsetMs: chunkMetadataObj.start_offset_ms || 0,
        durationMs: 0, // Will be set when audio loads
        paragraphIndex,
        paragraphText,
        storageLocation: 'hot',
        size: audioBlobs[i].size,
        phrases: chunkMetadataObj.phrases || []
      });

      // Store metadata
      this.chunkIndex.set(chunkId.toString(), metadata);
      chunkIds.push(chunkId);

      // Store blob in hot cache
      this.hotCache.set(chunkId, audioBlobs[i]);

      this.totalChunks++;
    }

    // Map paragraph to chunks
    this.paragraphMap.set(paragraphIndex, chunkIds);

    // Also store in cold cache (paragraph-level) for reconstruction
    await this.coldCache.set(paragraphText, voiceId, speed, audioData);

    // Update total duration estimate
    if (chunkIds.length > 0) {
      const lastChunk = this.getMetadata(chunkIds[chunkIds.length - 1]);
      this.totalDurationMs = Math.max(this.totalDurationMs, lastChunk.startOffsetMs + 10000); // Estimate +10s
    }
  }

  /**
   * Get chunk blob (handles tier promotion automatically)
   * @param {ChunkId} chunkId
   * @returns {Promise<Blob>}
   */
  async getChunk(chunkId) {
    const metadata = this.chunkIndex.get(chunkId.toString());
    if (!metadata) {
      throw new Error(`Chunk not found: ${chunkId.toString()}`);
    }

    // Update access tracking
    metadata.recordAccess();

    // Try hot cache (L1)
    let blob = this.hotCache.get(chunkId);
    if (blob) {
      metadata.setStorageLocation('hot');
      return blob;
    }

    // Try warm cache (L2)
    blob = await this.warmCache.get(chunkId);
    if (blob) {
      metadata.setStorageLocation('warm');
      // Promote to hot cache
      this.hotCache.set(chunkId, blob);
      return blob;
    }

    // Reconstruct from cold cache (L3)
    blob = await this.reconstructFromCold(chunkId, metadata);
    if (blob) {
      metadata.setStorageLocation('cold→hot');
      this.hotCache.set(chunkId, blob);
      return blob;
    }

    throw new Error(`Chunk blob unavailable: ${chunkId.toString()}`);
  }

  /**
   * Reconstruct chunk from paragraph-level cold cache
   * @private
   */
  async reconstructFromCold(chunkId, metadata) {
    const paragraphText = this.paragraphTexts.get(metadata.paragraphIndex);
    if (!paragraphText) return null;

    const audioData = await this.coldCache.get(
      paragraphText,
      this.paragraphVoice,
      this.paragraphSpeed
    );

    if (!audioData || !audioData.audioBlobs) return null;

    // Extract specific chunk
    const blob = audioData.audioBlobs[chunkId.chunkIndex];
    return blob || null;
  }

  /**
   * Get metadata for a chunk (without loading blob)
   * @param {ChunkId} chunkId
   * @returns {ChunkMetadata|null}
   */
  getMetadata(chunkId) {
    return this.chunkIndex.get(chunkId.toString()) || null;
  }

  /**
   * Get all chunks for a paragraph
   * @param {number} paragraphIndex
   * @returns {ChunkId[]}
   */
  getParagraphChunks(paragraphIndex) {
    return this.paragraphMap.get(paragraphIndex) || [];
  }

  /**
   * Find chunk containing absolute time
   * @param {number} absoluteTimeMs
   * @returns {{chunkId: ChunkId, localTimeMs: number}|null}
   */
  findChunkAtTime(absoluteTimeMs) {
    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(absoluteTimeMs, this.totalDurationMs));

    for (const [key, metadata] of this.chunkIndex) {
      if (metadata.durationMs === 0) continue; // Skip chunks without duration

      const endTime = metadata.getEndOffsetMs();

      if (clampedTime >= metadata.startOffsetMs && clampedTime < endTime) {
        return {
          chunkId: metadata.chunkId,
          localTimeMs: clampedTime - metadata.startOffsetMs
        };
      }
    }

    // If not found, return first or last chunk
    if (clampedTime === 0 && this.totalChunks > 0) {
      const firstChunk = [...this.chunkIndex.values()][0];
      return {
        chunkId: firstChunk.chunkId,
        localTimeMs: 0
      };
    }

    return null;
  }

  /**
   * Get next N chunks for prefetching
   * @param {ChunkId} currentChunkId
   * @param {number} count
   * @returns {ChunkId[]}
   */
  getNextChunks(currentChunkId, count) {
    const chunks = [];
    let paragraphIndex = currentChunkId.paragraphIndex;
    let chunkIndex = currentChunkId.chunkIndex + 1;

    while (chunks.length < count) {
      const paragraphChunks = this.getParagraphChunks(paragraphIndex);

      if (!paragraphChunks || paragraphChunks.length === 0) {
        break; // No more paragraphs
      }

      if (chunkIndex >= paragraphChunks.length) {
        // Move to next paragraph
        paragraphIndex++;
        chunkIndex = 0;
        continue;
      }

      chunks.push(paragraphChunks[chunkIndex]);
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Update chunk duration when audio metadata loads
   * @param {ChunkId} chunkId
   * @param {number} durationMs
   */
  updateChunkDuration(chunkId, durationMs) {
    const metadata = this.getMetadata(chunkId);
    if (metadata) {
      metadata.setDuration(durationMs);

      // Recalculate total duration
      this.recalculateTotalDuration();
    }
  }

  /**
   * Recalculate total session duration
   * @private
   */
  recalculateTotalDuration() {
    let maxEndTime = 0;

    for (const metadata of this.chunkIndex.values()) {
      if (metadata.durationMs > 0) {
        const endTime = metadata.getEndOffsetMs();
        maxEndTime = Math.max(maxEndTime, endTime);
      }
    }

    this.totalDurationMs = maxEndTime;
  }

  /**
   * Manage cache tiers (evict from hot→warm, warm→deleted)
   * @param {ChunkId} currentChunkId - Current playback position for window protection
   */
  async manageTiers(currentChunkId) {
    // Evict from hot cache if needed
    if (this.hotCache.shouldEvict()) {
      const victims = this.hotCache.selectEvictionCandidates(currentChunkId, 5);

      for (const chunkId of victims) {
        const blob = this.hotCache.get(chunkId);
        const metadata = this.getMetadata(chunkId);

        if (blob && metadata) {
          // Move to warm cache
          await this.warmCache.set(chunkId, blob, metadata);
          this.hotCache.delete(chunkId);
          metadata.setStorageLocation('warm');
        }
      }
    }

    // Evict from warm cache if needed
    if (this.warmCache.shouldEvict()) {
      const victims = await this.warmCache.selectEvictionCandidates(10);

      for (const chunkId of victims) {
        await this.warmCache.delete(chunkId);

        const metadata = this.getMetadata(chunkId);
        if (metadata) {
          metadata.setStorageLocation('cold');
        }
      }
    }
  }

  /**
   * Prefetch chunks into hot cache
   * @param {ChunkId[]} chunkIds
   */
  async prefetchChunks(chunkIds) {
    for (const chunkId of chunkIds) {
      try {
        // This will automatically promote to hot cache
        await this.getChunk(chunkId);
      } catch (error) {
        console.warn('[AudioRegistry] Prefetch failed for chunk:', chunkId.toString(), error);
      }
    }
  }

  /**
   * Clear all caches and reset
   */
  async clear() {
    this.chunkIndex.clear();
    this.paragraphMap.clear();
    this.paragraphTexts.clear();
    this.hotCache.clear();
    await this.warmCache.clear();

    this.totalDurationMs = 0;
    this.totalChunks = 0;
    this.sessionId = this.generateSessionId();
  }

  /**
   * Get registry statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const totalChunks = this.chunkIndex.size;
    const hotCount = [...this.chunkIndex.values()]
      .filter(m => m.storageLocation === 'hot').length;
    const warmCount = [...this.chunkIndex.values()]
      .filter(m => m.storageLocation === 'warm').length;
    const coldCount = totalChunks - hotCount - warmCount;

    return {
      sessionId: this.sessionId,
      totalChunks,
      totalParagraphs: this.paragraphMap.size,
      totalDurationMs: this.totalDurationMs,
      hotCount,
      warmCount,
      coldCount,
      hotCache: this.hotCache.getStats(),
      warmCache: await this.warmCache.getStats()
    };
  }
}
