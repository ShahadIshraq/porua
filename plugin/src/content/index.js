import '../styles/variables.css';
import '../styles/content/highlighting.css';
import '../styles/content/play-button.css';
import '../styles/content/player-control.css';
import { PlaybackState } from './state/PlaybackState.js';
import { EventManager } from './utils/events.js';
import { PlayButton } from './ui/PlayButton.js';
import { PlayerControl } from './ui/PlayerControl.js';
import { HighlightManager } from './ui/HighlightManager.js';
import { AudioQueue } from './audio/AudioQueue.js';
import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { backgroundTTSClient } from '../shared/api/BackgroundTTSClient.js';
import { parseMultipartStream } from '../shared/api/MultipartStreamHandler.js';
import { PLAYER_STATES, SKIP_DIRECTION, SKIP_CONFIG } from '../shared/utils/constants.js';
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
      () => this.handleSkipForward(),
      () => this.handleSkipBackward()
    );
    this.playButton = new PlayButton(
      this.state,
      this.eventManager,
      () => this.handlePlayClick()
    );

    // Skip control properties
    this.isSkipping = false;

    this.wireupContinuousPlayback();
  }

  init() {
    this.playButton.init();
  }

  wireupContinuousPlayback() {
    this.audioQueue.setOnQueueEmpty(() => {
      this.continuousController.handleAudioQueueEmpty();
    });

    this.continuousController.onQueueComplete(() => {
      this.state.setState(PLAYER_STATES.IDLE);
      this.state.setContinuousMode(false);
    });

    this.continuousController.onParagraphTransition(() => {
      this.updateSkipButtonStates();
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

      // Update skip button states after playback starts
      this.updateSkipButtonStates();
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

    // filterReadableElements removes nested duplicates (e.g., <p> inside <li>)
    // to prevent the same content from being read twice
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

  async synthesizeAndPlay(text, settings = null, paragraph = null, autoPlay = true) {
    // Use provided paragraph or get from state
    if (!paragraph) {
      paragraph = this.state.getPlayingParagraph();
    }

    // Use BackgroundTTSClient for synthesis (bypasses mixed content restrictions)
    const response = await backgroundTTSClient.synthesizeStream(text);

    // Parse multipart stream using unified handler
    const { audioBlobs, metadataArray, phraseTimeline } = await parseMultipartStream(response);

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

    if (autoPlay) {
      await this.audioQueue.play();
    } else {
      // Load audio but don't play (for paused state skips)
      // Highlight the first phrase manually
      const timeline = this.state.getPhraseTimeline();
      if (timeline && timeline.length > 0) {
        this.highlightManager.updateHighlight(timeline[0].startTime);
      }
    }
  }

  async handleSkipForward() {
    if (this.isSkipping) return;

    const currentState = this.state.getState();
    if (currentState !== PLAYER_STATES.PLAYING &&
        currentState !== PLAYER_STATES.PAUSED) {
      return;
    }

    this.isSkipping = true;

    try {
      const success = await this.skipPhrase(SKIP_DIRECTION.FORWARD);
      if (!success) {
        await this.skipParagraph(SKIP_DIRECTION.FORWARD);
      }
    } finally {
      setTimeout(() => {
        this.isSkipping = false;
      }, SKIP_CONFIG.DEBOUNCE_MS);
    }
  }

  async handleSkipBackward() {
    if (this.isSkipping) return;

    const currentState = this.state.getState();
    if (currentState !== PLAYER_STATES.PLAYING &&
        currentState !== PLAYER_STATES.PAUSED) {
      return;
    }

    this.isSkipping = true;

    try {
      const success = await this.skipPhrase(SKIP_DIRECTION.BACKWARD);
      if (!success) {
        await this.skipParagraph(SKIP_DIRECTION.BACKWARD);
      }
    } finally {
      setTimeout(() => {
        this.isSkipping = false;
      }, SKIP_CONFIG.DEBOUNCE_MS);
    }
  }

  async skipPhrase(direction) {
    const currentTime = this.audioQueue.getCurrentPlaybackTime();
    const timeline = this.state.getPhraseTimeline();

    if (!timeline || timeline.length === 0) return false;

    const totalDuration = timeline[timeline.length - 1].endTime;

    // Calculate target time
    let targetTime;
    if (direction === SKIP_DIRECTION.FORWARD) {
      targetTime = Math.min(currentTime + SKIP_CONFIG.PHRASE_SKIP_INTERVAL_MS, totalDuration);
    } else {
      targetTime = Math.max(currentTime - SKIP_CONFIG.PHRASE_SKIP_INTERVAL_MS, 0);
    }

    // Check if we're at a boundary - if so, trigger paragraph skip instead
    if (direction === SKIP_DIRECTION.FORWARD &&
        targetTime >= totalDuration - SKIP_CONFIG.BOUNDARY_THRESHOLD_MS) {
      return false;
    }

    if (direction === SKIP_DIRECTION.BACKWARD &&
        targetTime <= SKIP_CONFIG.BOUNDARY_THRESHOLD_MS) {
      return false;
    }

    // Perform the seek
    this.audioQueue.seekToTime(targetTime);
    return true;
  }

  async skipParagraph(direction) {
    // Capture current playback state before clearing
    const wasPlaying = this.state.getState() === PLAYER_STATES.PLAYING;

    // Pause current playback
    this.audioQueue.pause();

    // Clean up old paragraph
    const oldParagraph = this.state.getPlayingParagraph();
    if (oldParagraph) {
      this.highlightManager.restoreParagraph(oldParagraph);
    }
    this.audioQueue.clear();

    // Get next/previous paragraph
    let newParagraph;
    if (direction === SKIP_DIRECTION.FORWARD) {
      newParagraph = this.paragraphQueue.skipForward();
    } else {
      newParagraph = this.paragraphQueue.skipBackward();
    }

    if (!newParagraph) {
      // Reached boundary, stop playback
      this.state.setState(PLAYER_STATES.IDLE);
      this.state.setPlayingParagraph(null);
      this.playerControl.resetProgress();
      this.updateSkipButtonStates();
      return;
    }

    // Update state
    this.state.setPlayingParagraph(newParagraph);
    this.state.setState(PLAYER_STATES.LOADING);

    try {
      // Synthesize new paragraph
      const text = newParagraph.textContent;
      await this.synthesizeAndPlay(text, null, newParagraph, wasPlaying);

      // If was paused, pause again after loading
      if (!wasPlaying) {
        this.audioQueue.pause();
        this.state.setState(PLAYER_STATES.PAUSED);

        // Ensure first phrase is highlighted even when paused
        const timeline = this.state.getPhraseTimeline();
        if (timeline && timeline.length > 0) {
          this.highlightManager.updateHighlight(timeline[0].startTime);
        }
      }

      // Update skip button states
      this.updateSkipButtonStates();

      // Clear prefetch cache and re-trigger for new upcoming paragraphs
      if (this.state.isContinuousMode()) {
        this.prefetchManager.clearCache();
        const upcomingParagraphs = this.paragraphQueue.getUpcomingParagraphs(2);
        upcomingParagraphs.forEach(p => {
          this.prefetchManager.prefetch(p.textContent).catch(err => {
            console.warn('[Skip] Prefetch failed:', err);
          });
        });
      }
    } catch (error) {
      console.error('[Skip] Failed to skip paragraph:', error);
      this.state.setState(PLAYER_STATES.IDLE);
    }
  }

  updateSkipButtonStates() {
    const canSkipForward = this.paragraphQueue.hasNext();
    const canSkipBackward = this.paragraphQueue.hasPrevious();

    this.state.setSkipStates(canSkipForward, canSkipBackward);
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
