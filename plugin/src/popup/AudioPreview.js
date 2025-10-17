/**
 * Manages audio preview playback for voice samples
 * Ensures only one sample plays at a time
 */
export class AudioPreview {
  constructor() {
    this.audioElement = new Audio();
    this.currentVoiceId = null;
    this.currentObjectUrl = null; // Track object URL for cleanup
    this.onPlayStateChange = null; // Callback: (voiceId, state, error?) => void

    // Setup event listeners
    this.audioElement.addEventListener('ended', () => this.handleEnded());
    this.audioElement.addEventListener('error', (e) => this.handleError(e));
    this.audioElement.addEventListener('loadstart', () => this.handleLoadStart());
    this.audioElement.addEventListener('canplay', () => this.handleCanPlay());
  }

  /**
   * Play a voice sample from a Blob
   * @param {string} voiceId - Voice ID being played
   * @param {Blob} audioBlob - Audio data as Blob
   * @returns {Promise<void>}
   */
  async play(voiceId, audioBlob) {
    // Stop any current playback and clean up
    this.stop();

    this.currentVoiceId = voiceId;

    // Create object URL from blob
    this.currentObjectUrl = URL.createObjectURL(audioBlob);
    this.audioElement.src = this.currentObjectUrl;

    // Notify loading state
    if (this.onPlayStateChange) {
      this.onPlayStateChange(voiceId, 'loading');
    }

    try {
      await this.audioElement.play();
      // State will be updated in handleCanPlay
    } catch (error) {
      console.error('[AudioPreview] Play error:', error);
      if (this.onPlayStateChange) {
        this.onPlayStateChange(voiceId, 'error', error.message);
      }
      this.cleanupObjectUrl();
      this.currentVoiceId = null;
    }
  }

  /**
   * Stop current playback
   */
  stop() {
    if (!this.audioElement.paused) {
      this.audioElement.pause();
    }
    this.audioElement.currentTime = 0;

    if (this.currentVoiceId && this.onPlayStateChange) {
      this.onPlayStateChange(this.currentVoiceId, 'stopped');
    }

    this.cleanupObjectUrl();
    this.currentVoiceId = null;
  }

  /**
   * Clean up object URL to free memory
   */
  cleanupObjectUrl() {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  /**
   * Check if a specific voice is currently playing
   * @param {string} voiceId
   * @returns {boolean}
   */
  isPlaying(voiceId) {
    return this.currentVoiceId === voiceId && !this.audioElement.paused;
  }

  /**
   * Check if a specific voice is loading
   * @param {string} voiceId
   * @returns {boolean}
   */
  isLoading(voiceId) {
    return this.currentVoiceId === voiceId &&
           this.audioElement.readyState < 3 &&
           this.audioElement.src !== '';
  }

  /**
   * Get current playback state for a voice
   * @param {string} voiceId
   * @returns {'idle'|'loading'|'playing'|'stopped'}
   */
  getState(voiceId) {
    if (this.currentVoiceId !== voiceId) return 'idle';
    if (this.audioElement.readyState < 3) return 'loading';
    if (!this.audioElement.paused) return 'playing';
    return 'stopped';
  }

  handleEnded() {
    const voiceId = this.currentVoiceId;
    if (voiceId && this.onPlayStateChange) {
      this.onPlayStateChange(voiceId, 'stopped');
    }
    this.cleanupObjectUrl();
    this.currentVoiceId = null;
  }

  handleError(event) {
    const voiceId = this.currentVoiceId;
    if (voiceId && this.onPlayStateChange) {
      const errorMsg = 'Failed to load audio sample';
      this.onPlayStateChange(voiceId, 'error', errorMsg);
    }
    this.cleanupObjectUrl();
    this.currentVoiceId = null;
  }

  handleLoadStart() {
    if (this.currentVoiceId && this.onPlayStateChange) {
      this.onPlayStateChange(this.currentVoiceId, 'loading');
    }
  }

  handleCanPlay() {
    if (this.currentVoiceId && this.onPlayStateChange) {
      this.onPlayStateChange(this.currentVoiceId, 'playing');
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stop();
    this.audioElement.src = '';
    this.onPlayStateChange = null;
  }
}
