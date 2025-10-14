import { PLAYER_STATES } from '../../shared/utils/constants.js';

export class PlaybackState {
  constructor() {
    this.state = PLAYER_STATES.IDLE;
    this.listeners = new Set();
    this.playingParagraph = null;
    this.highlightedPhrase = null;
    this.phraseTimeline = [];
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

  reset() {
    this.state = PLAYER_STATES.IDLE;
    this.playingParagraph = null;
    this.highlightedPhrase = null;
    this.phraseTimeline = [];
    this.notify();
  }
}
