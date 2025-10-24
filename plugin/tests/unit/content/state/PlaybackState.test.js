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
      expect(playbackState.getPlayingParagraph()).toBeNull();
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

    it('should initialize with continuous mode disabled', () => {
      expect(playbackState.isContinuousMode()).toBe(false);
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

      playbackState.setPlayingParagraph(paragraph);

      expect(playbackState.getPlayingParagraph()).toBe(paragraph);
    });

    it('should update paragraph', () => {
      const paragraph1 = document.createElement('p');
      const paragraph2 = document.createElement('p');

      playbackState.setPlayingParagraph(paragraph1);
      expect(playbackState.getPlayingParagraph()).toBe(paragraph1);

      playbackState.setPlayingParagraph(paragraph2);
      expect(playbackState.getPlayingParagraph()).toBe(paragraph2);
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

  describe('continuous mode', () => {
    it('should set continuous mode to true', () => {
      playbackState.setContinuousMode(true);
      expect(playbackState.isContinuousMode()).toBe(true);
    });

    it('should set continuous mode to false', () => {
      playbackState.setContinuousMode(true);
      playbackState.setContinuousMode(false);
      expect(playbackState.isContinuousMode()).toBe(false);
    });

    it('should toggle continuous mode', () => {
      expect(playbackState.isContinuousMode()).toBe(false);

      playbackState.setContinuousMode(true);
      expect(playbackState.isContinuousMode()).toBe(true);

      playbackState.setContinuousMode(false);
      expect(playbackState.isContinuousMode()).toBe(false);
    });
  });

  describe('skip state management', () => {
    describe('initial state', () => {
      it('should initialize with skip states as false', () => {
        expect(playbackState.getCanSkipForward()).toBe(false);
        expect(playbackState.getCanSkipBackward()).toBe(false);
      });

      it('should initialize with empty skip listeners set', () => {
        expect(playbackState.skipListeners.size).toBe(0);
      });
    });

    describe('setSkipStates', () => {
      it('should update skip states', () => {
        playbackState.setSkipStates(true, false);

        expect(playbackState.getCanSkipForward()).toBe(true);
        expect(playbackState.getCanSkipBackward()).toBe(false);
      });

      it('should update both skip states', () => {
        playbackState.setSkipStates(true, true);

        expect(playbackState.getCanSkipForward()).toBe(true);
        expect(playbackState.getCanSkipBackward()).toBe(true);
      });

      it('should notify listeners when skip states change', () => {
        const listener = vi.fn();
        playbackState.subscribeToSkipState(listener);

        playbackState.setSkipStates(true, false);

        expect(listener).toHaveBeenCalledWith({
          canSkipForward: true,
          canSkipBackward: false
        });
        expect(listener).toHaveBeenCalledTimes(1);
      });

      it('should not notify listeners if skip states unchanged', () => {
        const listener = vi.fn();
        playbackState.subscribeToSkipState(listener);

        playbackState.setSkipStates(false, false);

        expect(listener).not.toHaveBeenCalled();
      });

      it('should notify only when forward state changes', () => {
        const listener = vi.fn();
        playbackState.setSkipStates(false, false);
        playbackState.subscribeToSkipState(listener);

        playbackState.setSkipStates(true, false);

        expect(listener).toHaveBeenCalledWith({
          canSkipForward: true,
          canSkipBackward: false
        });
      });

      it('should notify only when backward state changes', () => {
        const listener = vi.fn();
        playbackState.setSkipStates(false, false);
        playbackState.subscribeToSkipState(listener);

        playbackState.setSkipStates(false, true);

        expect(listener).toHaveBeenCalledWith({
          canSkipForward: false,
          canSkipBackward: true
        });
      });
    });

    describe('subscribeToSkipState', () => {
      it('should return unsubscribe function', () => {
        const listener = vi.fn();
        const unsubscribe = playbackState.subscribeToSkipState(listener);

        expect(typeof unsubscribe).toBe('function');
      });

      it('should add listener to skip listeners set', () => {
        const listener = vi.fn();
        playbackState.subscribeToSkipState(listener);

        expect(playbackState.skipListeners.size).toBe(1);
      });

      it('should support multiple subscribers', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        playbackState.subscribeToSkipState(listener1);
        playbackState.subscribeToSkipState(listener2);
        playbackState.subscribeToSkipState(listener3);

        playbackState.setSkipStates(true, true);

        expect(listener1).toHaveBeenCalledWith({
          canSkipForward: true,
          canSkipBackward: true
        });
        expect(listener2).toHaveBeenCalledWith({
          canSkipForward: true,
          canSkipBackward: true
        });
        expect(listener3).toHaveBeenCalledWith({
          canSkipForward: true,
          canSkipBackward: true
        });
      });

      it('should notify all subscribers when skip states change', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        playbackState.subscribeToSkipState(listener1);
        playbackState.subscribeToSkipState(listener2);

        playbackState.setSkipStates(true, false);

        expect(listener1).toHaveBeenCalledTimes(1);
        expect(listener2).toHaveBeenCalledTimes(1);
      });
    });

    describe('unsubscribe from skip state', () => {
      it('should remove listener when unsubscribe is called', () => {
        const listener = vi.fn();
        const unsubscribe = playbackState.subscribeToSkipState(listener);

        unsubscribe();

        playbackState.setSkipStates(true, true);

        expect(listener).not.toHaveBeenCalled();
        expect(playbackState.skipListeners.size).toBe(0);
      });

      it('should only remove specific listener', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        const unsubscribe1 = playbackState.subscribeToSkipState(listener1);
        playbackState.subscribeToSkipState(listener2);

        unsubscribe1();

        playbackState.setSkipStates(true, false);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).toHaveBeenCalledWith({
          canSkipForward: true,
          canSkipBackward: false
        });
      });
    });

    describe('integration with reset', () => {
      it('should reset skip states to false', () => {
        playbackState.setSkipStates(true, true);

        playbackState.reset();

        expect(playbackState.getCanSkipForward()).toBe(false);
        expect(playbackState.getCanSkipBackward()).toBe(false);
      });

      it('should notify skip listeners when reset clears skip states', () => {
        const skipListener = vi.fn();
        playbackState.setSkipStates(true, true);
        playbackState.subscribeToSkipState(skipListener);
        skipListener.mockClear();

        playbackState.reset();

        expect(skipListener).toHaveBeenCalledWith({
          canSkipForward: false,
          canSkipBackward: false
        });
      });
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const paragraph = document.createElement('p');
      const timeline = [{ phrase: 'Test', startTime: 0, endTime: 500 }];

      playbackState.setState(PLAYER_STATES.PLAYING);
      playbackState.setPlayingParagraph(paragraph);
      playbackState.setHighlightedPhrase('test phrase');
      playbackState.setPhraseTimeline(timeline);
      playbackState.setContinuousMode(true);

      playbackState.reset();

      expect(playbackState.getState()).toBe(PLAYER_STATES.IDLE);
      expect(playbackState.getPlayingParagraph()).toBeNull();
      expect(playbackState.getHighlightedPhrase()).toBeNull();
      expect(playbackState.getPhraseTimeline()).toEqual([]);
      expect(playbackState.isContinuousMode()).toBe(false);
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
