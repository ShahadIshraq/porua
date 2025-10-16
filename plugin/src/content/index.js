import { PlaybackState } from './state/PlaybackState.js';
import { EventManager } from './utils/events.js';
import { PlayButton } from './ui/PlayButton.js';
import { PlayerControl } from './ui/PlayerControl.js';
import { HighlightManager } from './ui/HighlightManager.js';
import { AudioQueue } from './audio/AudioQueue.js';
import { StreamParser } from './audio/StreamParser.js';
import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { TTSClient } from '../shared/api/TTSClient.js';
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
      () => this.handlePlayerControlClick()
    );
    this.playButton = new PlayButton(
      this.state,
      this.eventManager,
      () => this.handlePlayClick()
    );

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

  async synthesizeAndPlay(text, settings = null, paragraph = null) {
    // Get settings if not provided
    if (!settings) {
      settings = await SettingsStore.get();
    }

    // Use provided paragraph or get from state
    if (!paragraph) {
      paragraph = this.state.getPlayingParagraph();
    }

    const client = new TTSClient(settings.apiUrl, settings.apiKey);
    const response = await client.synthesizeStream(text);

    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('multipart')) {
      throw new Error('Expected multipart response, got: ' + contentType);
    }

    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      throw new Error('No boundary found in multipart response');
    }

    const reader = response.body.getReader();
    const parts = await StreamParser.parseMultipartStream(reader, boundaryMatch[1]);

    const metadataArray = parts
      .filter(p => p.type === 'metadata')
      .map(p => p.metadata);

    const audioBlobs = parts
      .filter(p => p.type === 'audio')
      .map(p => new Blob([p.audioData], { type: 'audio/wav' }));

    if (audioBlobs.length === 0) {
      throw new Error('No audio data received from server');
    }

    const phraseTimeline = StreamParser.buildPhraseTimeline(metadataArray);
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
