import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaybackState } from '../../../../src/content/state/PlaybackState.js';
import { PLAYER_STATES } from '../../../../src/shared/utils/constants.js';

describe('PlaybackState', () => {
  let playbackState;

  beforeEach(() => {
    playbackState = new PlaybackState();
  });

  describe('initial state', () => {
    it('should initialize with IDLE state', () => {
      expect(playbackState.getState()).toBe(PLAYER_STATES.IDLE);
    });

    it('should initialize with null paragraph', () => {
      expect(playbackState.getParagraph()).toBeNull();
    });

    it('should initialize with null highlighted phrase', () => {
      expect(playbackState.getHighlightedPhrase()).toBeNull();
    });

    it('should initialize with empty phrase timeline', () => {
      expect(playbackState.getPhraseTimeline()).toEqual([]);
    });

    it('should initialize with empty listeners set', () => {
      expect(playbackState.listeners.size).toBe(0);
    });
  });

  describe('setState', () => {
    it('should update state', () => {
      playbackState.setState(PLAYER_STATES.LOADING);
      expect(playbackState.getState()).toBe(PLAYER_STATES.LOADING);
    });

    it('should notify listeners when state changes', () => {
      const listener = vi.fn();
      playbackState.subscribe(listener);

      playbackState.setState(PLAYER_STATES.PLAYING);

      expect(listener).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not notify listeners if state unchanged', () => {
      const listener = vi.fn();
      playbackState.subscribe(listener);

      playbackState.setState(PLAYER_STATES.IDLE);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should update to different states', () => {
      playbackState.setState(PLAYER_STATES.LOADING);
      expect(playbackState.getState()).toBe(PLAYER_STATES.LOADING);

      playbackState.setState(PLAYER_STATES.PLAYING);
      expect(playbackState.getState()).toBe(PLAYER_STATES.PLAYING);

      playbackState.setState(PLAYER_STATES.PAUSED);
      expect(playbackState.getState()).toBe(PLAYER_STATES.PAUSED);
    });
  });

  describe('subscribe', () => {
    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = playbackState.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should add listener to listeners set', () => {
      const listener = vi.fn();
      playbackState.subscribe(listener);

      expect(playbackState.listeners.size).toBe(1);
    });

    it('should support multiple subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      playbackState.subscribe(listener1);
      playbackState.subscribe(listener2);
      playbackState.subscribe(listener3);

      playbackState.setState(PLAYER_STATES.PLAYING);

      expect(listener1).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
      expect(listener2).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
      expect(listener3).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
    });

    it('should notify all subscribers when state changes', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      playbackState.subscribe(listener1);
      playbackState.subscribe(listener2);

      playbackState.setState(PLAYER_STATES.LOADING);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    it('should remove listener when unsubscribe is called', () => {
      const listener = vi.fn();
      const unsubscribe = playbackState.subscribe(listener);

      unsubscribe();

      playbackState.setState(PLAYER_STATES.PLAYING);

      expect(listener).not.toHaveBeenCalled();
      expect(playbackState.listeners.size).toBe(0);
    });

    it('should only remove specific listener', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsubscribe1 = playbackState.subscribe(listener1);
      playbackState.subscribe(listener2);

      unsubscribe1();

      playbackState.setState(PLAYER_STATES.PLAYING);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
    });
  });

  describe('paragraph management', () => {
    it('should set and get paragraph', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Test paragraph';

      playbackState.setParagraph(paragraph);

      expect(playbackState.getParagraph()).toBe(paragraph);
    });

    it('should update paragraph', () => {
      const paragraph1 = document.createElement('p');
      const paragraph2 = document.createElement('p');

      playbackState.setParagraph(paragraph1);
      expect(playbackState.getParagraph()).toBe(paragraph1);

      playbackState.setParagraph(paragraph2);
      expect(playbackState.getParagraph()).toBe(paragraph2);
    });
  });

  describe('highlighted phrase management', () => {
    it('should set and get highlighted phrase', () => {
      const phrase = 'test phrase';

      playbackState.setHighlightedPhrase(phrase);

      expect(playbackState.getHighlightedPhrase()).toBe(phrase);
    });

    it('should update highlighted phrase', () => {
      playbackState.setHighlightedPhrase('phrase 1');
      expect(playbackState.getHighlightedPhrase()).toBe('phrase 1');

      playbackState.setHighlightedPhrase('phrase 2');
      expect(playbackState.getHighlightedPhrase()).toBe('phrase 2');
    });
  });

  describe('phrase timeline management', () => {
    it('should set and get phrase timeline', () => {
      const timeline = [
        { phrase: 'Hello', startTime: 0, endTime: 500 },
        { phrase: 'World', startTime: 500, endTime: 1000 }
      ];

      playbackState.setPhraseTimeline(timeline);

      expect(playbackState.getPhraseTimeline()).toBe(timeline);
    });

    it('should update phrase timeline', () => {
      const timeline1 = [{ phrase: 'First', startTime: 0, endTime: 500 }];
      const timeline2 = [{ phrase: 'Second', startTime: 0, endTime: 1000 }];

      playbackState.setPhraseTimeline(timeline1);
      expect(playbackState.getPhraseTimeline()).toBe(timeline1);

      playbackState.setPhraseTimeline(timeline2);
      expect(playbackState.getPhraseTimeline()).toBe(timeline2);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const paragraph = document.createElement('p');
      const timeline = [{ phrase: 'Test', startTime: 0, endTime: 500 }];

      playbackState.setState(PLAYER_STATES.PLAYING);
      playbackState.setParagraph(paragraph);
      playbackState.setHighlightedPhrase('test phrase');
      playbackState.setPhraseTimeline(timeline);

      playbackState.reset();

      expect(playbackState.getState()).toBe(PLAYER_STATES.IDLE);
      expect(playbackState.getParagraph()).toBeNull();
      expect(playbackState.getHighlightedPhrase()).toBeNull();
      expect(playbackState.getPhraseTimeline()).toEqual([]);
    });

    it('should notify listeners after reset', () => {
      const listener = vi.fn();
      playbackState.subscribe(listener);

      playbackState.setState(PLAYER_STATES.PLAYING);
      listener.mockClear();

      playbackState.reset();

      expect(listener).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should reset to IDLE even if already IDLE', () => {
      const listener = vi.fn();
      playbackState.subscribe(listener);

      playbackState.reset();

      expect(listener).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
    });
  });
});
