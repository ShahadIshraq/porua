import { AudioPlaybackError } from '../../shared/utils/errors.js';
import { PLAYER_STATES, TIMEOUTS, AUDIO_PROGRESS } from '../../shared/utils/constants.js';

export class AudioQueue {
  constructor(state, highlightManager) {
    this.state = state;
    this.highlightManager = highlightManager;
    this.queue = [];
    this.currentAudio = null;
    this.currentMetadata = null;
    this.isPlaying = false;
    this.pausedQueue = [];
    this.onQueueEmptyCallback = null;
    this.onProgressCallback = null;
    this.totalChunks = 0; // Total number of chunks for this playback session
    this.completedChunks = 0; // Number of chunks that have finished playing
  }

  enqueue(audioBlob, metadata) {
    this.queue.push({ blob: audioBlob, metadata });
    this.totalChunks++;
  }

  clear() {
    this.queue = [];
    this.pausedQueue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.currentMetadata = null;
    this.isPlaying = false;
    this.totalChunks = 0;
    this.completedChunks = 0;
  }

  async play() {
    if (this.queue.length === 0) {
      this.finish();
      return;
    }

    const item = this.queue.shift();
    this.currentMetadata = item.metadata;

    const audioUrl = URL.createObjectURL(item.blob);
    this.currentAudio = new Audio(audioUrl);

    this.setupAudioEvents(audioUrl);
    this.setupHighlightSync();

    try {
      await this.currentAudio.play();
      this.state.setState(PLAYER_STATES.PLAYING);
      this.isPlaying = true;
    } catch (error) {
      URL.revokeObjectURL(audioUrl);
      throw new AudioPlaybackError(error.message);
    }
  }

  pause() {
    if (this.currentAudio && this.isPlaying) {
      this.currentAudio.pause();
      this.pausedQueue = [...this.queue];
      this.isPlaying = false;
      this.state.setState(PLAYER_STATES.PAUSED);
    }
  }

  async resume() {
    if (this.currentAudio && !this.isPlaying) {
      try {
        await this.currentAudio.play();
        this.isPlaying = true;
        this.state.setState(PLAYER_STATES.PLAYING);

        if (this.currentMetadata) {
          const startOffsetMs = this.currentMetadata.start_offset_ms;
          const currentTimeMs = startOffsetMs + (this.currentAudio.currentTime * 1000);
          this.highlightManager.updateHighlight(currentTimeMs);
        }
      } catch (error) {
        await this.play();
      }
    }
  }

  setupAudioEvents(audioUrl) {
    this.currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      this.completedChunks++; // Increment completed chunks
      this.play();
    };

    this.currentAudio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      this.completedChunks++; // Increment even on error to avoid stuck progress
      this.play();
    };
  }

  setupHighlightSync() {
    if (!this.currentMetadata) return;

    const startOffsetMs = this.currentMetadata.start_offset_ms;

    this.currentAudio.addEventListener('timeupdate', () => {
      if (this.currentAudio && !this.currentAudio.paused) {
        const currentTimeMs = startOffsetMs + (this.currentAudio.currentTime * 1000);
        this.highlightManager.updateHighlight(currentTimeMs);

        // Emit CUMULATIVE progress updates for the progress ring
        if (this.onProgressCallback && this.totalChunks > 0) {
          // Calculate progress: (completed chunks + current chunk progress) / total chunks
          const currentChunkProgress = this.currentAudio.duration > 0
            ? this.currentAudio.currentTime / this.currentAudio.duration
            : 0;
          const totalProgress = (this.completedChunks + currentChunkProgress) / this.totalChunks;

          // Pass as if it's a single audio: currentTime and duration scaled to represent total
          const virtualCurrentTime = totalProgress * AUDIO_PROGRESS.VIRTUAL_DURATION;
          const virtualDuration = AUDIO_PROGRESS.VIRTUAL_DURATION;

          this.onProgressCallback(virtualCurrentTime, virtualDuration);
        }
      }
    });

    this.currentAudio.addEventListener('play', () => {
      this.highlightManager.updateHighlight(startOffsetMs);

      // Emit initial cumulative progress on play
      if (this.onProgressCallback && this.currentAudio && this.totalChunks > 0) {
        const currentChunkProgress = this.currentAudio.duration > 0
          ? this.currentAudio.currentTime / this.currentAudio.duration
          : 0;
        const totalProgress = (this.completedChunks + currentChunkProgress) / this.totalChunks;

        const virtualCurrentTime = totalProgress * AUDIO_PROGRESS.VIRTUAL_DURATION;
        const virtualDuration = AUDIO_PROGRESS.VIRTUAL_DURATION;

        this.onProgressCallback(virtualCurrentTime, virtualDuration);
      }
    });
  }

  setOnQueueEmpty(callback) {
    this.onQueueEmptyCallback = callback;
  }

  setOnProgress(callback) {
    this.onProgressCallback = callback;
  }

  finish() {
    this.isPlaying = false;

    // In continuous mode, delegate to the controller
    if (this.state.isContinuousMode()) {
      if (this.onQueueEmptyCallback) {
        this.onQueueEmptyCallback();
      }
      return;
    }

    // Original cleanup logic for single paragraph playback
    this.state.setState(PLAYER_STATES.IDLE);

    // Clear highlights immediately
    this.highlightManager.clearHighlights();

    // Restore paragraph immediately (no timeout!)
    // Only restore if we're truly done and not paused
    const paragraph = this.state.getPlayingParagraph();
    if (paragraph) {
      this.highlightManager.restoreParagraph(paragraph);
    }

    // Clear playing paragraph reference
    this.state.setPlayingParagraph(null);

    // Clean up audio references
    this.currentAudio = null;
    this.currentMetadata = null;
  }
}
