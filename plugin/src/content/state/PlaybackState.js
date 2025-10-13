import { PLAYER_STATES } from '../../shared/utils/constants.js';

export class PlaybackState {
  constructor() {
    this.state = PLAYER_STATES.IDLE;
    this.listeners = new Set();
    this.currentParagraph = null;
    this.currentHighlightedPhrase = null;
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

  setParagraph(paragraph) {
    this.currentParagraph = paragraph;
  }

  getParagraph() {
    return this.currentParagraph;
  }

  setHighlightedPhrase(phrase) {
    this.currentHighlightedPhrase = phrase;
  }

  getHighlightedPhrase() {
    return this.currentHighlightedPhrase;
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
    this.currentParagraph = null;
    this.currentHighlightedPhrase = null;
    this.phraseTimeline = [];
    this.notify();
  }
}
