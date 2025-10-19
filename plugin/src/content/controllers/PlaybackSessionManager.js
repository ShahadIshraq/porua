import { AudioRegistry } from '../audio/AudioRegistry.js';
import { AudioPlayer } from '../audio/AudioPlayer.js';
import { PLAYER_STATES } from '../../shared/utils/constants.js';
import { Logger } from '../../shared/utils/logger.js';

/**
 * Manages playback session with unified registry
 * Replaces ContinuousPlaybackController
 */
export class PlaybackSessionManager {
  constructor(state, highlightManager, ttsService, settingsStore) {
    this.state = state;
    this.highlightManager = highlightManager;
    this.ttsService = ttsService;
    this.settingsStore = settingsStore;

    // Core components
    this.audioRegistry = new AudioRegistry();
    this.audioPlayer = new AudioPlayer(this.audioRegistry, highlightManager, state);

    // Paragraph tracking
    this.paragraphs = [];
    this.currentParagraphIndex = -1;

    // Voice/speed settings
    this.voiceId = null;
    this.speed = null;

    // Callbacks
    this.queueCompleteCallbacks = [];

    // Wire up audio player
    this.audioPlayer.setOnQueueEmpty(() => this.handleAudioQueueEmpty());
  }

  /**
   * Start continuous playback from a paragraph
   * @param {HTMLElement} startParagraph
   * @param {HTMLElement[]} followingParagraphs
   */
  async playContinuous(startParagraph, followingParagraphs) {
    try {
      // Setup paragraphs
      this.paragraphs = [startParagraph, ...followingParagraphs];
      this.currentParagraphIndex = 0;

      // Get settings
      const settings = await this.settingsStore.get();
      this.voiceId = settings.selectedVoiceId;
      this.speed = settings.speed || 1.0;

      // Enable continuous mode
      this.state.setContinuousMode(true);

      // Load and play first paragraph
      await this.loadAndPlayParagraph(0);

      // Prefetch next paragraphs in background
      this.prefetchParagraphs([1, 2]).catch(err => {
        Logger.error('PlaybackSessionManager', 'Prefetch failed', err);
      });

    } catch (error) {
      Logger.error('PlaybackSessionManager', 'Failed to start continuous playback', error);
      this.stop();
      throw error;
    }
  }

  /**
   * Load and play a specific paragraph
   * @param {number} paragraphIndex
   * @private
   */
  async loadAndPlayParagraph(paragraphIndex) {
    const paragraph = this.paragraphs[paragraphIndex];
    if (!paragraph) {
      throw new Error(`Paragraph not found at index: ${paragraphIndex}`);
    }

    const text = paragraph.textContent.trim();

    // Fetch audio (cache-aware via TTSService)
    const { audioBlobs, metadataArray, phraseTimeline } =
      await this.ttsService.synthesizeStream(text, {
        voice: this.voiceId,
        speed: this.speed
      });

    if (audioBlobs.length === 0) {
      throw new Error('No audio data received from server');
    }

    // Store phrase timeline in state for highlighting
    this.state.setPhraseTimeline(phraseTimeline);

    // Wrap phrases for highlighting
    if (phraseTimeline.length > 0) {
      this.highlightManager.wrapPhrases(paragraph, phraseTimeline);
    }

    // Register in audio registry
    await this.audioRegistry.registerParagraph(
      paragraphIndex,
      text,
      { audioBlobs, metadataArray, phraseTimeline },
      this.voiceId,
      this.speed
    );

    // Update total chunks for progress tracking
    const totalChunks = this.audioRegistry.totalChunks;
    this.audioPlayer.setTotalChunks(totalChunks);

    // Get first chunk of this paragraph
    const chunkIds = this.audioRegistry.getParagraphChunks(paragraphIndex);
    if (chunkIds.length === 0) {
      throw new Error('No chunks for paragraph');
    }

    // Update state
    this.state.setPlayingParagraph(paragraph);
    this.currentParagraphIndex = paragraphIndex;

    // Start playback
    await this.audioPlayer.playChunk(chunkIds[0]);

    // Trigger prefetch for next chunks
    this.prefetchNextChunks();
  }

  /**
   * Prefetch specific paragraphs
   * @param {number[]} indices
   * @private
   */
  async prefetchParagraphs(indices) {
    for (const index of indices) {
      if (index >= this.paragraphs.length) continue;

      const paragraph = this.paragraphs[index];
      const text = paragraph.textContent.trim();

      try {
        // Fetch audio
        const audioData = await this.ttsService.synthesizeStream(text, {
          voice: this.voiceId,
          speed: this.speed
        });

        // Register in audio registry
        await this.audioRegistry.registerParagraph(
          index,
          text,
          audioData,
          this.voiceId,
          this.speed
        );

        Logger.log('PlaybackSessionManager', `Prefetched paragraph ${index}`);
      } catch (error) {
        Logger.warn('PlaybackSessionManager', `Prefetch failed for paragraph ${index}`, error);
      }
    }
  }

  /**
   * Prefetch next chunks based on current playback position
   * @private
   */
  prefetchNextChunks() {
    if (!this.audioPlayer.currentChunkId) return;

    // Get next 30 chunks
    const nextChunks = this.audioRegistry.getNextChunks(
      this.audioPlayer.currentChunkId,
      30
    );

    // Prefetch in background
    this.audioRegistry.prefetchChunks(nextChunks).catch(err => {
      Logger.warn('PlaybackSessionManager', 'Chunk prefetch failed', err);
    });

    // Check if we need to prefetch next paragraphs
    const currentPara = this.audioPlayer.currentChunkId.paragraphIndex;
    const nextParaIndex = currentPara + 1;

    if (nextParaIndex < this.paragraphs.length) {
      const nextParaChunks = this.audioRegistry.getParagraphChunks(nextParaIndex);

      // If next paragraph not registered, prefetch it
      if (nextParaChunks.length === 0) {
        this.prefetchParagraphs([nextParaIndex, nextParaIndex + 1]).catch(err => {
          Logger.warn('PlaybackSessionManager', 'Paragraph prefetch failed', err);
        });
      }
    }
  }

  /**
   * Handle audio queue empty (transition to next paragraph or finish)
   * @private
   */
  async handleAudioQueueEmpty() {
    if (!this.state.isContinuousMode()) return;

    const nextIndex = this.currentParagraphIndex + 1;

    if (nextIndex >= this.paragraphs.length) {
      this.handleQueueComplete();
      return;
    }

    // Transition to next paragraph
    await this.transitionToNext(nextIndex);
  }

  /**
   * Transition to next paragraph
   * @param {number} nextIndex
   * @private
   */
  async transitionToNext(nextIndex) {
    const currentParagraph = this.paragraphs[this.currentParagraphIndex];
    const nextParagraph = this.paragraphs[nextIndex];

    if (!nextParagraph) {
      this.handleQueueComplete();
      return;
    }

    try {
      // Check if paragraph already registered
      const nextChunks = this.audioRegistry.getParagraphChunks(nextIndex);

      if (nextChunks.length === 0) {
        // Not prefetched, load on-demand
        Logger.warn('PlaybackSessionManager', `Cache miss for paragraph ${nextIndex}, loading on-demand`);
        this.state.setState(PLAYER_STATES.LOADING);
        await this.loadAndPlayParagraph(nextIndex);
      } else {
        // Already prefetched, play first chunk
        this.currentParagraphIndex = nextIndex;
        this.state.setPlayingParagraph(nextParagraph);

        // Update highlights for new paragraph
        const phraseTimeline = this.state.getPhraseTimeline();
        this.highlightManager.transitionToParagraph(
          currentParagraph,
          nextParagraph,
          phraseTimeline
        );

        await this.audioPlayer.playChunk(nextChunks[0]);

        // Trigger prefetch for next chunks
        this.prefetchNextChunks();
      }
    } catch (error) {
      Logger.error('PlaybackSessionManager', `Failed to transition to paragraph ${nextIndex}`, error);

      // Try next paragraph
      if (nextIndex + 1 < this.paragraphs.length) {
        await this.transitionToNext(nextIndex + 1);
      } else {
        this.stop();
      }
    }
  }

  /**
   * Handle completion of all paragraphs
   * @private
   */
  handleQueueComplete() {
    this.state.setState(PLAYER_STATES.IDLE);
    this.state.setContinuousMode(false);

    // Clear highlights and restore last paragraph
    const lastParagraph = this.paragraphs[this.currentParagraphIndex];
    if (lastParagraph) {
      this.highlightManager.clearHighlights();
      this.highlightManager.restoreParagraph(lastParagraph);
    }

    this.state.setPlayingParagraph(null);
    this.currentParagraphIndex = -1;

    // Notify listeners
    this.queueCompleteCallbacks.forEach(cb => cb());
  }

  /**
   * Seek by relative seconds
   * @param {number} seconds
   * @returns {Promise<boolean>}
   */
  async seek(seconds) {
    return await this.audioPlayer.seek(seconds);
  }

  /**
   * Pause playback
   */
  pause() {
    this.audioPlayer.pause();
  }

  /**
   * Resume playback
   */
  async resume() {
    await this.audioPlayer.resume();

    // Trigger prefetch if needed
    this.prefetchNextChunks();
  }

  /**
   * Stop playback and cleanup
   */
  stop() {
    this.audioPlayer.clear();

    this.state.setState(PLAYER_STATES.IDLE);
    this.state.setContinuousMode(false);

    // Restore current paragraph
    const currentParagraph = this.paragraphs[this.currentParagraphIndex];
    if (currentParagraph) {
      this.highlightManager.clearHighlights();
      this.highlightManager.restoreParagraph(currentParagraph);
    }

    this.state.setPlayingParagraph(null);
    this.paragraphs = [];
    this.currentParagraphIndex = -1;
  }

  /**
   * Clear session and reset registry
   */
  async clear() {
    this.stop();
    await this.audioRegistry.clear();
  }

  /**
   * Register callback for queue completion
   * @param {Function} callback
   */
  onQueueComplete(callback) {
    this.queueCompleteCallbacks.push(callback);
  }

  /**
   * Set progress callback
   * @param {Function} callback
   */
  setOnProgress(callback) {
    this.audioPlayer.setOnProgress(callback);
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    return await this.audioRegistry.getStats();
  }
}
