import { AudioPlaybackError } from '../../shared/utils/errors.js';
import { PLAYER_STATES, AUDIO_PROGRESS } from '../../shared/utils/constants.js';

/**
 * Audio player with chunk-level playback and cross-chunk seeking
 * Replaces AudioQueue with registry-based architecture
 */
export class AudioPlayer {
  constructor(audioRegistry, highlightManager, state) {
    this.registry = audioRegistry;
    this.highlightManager = highlightManager;
    this.state = state;

    this.currentChunkId = null;
    this.currentAudio = null;
    this.currentAudioUrl = null;
    this.isPlaying = false;

    // Callbacks
    this.onQueueEmptyCallback = null;
    this.onProgressCallback = null;

    // Track total chunks for progress calculation
    this.totalChunksInSession = 0;
    this.completedChunks = 0;
  }

  /**
   * Play a specific chunk
   * @param {ChunkId} chunkId
   * @param {number} startTimeMs - Start position within chunk in milliseconds
   */
  async playChunk(chunkId, startTimeMs = 0) {
    try {
      // Get chunk blob from registry
      const blob = await this.registry.getChunk(chunkId);
      const metadata = this.registry.getMetadata(chunkId);

      if (!metadata) {
        throw new Error(`Metadata not found for chunk: ${chunkId.toString()}`);
      }

      // Stop and cleanup current audio
      if (this.currentAudio) {
        this.currentAudio.pause();
        if (this.currentAudioUrl) {
          URL.revokeObjectURL(this.currentAudioUrl);
        }
      }

      // Create new audio element
      this.currentAudioUrl = URL.createObjectURL(blob);
      this.currentAudio = new Audio(this.currentAudioUrl);
      this.currentChunkId = chunkId;

      // Set start position
      this.currentAudio.currentTime = startTimeMs / 1000;

      // Setup event handlers
      this.setupAudioEvents();

      // Store duration in metadata when loaded
      this.currentAudio.onloadedmetadata = () => {
        const durationMs = this.currentAudio.duration * 1000;
        this.registry.updateChunkDuration(chunkId, durationMs);
      };

      // Start playback
      await this.currentAudio.play();
      this.isPlaying = true;
      this.state.setState(PLAYER_STATES.PLAYING);

      // Trigger tier management in background
      this.registry.manageTiers(chunkId).catch(err => {
        console.warn('[AudioPlayer] Tier management error:', err);
      });

    } catch (error) {
      console.error('[AudioPlayer] Playback error:', error);
      throw new AudioPlaybackError(error.message);
    }
  }

  /**
   * Setup audio event handlers
   * @private
   */
  setupAudioEvents() {
    this.currentAudio.onended = () => {
      if (this.currentAudioUrl) {
        URL.revokeObjectURL(this.currentAudioUrl);
        this.currentAudioUrl = null;
      }
      this.completedChunks++;
      this.playNextChunk();
    };

    this.currentAudio.onerror = (error) => {
      console.error('[AudioPlayer] Audio error:', error);
      if (this.currentAudioUrl) {
        URL.revokeObjectURL(this.currentAudioUrl);
        this.currentAudioUrl = null;
      }
      this.completedChunks++;
      this.playNextChunk();
    };

    this.currentAudio.ontimeupdate = () => {
      this.updateProgress();
    };

    this.currentAudio.onplay = () => {
      this.updateProgress();
    };
  }

  /**
   * Play next chunk in sequence
   * @private
   */
  async playNextChunk() {
    if (!this.currentChunkId) {
      this.finish();
      return;
    }

    const nextChunks = this.registry.getNextChunks(this.currentChunkId, 1);

    if (nextChunks.length > 0) {
      try {
        await this.playChunk(nextChunks[0]);
      } catch (error) {
        console.error('[AudioPlayer] Failed to play next chunk:', error);
        this.finish();
      }
    } else {
      this.finish();
    }
  }

  /**
   * Update progress tracking and highlighting
   * @private
   */
  updateProgress() {
    if (!this.currentAudio || !this.currentChunkId) return;

    const metadata = this.registry.getMetadata(this.currentChunkId);
    if (!metadata) return;

    // Calculate absolute time
    const absoluteTimeMs = metadata.startOffsetMs + (this.currentAudio.currentTime * 1000);

    // Update highlights
    this.highlightManager.updateHighlight(absoluteTimeMs);

    // Emit cumulative progress for progress ring
    if (this.onProgressCallback && this.totalChunksInSession > 0) {
      const currentChunkProgress = this.currentAudio.duration > 0
        ? this.currentAudio.currentTime / this.currentAudio.duration
        : 0;

      const totalProgress = (this.completedChunks + currentChunkProgress) / this.totalChunksInSession;

      // Virtual time for progress bar
      const virtualCurrentTime = totalProgress * AUDIO_PROGRESS.VIRTUAL_DURATION;
      const virtualDuration = AUDIO_PROGRESS.VIRTUAL_DURATION;

      this.onProgressCallback(virtualCurrentTime, virtualDuration);
    }
  }

  /**
   * Seek to absolute time (global session time)
   * @param {number} absoluteTimeMs
   * @returns {Promise<boolean>}
   */
  async seekToTime(absoluteTimeMs) {
    try {
      const target = this.registry.findChunkAtTime(absoluteTimeMs);

      if (!target) {
        console.warn('[AudioPlayer] Seek target out of range:', absoluteTimeMs);
        return false;
      }

      // Check if different chunk
      if (!this.currentChunkId || !target.chunkId.equals(this.currentChunkId)) {
        // Switch to different chunk
        await this.playChunk(target.chunkId, target.localTimeMs);
      } else {
        // Seek within current chunk
        this.currentAudio.currentTime = target.localTimeMs / 1000;

        // Update highlights immediately
        const metadata = this.registry.getMetadata(this.currentChunkId);
        const newAbsoluteMs = metadata.startOffsetMs + target.localTimeMs;
        this.highlightManager.updateHighlight(newAbsoluteMs);
      }

      return true;
    } catch (error) {
      console.error('[AudioPlayer] Seek error:', error);
      return false;
    }
  }

  /**
   * Seek by relative seconds (skip forward/backward)
   * @param {number} seconds - Positive for forward, negative for backward
   * @returns {Promise<boolean>}
   */
  async seek(seconds) {
    if (!this.currentAudio || !this.currentChunkId) {
      return false;
    }

    const metadata = this.registry.getMetadata(this.currentChunkId);
    if (!metadata) return false;

    // Calculate current absolute time
    const currentAbsoluteMs = metadata.startOffsetMs + (this.currentAudio.currentTime * 1000);

    // Calculate target time
    const targetAbsoluteMs = currentAbsoluteMs + (seconds * 1000);

    // Clamp to valid range
    const clampedMs = Math.max(0, Math.min(targetAbsoluteMs, this.registry.totalDurationMs));

    return await this.seekToTime(clampedMs);
  }

  /**
   * Pause playback
   */
  pause() {
    if (this.currentAudio && this.isPlaying) {
      this.currentAudio.pause();
      this.isPlaying = false;
      this.state.setState(PLAYER_STATES.PAUSED);
    }
  }

  /**
   * Resume playback
   */
  async resume() {
    if (this.currentAudio && !this.isPlaying) {
      try {
        await this.currentAudio.play();
        this.isPlaying = true;
        this.state.setState(PLAYER_STATES.PLAYING);

        // Update highlight for current position
        const metadata = this.registry.getMetadata(this.currentChunkId);
        if (metadata) {
          const absoluteMs = metadata.startOffsetMs + (this.currentAudio.currentTime * 1000);
          this.highlightManager.updateHighlight(absoluteMs);
        }
      } catch (error) {
        console.error('[AudioPlayer] Resume failed, replaying chunk:', error);
        // If resume fails, try replaying current chunk from current position
        const currentTime = this.currentAudio.currentTime * 1000;
        await this.playChunk(this.currentChunkId, currentTime);
      }
    }
  }

  /**
   * Finish playback
   * @private
   */
  finish() {
    this.isPlaying = false;

    // Cleanup audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    // In continuous mode, delegate to controller
    if (this.state.isContinuousMode()) {
      if (this.onQueueEmptyCallback) {
        this.onQueueEmptyCallback();
      }
      return;
    }

    // Single paragraph mode: cleanup
    this.state.setState(PLAYER_STATES.IDLE);

    // Clear highlights
    this.highlightManager.clearHighlights();

    // Restore paragraph
    const paragraph = this.state.getPlayingParagraph();
    if (paragraph) {
      this.highlightManager.restoreParagraph(paragraph);
    }

    this.state.setPlayingParagraph(null);
    this.currentChunkId = null;
  }

  /**
   * Clear and reset player
   */
  clear() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    this.currentChunkId = null;
    this.isPlaying = false;
    this.totalChunksInSession = 0;
    this.completedChunks = 0;
  }

  /**
   * Set callback for when queue empties (continuous mode)
   * @param {Function} callback
   */
  setOnQueueEmpty(callback) {
    this.onQueueEmptyCallback = callback;
  }

  /**
   * Set callback for progress updates
   * @param {Function} callback
   */
  setOnProgress(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Set total chunks for progress tracking
   * @param {number} total
   */
  setTotalChunks(total) {
    this.totalChunksInSession = total;
    this.completedChunks = 0;
  }

  /**
   * Get current playback time within current chunk
   * @returns {number}
   */
  getCurrentTime() {
    return this.currentAudio ? this.currentAudio.currentTime : 0;
  }

  /**
   * Get duration of current chunk
   * @returns {number}
   */
  getCurrentDuration() {
    return this.currentAudio ? this.currentAudio.duration : 0;
  }
}
