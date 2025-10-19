import { PlaybackState } from './state/PlaybackState.js';
import { EventManager } from './utils/events.js';
import { PlayButton } from './ui/PlayButton.js';
import { PlayerControl } from './ui/PlayerControl.js';
import { HighlightManager } from './ui/HighlightManager.js';
import { AudioQueue } from './audio/AudioQueue.js';
import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { ttsService } from '../shared/services/TTSService.js';
import { PLAYER_STATES } from '../shared/utils/constants.js';
import { ParagraphQueue } from './queue/ParagraphQueue.js';
import { PrefetchManager } from './prefetch/PrefetchManager.js';
import { ContinuousPlaybackController } from './controllers/ContinuousPlaybackController.js';
import { getReadableElementsSelector } from '../shared/config/readableElements.js';
import { filterReadableElements } from '../shared/utils/elementValidation.js';

class TTSContentScript {
  constructor() {
    this.state = new PlaybackState();
    this.eventManager = new EventManager();
    this.highlightManager = new HighlightManager(this.state);
    this.audioQueue = new AudioQueue(this.state, this.highlightManager);
    this.paragraphQueue = new ParagraphQueue();
    this.prefetchManager = new PrefetchManager(SettingsStore);
    this.continuousController = new ContinuousPlaybackController(
      this.state,
      this.audioQueue,
      this.highlightManager,
      this.prefetchManager,
      this.paragraphQueue,
      (text, paragraph) => this.synthesizeAndPlay(text, null, paragraph)
    );
    this.playerControl = new PlayerControl(
      this.state,
      this.eventManager,
      () => this.handlePlayerControlClick(),
      10 // Default skip interval, will be updated from settings in init()
    );
    this.playButton = new PlayButton(
      this.state,
      this.eventManager,
      () => this.handlePlayClick()
    );

    this.wireupContinuousPlayback();
    this.wireupSkipControls();
    this.wireupKeyboardShortcuts();
  }

  async init() {
    this.playButton.init();

    // Load skip interval from settings
    const settings = await SettingsStore.get();
    this.playerControl.skipInterval = settings.skipInterval || 10;
  }

  wireupSkipControls() {
    this.playerControl.setOnSkip((seconds) => this.handleSkip(seconds));
  }

  wireupKeyboardShortcuts() {
    this.eventManager.on(document, 'keydown', (e) => {
      // Only handle shortcuts when playing or paused
      const state = this.state.getState();
      if (state !== PLAYER_STATES.PLAYING && state !== PLAYER_STATES.PAUSED) {
        return;
      }

      // Ignore if user is typing in input field
      if (e.target.matches('input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      const skipInterval = this.playerControl.skipInterval || 10;

      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.handleSkip(e.shiftKey ? -30 : -skipInterval);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.handleSkip(e.shiftKey ? 30 : skipInterval);
          break;
      }
    });
  }

  wireupContinuousPlayback() {
    this.audioQueue.setOnQueueEmpty(() => {
      this.continuousController.handleAudioQueueEmpty();
    });

    this.continuousController.onQueueComplete(() => {
      this.state.setState(PLAYER_STATES.IDLE);
      this.state.setContinuousMode(false);
    });

    // Wire up progress updates from audio queue to player control
    this.audioQueue.setOnProgress((currentTime, duration) => {
      this.playerControl.updateProgress(currentTime, duration);
    });
  }

  async handlePlayClick() {
    const paragraph = this.playButton.currentParagraph;
    if (!paragraph) return;

    this.audioQueue.clear();
    this.state.setPlayingParagraph(paragraph);
    this.playerControl.show();
    this.state.setState(PLAYER_STATES.LOADING);

    try {
      // Get following paragraphs for continuous playback
      const followingParagraphs = this.getFollowingParagraphs(paragraph);

      // Start continuous playback
      const settings = await SettingsStore.get();
      await this.continuousController.playContinuous(paragraph, followingParagraphs);
    } catch (error) {
      console.error('TTS Error:', error);
      this.state.setState(PLAYER_STATES.IDLE);
      alert('Failed to connect to TTS server. Please check your settings.\n\nError: ' + error.message);
    }
  }

  getFollowingParagraphs(startParagraph) {
    const all = Array.from(document.querySelectorAll(getReadableElementsSelector()));
    const startIndex = all.indexOf(startParagraph);
    if (startIndex === -1) return [];

    return filterReadableElements(all.slice(startIndex + 1));
  }

  handlePlayerControlClick() {
    const currentState = this.state.getState();

    if (currentState === PLAYER_STATES.PLAYING) {
      this.audioQueue.pause();
    } else if (currentState === PLAYER_STATES.PAUSED) {
      this.audioQueue.resume();
    } else if (currentState === PLAYER_STATES.IDLE) {
      const paragraph = this.state.getPlayingParagraph();
      if (paragraph) {
        this.handlePlayClick();
      }
    }
  }

  handleSkip(seconds) {
    const currentState = this.state.getState();

    // Only allow seeking when playing or paused
    if (currentState !== PLAYER_STATES.PLAYING && currentState !== PLAYER_STATES.PAUSED) {
      return;
    }

    const success = this.audioQueue.seek(seconds);

    if (!success) {
      console.warn('[TTS] Skip failed: No audio currently playing');
    }
  }

  async synthesizeAndPlay(text, settings = null, paragraph = null) {
    // Use provided paragraph or get from state
    if (!paragraph) {
      paragraph = this.state.getPlayingParagraph();
    }

    // TTSService now returns parsed data directly (with transparent caching)
    const { audioBlobs, metadataArray, phraseTimeline } = await ttsService.synthesizeStream(text);

    if (audioBlobs.length === 0) {
      throw new Error('No audio data received from server');
    }

    this.state.setPhraseTimeline(phraseTimeline);

    if (paragraph && phraseTimeline.length > 0) {
      this.highlightManager.wrapPhrases(paragraph, phraseTimeline);
    }

    // After stream parsing completes, trigger prefetch
    if (this.state.isContinuousMode()) {
      this.continuousController.handleStreamComplete();
    }

    for (let i = 0; i < audioBlobs.length; i++) {
      this.audioQueue.enqueue(audioBlobs[i], metadataArray[i] || null);
    }

    await this.audioQueue.play();
  }

  cleanup() {
    this.playButton.cleanup();
    this.playerControl.cleanup();
    this.audioQueue.clear();
    this.eventManager.cleanup();
  }
}

// Prevent multiple instances
if (!window.__ttsAppInitialized) {
  window.__ttsAppInitialized = true;
  const ttsApp = new TTSContentScript();
  ttsApp.init();
} else {
  console.warn('[TTS] Content script already initialized, skipping');
}
