import { ttsService } from '../shared/services/TTSService.js';
import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { AudioPreview } from './AudioPreview.js';
import { createElement, replaceContent } from '../shared/utils/domBuilder.js';

/**
 * Voice selector component with audio preview
 * Organizes voices by language and gender with collapsible sections
 */
export class VoiceSelector {
  constructor(containerElement, statusMessage, audioPreview = null) {
    this.container = containerElement;
    this.statusMessage = statusMessage;
    this.audioPreview = audioPreview || new AudioPreview();

    // State
    this.voices = [];
    this.selectedVoiceId = null;
    this.selectedVoiceName = null;
    this.playbackStates = {};
    this.loading = false;
    this.error = null;
    this.collapsedSections = {
      'American English': false,
      'British English': false
    };

    // If we created our own AudioPreview (not shared), bind callback directly
    if (!audioPreview) {
      this.audioPreview.onPlayStateChange = (voiceId, state, error) => {
        this.handlePlaybackStateChange(voiceId, state, error);
      };
    }
    // Otherwise, SettingsForm will manage the shared callback
  }

  /**
   * Initialize the component
   */
  async init() {
    // Load current selection from storage
    const { id, name } = await SettingsStore.getSelectedVoice();
    this.selectedVoiceId = id;
    this.selectedVoiceName = name;

    // Render initial state (collapsed, showing current selection)
    this.renderCollapsedView();

    // Setup expand button listener
    this.setupExpandButton();
  }

  /**
   * Render collapsed view showing current voice
   */
  renderCollapsedView() {
    const view = createElement('div', 'voice-selector-collapsed', [
      createElement('div', 'current-voice', [
        createElement('label', null, 'Selected Voice'),
        createElement('div', 'current-voice-display', [
          createElement('span', 'voice-name', this.selectedVoiceName),
          createElement('button', { type: 'button', className: 'btn-expand', id: 'voice-selector-expand' }, 'Change Voice')
        ])
      ])
    ]);

    replaceContent(this.container, view);
  }

  /**
   * Setup expand button listener
   */
  setupExpandButton() {
    const expandBtn = this.container.querySelector('#voice-selector-expand');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => this.expand());
    }
  }

  /**
   * Expand to full voice selection view
   */
  async expand() {
    this.loading = true;
    this.renderLoadingView();

    try {
      await this.loadVoices();
      this.renderExpandedView();
    } catch (error) {
      console.error('[VoiceSelector] Failed to load voices:', error);
      this.error = error.message;
      this.renderErrorView();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Load voices from API
   */
  async loadVoices() {
    const response = await ttsService.getVoices();
    this.voices = response.voices || [];

    // Initialize playback states
    this.playbackStates = {};
    this.voices.forEach(voice => {
      this.playbackStates[voice.id] = 'idle';
    });
  }

  /**
   * Render loading view
   */
  renderLoadingView() {
    const view = createElement('div', 'voice-selector-loading', [
      createElement('div', 'loading-spinner'),
      createElement('p', null, 'Loading voices...')
    ]);

    replaceContent(this.container, view);
  }

  /**
   * Render error view
   */
  renderErrorView() {
    const retryBtn = createElement('button', { type: 'button', className: 'btn-retry', id: 'voice-selector-retry' }, 'Retry');
    const cancelBtn = createElement('button', { type: 'button', className: 'btn-cancel', id: 'voice-selector-cancel' }, 'Cancel');

    const view = createElement('div', 'voice-selector-error', [
      createElement('p', 'error-message', `Failed to load voices: ${this.error}`),
      retryBtn,
      cancelBtn
    ]);

    replaceContent(this.container, view);

    retryBtn.addEventListener('click', () => this.expand());
    cancelBtn.addEventListener('click', () => this.renderCollapsedView());
  }

  /**
   * Render full expanded view with voice list
   */
  renderExpandedView() {
    const groupedVoices = this.groupVoicesByLanguageAndGender();

    const header = createElement('div', 'voice-selector-header', [
      createElement('h3', null, 'Select Voice'),
      createElement('button', { type: 'button', className: 'btn-close', id: 'voice-selector-close' }, '✕')
    ]);

    const languageSections = [];
    for (const [language, genderGroups] of Object.entries(groupedVoices)) {
      languageSections.push(this.renderLanguageSection(language, genderGroups));
    }

    const view = createElement('div', 'voice-selector-expanded', [
      header,
      createElement('div', 'voice-sections', languageSections)
    ]);

    replaceContent(this.container, view);
    this.attachEventListeners();
  }

  /**
   * Group voices by language, then gender
   * @returns {Object} { 'American English': { Female: [...], Male: [...] }, ... }
   */
  groupVoicesByLanguageAndGender() {
    const grouped = {};

    this.voices.forEach(voice => {
      const language = this.formatLanguage(voice.language);
      const gender = voice.gender;

      if (!grouped[language]) {
        grouped[language] = { Female: [], Male: [] };
      }

      if (!grouped[language][gender]) {
        grouped[language][gender] = [];
      }

      grouped[language][gender].push(voice);
    });

    // Sort voices within each group by name
    for (const language of Object.keys(grouped)) {
      for (const gender of Object.keys(grouped[language])) {
        grouped[language][gender].sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return grouped;
  }

  /**
   * Format language string for display
   * @param {string} language - e.g., 'AmericanEnglish', 'BritishEnglish'
   * @returns {string} - e.g., 'American English', 'British English'
   */
  formatLanguage(language) {
    // Convert 'AmericanEnglish' -> 'American English'
    return language.replace(/([A-Z])/g, ' $1').trim();
  }

  /**
   * Render a language section with gender groups
   * @param {string} language
   * @param {Object} genderGroups - { Female: [...], Male: [...] }
   * @returns {HTMLElement} DOM element
   */
  renderLanguageSection(language, genderGroups) {
    const isCollapsed = this.collapsedSections[language];
    const toggleIcon = isCollapsed ? '▶' : '▼';

    const header = createElement('div', 'language-header', [
      createElement('button', { type: 'button', className: 'language-toggle', 'data-language': language }, [
        createElement('span', 'toggle-icon', toggleIcon),
        createElement('span', 'language-name', language)
      ])
    ]);

    const children = [header];

    if (!isCollapsed) {
      const genderGroups_content = [];

      // Render Female voices
      if (genderGroups.Female && genderGroups.Female.length > 0) {
        genderGroups_content.push(
          createElement('div', 'gender-group', [
            createElement('h4', 'gender-label', 'Female'),
            createElement('div', 'voice-list', genderGroups.Female.map(voice => this.renderVoiceItem(voice)))
          ])
        );
      }

      // Render Male voices
      if (genderGroups.Male && genderGroups.Male.length > 0) {
        genderGroups_content.push(
          createElement('div', 'gender-group', [
            createElement('h4', 'gender-label', 'Male'),
            createElement('div', 'voice-list', genderGroups.Male.map(voice => this.renderVoiceItem(voice)))
          ])
        );
      }

      children.push(createElement('div', 'language-content', genderGroups_content));
    }

    return createElement('div', { className: 'language-section', 'data-language': language }, children);
  }

  /**
   * Render a single voice item
   * @param {Object} voice - { id, name, gender, language, description, sample_url }
   * @returns {HTMLElement} DOM element
   */
  renderVoiceItem(voice) {
    const isSelected = voice.id === this.selectedVoiceId;
    const state = this.playbackStates[voice.id] || 'idle';

    let playButtonContent = '▶';
    let playButtonClass = 'btn-play';
    const playButtonAttrs = { type: 'button', className: playButtonClass, 'data-voice-id': voice.id };

    if (state === 'loading') {
      playButtonContent = '⋯';
      playButtonClass += ' loading';
      playButtonAttrs.disabled = true;
    } else if (state === 'playing') {
      playButtonContent = '❚❚';
      playButtonClass += ' playing';
    } else if (state === 'paused') {
      playButtonContent = '▶';
      playButtonClass += ' paused';
    }
    playButtonAttrs.className = playButtonClass;

    const selectButtonClass = isSelected ? 'btn-select selected' : 'btn-select';
    const selectButtonText = isSelected ? 'Selected' : 'Select';
    const selectButtonAttrs = { type: 'button', className: selectButtonClass, 'data-voice-id': voice.id };
    if (isSelected) {
      selectButtonAttrs.disabled = true;
    }

    const voiceInfoChildren = [createElement('span', 'voice-name', voice.name)];
    if (voice.description) {
      voiceInfoChildren.push(createElement('span', 'voice-description', voice.description));
    }

    return createElement('div', { className: `voice-item ${isSelected ? 'selected' : ''}`, 'data-voice-id': voice.id }, [
      createElement('div', 'voice-info', voiceInfoChildren),
      createElement('div', 'voice-actions', [
        createElement('button', playButtonAttrs, playButtonContent),
        createElement('button', selectButtonAttrs, selectButtonText)
      ])
    ]);
  }

  /**
   * Attach event listeners after rendering
   */
  attachEventListeners() {
    // Close button
    const closeBtn = this.container.querySelector('#voice-selector-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.collapse());
    }

    // Language section toggles
    const toggleBtns = this.container.querySelectorAll('.language-toggle');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const language = e.currentTarget.dataset.language;
        this.toggleLanguageSection(language);
      });
    });

    // Play buttons
    const playBtns = this.container.querySelectorAll('.btn-play');
    playBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const voiceId = e.currentTarget.dataset.voiceId;
        this.handlePlayClick(voiceId);
      });
    });

    // Select buttons
    const selectBtns = this.container.querySelectorAll('.btn-select:not(.selected)');
    selectBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const voiceId = e.currentTarget.dataset.voiceId;
        this.handleSelectClick(voiceId);
      });
    });
  }

  /**
   * Toggle language section collapsed state
   * @param {string} language
   */
  toggleLanguageSection(language) {
    this.collapsedSections[language] = !this.collapsedSections[language];
    this.renderExpandedView();
  }

  /**
   * Handle play button click
   * @param {string} voiceId
   */
  async handlePlayClick(voiceId) {
    // Check if this voice is currently playing and should pause
    if (this.audioPreview.isPlaying(voiceId)) {
      this.audioPreview.pause();
      return;
    }

    // Check if THIS specific voice is paused and should resume
    if (this.audioPreview.isPaused(voiceId)) {
      await this.audioPreview.resume();
      return;
    }

    // Start new playback - fetch audio with authentication via TTSService
    try {
      const audioBlob = await ttsService.fetchVoiceSample(voiceId);
      await this.audioPreview.play(voiceId, audioBlob);
    } catch (error) {
      console.error('[VoiceSelector] Failed to fetch voice sample:', error);
      this.playbackStates[voiceId] = 'error';
      this.statusMessage.show('Failed to load voice sample', 'error');
      this.updateVoiceItemUI(voiceId);
    }
  }

  /**
   * Handle select button click
   * @param {string} voiceId
   */
  async handleSelectClick(voiceId) {
    const voice = this.voices.find(v => v.id === voiceId);
    if (!voice) return;

    try {
      // Save to storage
      await SettingsStore.setSelectedVoice(voice.id, voice.name);

      // Update local state
      this.selectedVoiceId = voice.id;
      this.selectedVoiceName = voice.name;

      // Show success message
      this.statusMessage.show(`Voice changed to ${voice.name}`, 'success');

      // Collapse view
      setTimeout(() => this.collapse(), 500);
    } catch (error) {
      console.error('[VoiceSelector] Failed to save voice:', error);
      this.statusMessage.show('Failed to save voice selection', 'error');
    }
  }

  /**
   * Handle playback state changes from AudioPreview
   * @param {string} voiceId
   * @param {string} state - 'loading'|'playing'|'paused'|'stopped'|'error'
   * @param {string} error - Error message if state is 'error'
   */
  handlePlaybackStateChange(voiceId, state, error) {
    this.playbackStates[voiceId] = state;

    if (state === 'error') {
      this.statusMessage.show(`Audio error: ${error}`, 'error');
    }

    // Update UI for this voice
    this.updateVoiceItemUI(voiceId);
  }

  /**
   * Update UI for a specific voice item
   * @param {string} voiceId
   */
  updateVoiceItemUI(voiceId) {
    const voiceItem = this.container.querySelector(`.voice-item[data-voice-id="${voiceId}"]`);
    if (!voiceItem) return;

    const playBtn = voiceItem.querySelector('.btn-play');
    if (!playBtn) return;

    const state = this.playbackStates[voiceId];

    // Reset classes
    playBtn.classList.remove('loading', 'playing', 'paused');
    playBtn.disabled = false;

    // Update based on state
    switch (state) {
      case 'loading':
        playBtn.textContent = '⋯';
        playBtn.classList.add('loading');
        playBtn.disabled = true;
        break;
      case 'playing':
        playBtn.textContent = '❚❚';
        playBtn.classList.add('playing');
        break;
      case 'paused':
        playBtn.textContent = '▶';
        playBtn.classList.add('paused');
        break;
      case 'stopped':
      case 'idle':
      case 'error':
      default:
        playBtn.textContent = '▶';
        break;
    }
  }

  /**
   * Collapse to summary view
   */
  collapse() {
    this.audioPreview.stop();
    this.renderCollapsedView();
    this.setupExpandButton();
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.audioPreview.cleanup();
  }
}
