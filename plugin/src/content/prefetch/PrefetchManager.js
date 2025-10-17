import { ttsService } from '../../shared/services/TTSService.js';

/**
 * Manages prefetching and caching of audio data for upcoming paragraphs
 */
export class PrefetchManager {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
    this.cache = new Map();
    this.pendingFetches = new Map();
    this.maxCacheSize = 3;
  }

  /**
   * Prefetch audio for a paragraph in the background
   * @param {string} text - The text to synthesize
   * @returns {Promise<void>}
   */
  async prefetch(text) {
    const normalizedText = text.trim();
    if (this.cache.has(normalizedText)) {
      return;
    }

    // Cancel any existing fetch for this text
    if (this.pendingFetches.has(normalizedText)) {
      return;
    }

    const abortController = new AbortController();
    this.pendingFetches.set(normalizedText, abortController);

    try {
      // Use TTSService for synthesis with abort signal
      const response = await ttsService.synthesizeStream(normalizedText, {
        signal: abortController.signal
      });

      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.includes('multipart')) {
        throw new Error('Expected multipart response, got: ' + contentType);
      }

      const boundaryMatch = contentType.match(/boundary=([^;]+)/);
      if (!boundaryMatch) {
        throw new Error('No boundary found in multipart response');
      }

      // Import StreamParser dynamically to parse the stream
      const { StreamParser } = await import('../audio/StreamParser.js');
      const reader = response.body.getReader();
      const parts = await StreamParser.parseMultipartStream(reader, boundaryMatch[1]);

      const metadataArray = parts
        .filter(p => p.type === 'metadata')
        .map(p => p.metadata);

      const audioBlobs = parts
        .filter(p => p.type === 'audio')
        .map(p => new Blob([p.audioData], { type: 'audio/wav' }));

      if (audioBlobs.length === 0) {
        throw new Error('No audio data received from server');
      }

      // Build timeline from metadata
      const phraseTimeline = StreamParser.buildPhraseTimeline(metadataArray);

      // Combine all audio blobs into one
      // For simplicity, we'll keep them as separate blobs or combine them
      // Since AudioQueue can handle multiple blobs, we'll store all parts
      const combinedMetadata = {
        chunks: metadataArray
      };

      // Cache data
      this.cache.set(normalizedText, {
        audioBlobs,  // Array of blobs
        metadataArray,  // Array of metadata objects
        phraseTimeline,
        timestamp: Date.now()
      });

      // Evict if over limit
      if (this.cache.size > this.maxCacheSize) {
        this.evictOldest();
      }
    } catch (error) {
      // Ignore AbortError
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Prefetch failed:', error);
      throw error;
    } finally {
      this.pendingFetches.delete(normalizedText);
    }
  }

  /**
   * Get prefetched data if available
   * @param {string} text - The text to retrieve
   * @returns {Promise<Object|null>}
   */
  async getPrefetched(text) {
    const normalizedText = text.trim();
    return this.cache.get(normalizedText) || null;
  }

  /**
   * Check if text has been prefetched
   * @param {string} text - The text to check
   * @returns {boolean}
   */
  hasPrefetched(text) {
    const normalizedText = text.trim();
    return this.cache.has(normalizedText);
  }

  /**
   * Cancel all pending prefetch requests
   */
  cancelPending() {
    for (const [text, controller] of this.pendingFetches.entries()) {
      controller.abort();
    }
    this.pendingFetches.clear();
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    // Revoke blob URLs to free memory
    for (const [text, data] of this.cache.entries()) {
      if (data.audioBlob) {
        // The blob itself doesn't need revoking, only object URLs created from it
        // Object URLs are created when the blob is used, not stored
      }
    }
    this.cache.clear();
  }

  /**
   * Evict the oldest entry from the cache (LRU)
   */
  evictOldest() {
    const entries = [...this.cache.entries()];
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    if (entries.length > 0) {
      this.cache.delete(entries[0][0]);
    }
  }


  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      pendingFetches: this.pendingFetches.size
    };
  }
}
