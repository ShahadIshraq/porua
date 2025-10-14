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

class TTSContentScript {
  constructor() {
    this.state = new PlaybackState();
    this.eventManager = new EventManager();
    this.highlightManager = new HighlightManager(this.state);
    this.audioQueue = new AudioQueue(this.state, this.highlightManager);
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
  }

  init() {
    this.playButton.init();
  }

  async handlePlayClick() {
    const paragraph = this.playButton.currentParagraph;
    if (!paragraph) return;

    const text = paragraph.textContent.trim();

    this.audioQueue.clear();
    this.state.setPlayingParagraph(paragraph);
    this.playerControl.show();
    this.state.setState(PLAYER_STATES.LOADING);

    try {
      const settings = await SettingsStore.get();
      await this.synthesizeAndPlay(text, settings);
    } catch (error) {
      console.error('TTS Error:', error);
      this.state.setState(PLAYER_STATES.IDLE);
      alert('Failed to connect to TTS server. Please check your settings.\n\nError: ' + error.message);
    }
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

  async synthesizeAndPlay(text, settings) {
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

    const paragraph = this.state.getPlayingParagraph();
    if (paragraph && phraseTimeline.length > 0) {
      this.highlightManager.wrapPhrases(paragraph, phraseTimeline);
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

const ttsApp = new TTSContentScript();
ttsApp.init();
