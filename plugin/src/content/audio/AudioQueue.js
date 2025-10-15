import { AudioPlaybackError } from '../../shared/utils/errors.js';
import { PLAYER_STATES, TIMEOUTS } from '../../shared/utils/constants.js';

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
  }

  enqueue(audioBlob, metadata) {
    this.queue.push({ blob: audioBlob, metadata });
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
      this.play();
    };

    this.currentAudio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
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
      }
    });

    this.currentAudio.addEventListener('play', () => {
      this.highlightManager.updateHighlight(startOffsetMs);
    });
  }

  setOnQueueEmpty(callback) {
    this.onQueueEmptyCallback = callback;
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
