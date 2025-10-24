import { PLAYER_STATES } from '../../shared/utils/constants.js';

export class PlaybackState {
  constructor() {
    this.state = PLAYER_STATES.IDLE;
    this.listeners = new Set();
    this.playingParagraph = null;
    this.highlightedPhrase = null;
    this.phraseTimeline = [];
    this.isContinuousModeEnabled = false;
    this.canSkipForward = false;
    this.canSkipBackward = false;
    this.skipListeners = new Set();
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.notify();
    }
  }

  getState() {
    return this.state;
  }

  setPlayingParagraph(paragraph) {
    this.playingParagraph = paragraph;
  }

  getPlayingParagraph() {
    return this.playingParagraph;
  }

  setHighlightedPhrase(phrase) {
    this.highlightedPhrase = phrase;
  }

  getHighlightedPhrase() {
    return this.highlightedPhrase;
  }

  setPhraseTimeline(timeline) {
    this.phraseTimeline = timeline;
  }

  getPhraseTimeline() {
    return this.phraseTimeline;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  setContinuousMode(enabled) {
    this.isContinuousModeEnabled = enabled;
  }

  isContinuousMode() {
    return this.isContinuousModeEnabled;
  }

  setSkipStates(canSkipForward, canSkipBackward) {
    if (this.canSkipForward !== canSkipForward ||
        this.canSkipBackward !== canSkipBackward) {
      this.canSkipForward = canSkipForward;
      this.canSkipBackward = canSkipBackward;
      this.notifySkipStateChange();
    }
  }

  getCanSkipForward() {
    return this.canSkipForward;
  }

  getCanSkipBackward() {
    return this.canSkipBackward;
  }

  subscribeToSkipState(listener) {
    this.skipListeners.add(listener);
    return () => this.skipListeners.delete(listener);
  }

  notifySkipStateChange() {
    this.skipListeners.forEach(listener => listener({
      canSkipForward: this.canSkipForward,
      canSkipBackward: this.canSkipBackward
    }));
  }

  reset() {
    this.state = PLAYER_STATES.IDLE;
    this.playingParagraph = null;
    this.highlightedPhrase = null;
    this.phraseTimeline = [];
    this.isContinuousModeEnabled = false;

    // Reset skip states and notify if they were set
    const skipStatesChanged = this.canSkipForward || this.canSkipBackward;
    this.canSkipForward = false;
    this.canSkipBackward = false;

    this.notify();

    if (skipStatesChanged) {
      this.notifySkipStateChange();
    }
  }
}
