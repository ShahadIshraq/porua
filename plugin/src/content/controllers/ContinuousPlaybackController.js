import { PLAYER_STATES, CACHE_CONFIG } from '../../shared/utils/constants.js';
import { Logger } from '../../shared/utils/logger.js';

/**
 * Manages continuous playback of multiple paragraphs with prefetching
 */
export class ContinuousPlaybackController {
  constructor(state, audioQueue, highlightManager, prefetchManager, paragraphQueue, synthesizeAndPlayFn) {
    this.state = state;
    this.audioQueue = audioQueue;
    this.highlightManager = highlightManager;
    this.prefetchManager = prefetchManager;
    this.paragraphQueue = paragraphQueue;
    this.synthesizeAndPlayFn = synthesizeAndPlayFn;

    this.streamCompleteCallback = null;
    this.queueCompleteCallbacks = [];
  }

  /**
   * Start continuous playback from a paragraph
   * @param {HTMLElement} startParagraph - The paragraph to start from
   * @param {Array<HTMLElement>} followingParagraphs - Paragraphs to play after
   */
  async playContinuous(startParagraph, followingParagraphs) {
    // Setup queue
    this.paragraphQueue.clear();
    this.paragraphQueue.enqueue(startParagraph);
    this.paragraphQueue.enqueueMultiple(followingParagraphs);

    // Enable continuous mode
    this.state.setContinuousMode(true);

    // Start playing the first paragraph
    this.paragraphQueue.advance(); // Move to first paragraph (index 0)

    try {
      const text = startParagraph.textContent.trim();
      await this.synthesizeAndPlayFn(text, startParagraph);
    } catch (error) {
      Logger.error('ContinuousPlaybackController', 'Failed to start continuous playback', error);
      this.stop();
      throw error;
    }
  }

  /**
   * Called when stream parsing completes (before audio finishes playing)
   * This is the trigger point to start prefetching the next paragraph
   */
  handleStreamComplete() {
    if (!this.state.isContinuousMode()) return;

    this.triggerPrefetch();
  }

  /**
   * Called when the audio queue empties (one paragraph finishes playing)
   */
  async handleAudioQueueEmpty() {
    if (!this.state.isContinuousMode()) return;

    // Check if there are more paragraphs
    if (!this.paragraphQueue.hasNext()) {
      this.handleQueueComplete();
      return;
    }

    // Transition to next paragraph
    await this.transitionToNext();
  }

  /**
   * Trigger prefetch for the next paragraphs
   */
  async triggerPrefetch() {
    // Get next paragraphs for prefetching
    const upcomingParagraphs = this.paragraphQueue.getUpcomingParagraphs(CACHE_CONFIG.PREFETCH_LOOKAHEAD);

    if (upcomingParagraphs.length === 0) return;

    // Prefetch each paragraph that isn't already cached
    for (const paragraph of upcomingParagraphs) {
      const text = paragraph.textContent.trim();

      // Skip if already prefetched
      if (this.prefetchManager.hasPrefetched(text)) {
        continue;
      }

      // Start prefetch in background (don't await)
      this.prefetchManager.prefetch(text).catch(err => {
        Logger.error('ContinuousPlaybackController', 'Background prefetch failed', err);
      });
    }
  }

  /**
   * Transition from current paragraph to the next one
   */
  async transitionToNext() {
    const currentParagraph = this.paragraphQueue.getCurrentParagraph();
    const nextParagraph = this.paragraphQueue.advance();

    if (!nextParagraph) {
      this.handleQueueComplete();
      return;
    }

    const text = nextParagraph.textContent.trim();
    let data = await this.prefetchManager.getPrefetched(text);

    if (data) {
      // Use cached data - fast path
      await this.playFromCache(currentParagraph, nextParagraph, data);

      // Immediately trigger prefetch for the paragraph after next
      this.triggerPrefetch();
    } else {
      // Cache miss - fetch on-demand
      Logger.warn('ContinuousPlaybackController', 'Cache miss for paragraph, fetching on-demand');
      this.state.setState(PLAYER_STATES.LOADING);

      try {
        await this.synthesizeAndPlayFn(text, nextParagraph);

        // Update highlights for new paragraph
        this.highlightManager.transitionToParagraph(
          currentParagraph,
          nextParagraph,
          this.state.getPhraseTimeline()
        );

        // Trigger prefetch for next
        this.triggerPrefetch();
      } catch (error) {
        Logger.error('ContinuousPlaybackController', 'Failed to load paragraph', error);

        // Try to skip to next paragraph
        if (this.paragraphQueue.hasNext()) {
          await this.transitionToNext();
        } else {
          this.stop();
        }
      }
    }
  }

  /**
   * Play audio from cached/prefetched data
   */
  async playFromCache(oldParagraph, newParagraph, data) {
    // Transition highlights
    this.highlightManager.transitionToParagraph(
      oldParagraph,
      newParagraph,
      data.phraseTimeline
    );

    // Enqueue all prefetched audio blobs
    for (let i = 0; i < data.audioBlobs.length; i++) {
      this.audioQueue.enqueue(data.audioBlobs[i], data.metadataArray[i] || null);
    }

    // Start playing
    await this.audioQueue.play();
  }

  /**
   * Handle completion of all paragraphs
   */
  handleQueueComplete() {
    this.state.setState(PLAYER_STATES.IDLE);
    this.state.setContinuousMode(false);

    // Clear highlights and restore last paragraph
    const lastParagraph = this.paragraphQueue.getCurrentParagraph();
    if (lastParagraph) {
      this.highlightManager.clearHighlights();
      this.highlightManager.restoreParagraph(lastParagraph);
    }

    this.state.setPlayingParagraph(null);
    this.paragraphQueue.clear();
    this.prefetchManager.clearCache();

    // Notify listeners
    this.queueCompleteCallbacks.forEach(cb => cb());
  }

  /**
   * Pause continuous playback
   */
  pause() {
    this.audioQueue.pause();
    this.prefetchManager.cancelPending();
  }

  /**
   * Resume continuous playback
   */
  async resume() {
    await this.audioQueue.resume();

    // If audio queue is empty, transition to next
    if (this.audioQueue.queue.length === 0 && !this.audioQueue.currentAudio) {
      await this.handleAudioQueueEmpty();
    }
  }

  /**
   * Stop continuous playback
   */
  stop() {
    this.audioQueue.clear();
    this.prefetchManager.cancelPending();
    this.prefetchManager.clearCache();

    this.state.setState(PLAYER_STATES.IDLE);
    this.state.setContinuousMode(false);

    // Restore all paragraphs
    const currentParagraph = this.paragraphQueue.getCurrentParagraph();
    if (currentParagraph) {
      this.highlightManager.clearHighlights();
      this.highlightManager.restoreParagraph(currentParagraph);
    }

    this.state.setPlayingParagraph(null);
    this.paragraphQueue.clear();
  }

  /**
   * Register callback for when the entire queue completes
   */
  onQueueComplete(callback) {
    this.queueCompleteCallbacks.push(callback);
  }

  /**
   * Set the stream complete callback
   */
  onStreamComplete(callback) {
    this.streamCompleteCallback = callback;
  }
}
