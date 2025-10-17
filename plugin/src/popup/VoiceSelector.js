import { ttsService } from '../shared/services/TTSService.js';
import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { AudioPreview } from './AudioPreview.js';

/**
 * Voice selector component with audio preview
 * Organizes voices by language and gender with collapsible sections
 */
export class VoiceSelector {
  constructor(containerElement, statusMessage) {
    this.container = containerElement;
    this.statusMessage = statusMessage;
    this.audioPreview = new AudioPreview();

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

    // Bind audio preview callback
    this.audioPreview.onPlayStateChange = (voiceId, state, error) => {
      this.handlePlaybackStateChange(voiceId, state, error);
    };
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
    this.container.innerHTML = `
      <div class="voice-selector-collapsed">
        <div class="current-voice">
          <label>Selected Voice</label>
          <div class="current-voice-display">
            <span class="voice-name">${this.selectedVoiceName}</span>
            <button type="button" class="btn-expand" id="voice-selector-expand">
              Change Voice
            </button>
          </div>
        </div>
      </div>
    `;
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
    this.container.innerHTML = `
      <div class="voice-selector-loading">
        <div class="loading-spinner"></div>
        <p>Loading voices...</p>
      </div>
    `;
  }

  /**
   * Render error view
   */
  renderErrorView() {
    this.container.innerHTML = `
      <div class="voice-selector-error">
        <p class="error-message">Failed to load voices: ${this.error}</p>
        <button type="button" class="btn-retry" id="voice-selector-retry">Retry</button>
        <button type="button" class="btn-cancel" id="voice-selector-cancel">Cancel</button>
      </div>
    `;

    const retryBtn = this.container.querySelector('#voice-selector-retry');
    const cancelBtn = this.container.querySelector('#voice-selector-cancel');

    if (retryBtn) retryBtn.addEventListener('click', () => this.expand());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.renderCollapsedView());
  }

  /**
   * Render full expanded view with voice list
   */
  renderExpandedView() {
    const groupedVoices = this.groupVoicesByLanguageAndGender();

    let html = '<div class="voice-selector-expanded">';
    html += '<div class="voice-selector-header">';
    html += '<h3>Select Voice</h3>';
    html += '<button type="button" class="btn-close" id="voice-selector-close">✕</button>';
    html += '</div>';
    html += '<div class="voice-sections">';

    // Render each language section
    for (const [language, genderGroups] of Object.entries(groupedVoices)) {
      html += this.renderLanguageSection(language, genderGroups);
    }

    html += '</div>';
    html += '</div>';

    this.container.innerHTML = html;
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
   * @returns {string} HTML string
   */
  renderLanguageSection(language, genderGroups) {
    const isCollapsed = this.collapsedSections[language];
    const toggleIcon = isCollapsed ? '▶' : '▼';

    let html = `<div class="language-section" data-language="${language}">`;
    html += `<div class="language-header">`;
    html += `<button type="button" class="language-toggle" data-language="${language}">`;
    html += `<span class="toggle-icon">${toggleIcon}</span>`;
    html += `<span class="language-name">${language}</span>`;
    html += `</button>`;
    html += `</div>`;

    if (!isCollapsed) {
      html += `<div class="language-content">`;

      // Render Female voices
      if (genderGroups.Female && genderGroups.Female.length > 0) {
        html += `<div class="gender-group">`;
        html += `<h4 class="gender-label">Female</h4>`;
        html += `<div class="voice-list">`;
        genderGroups.Female.forEach(voice => {
          html += this.renderVoiceItem(voice);
        });
        html += `</div>`;
        html += `</div>`;
      }

      // Render Male voices
      if (genderGroups.Male && genderGroups.Male.length > 0) {
        html += `<div class="gender-group">`;
        html += `<h4 class="gender-label">Male</h4>`;
        html += `<div class="voice-list">`;
        genderGroups.Male.forEach(voice => {
          html += this.renderVoiceItem(voice);
        });
        html += `</div>`;
        html += `</div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Render a single voice item
   * @param {Object} voice - { id, name, gender, language, description, sample_url }
   * @returns {string} HTML string
   */
  renderVoiceItem(voice) {
    const isSelected = voice.id === this.selectedVoiceId;
    const state = this.playbackStates[voice.id] || 'idle';

    let playButtonContent = '▶';
    let playButtonClass = 'btn-play';
    let playButtonDisabled = '';

    if (state === 'loading') {
      playButtonContent = '⋯';
      playButtonClass += ' loading';
      playButtonDisabled = 'disabled';
    } else if (state === 'playing') {
      playButtonContent = '■';
      playButtonClass += ' playing';
    }

    const selectButtonClass = isSelected ? 'btn-select selected' : 'btn-select';
    const selectButtonText = isSelected ? 'Selected' : 'Select';
    const selectButtonDisabled = isSelected ? 'disabled' : '';

    let html = `<div class="voice-item ${isSelected ? 'selected' : ''}" data-voice-id="${voice.id}">`;
    html += `<div class="voice-info">`;
    html += `<span class="voice-name">${voice.name}</span>`;
    if (voice.description) {
      html += `<span class="voice-description">${voice.description}</span>`;
    }
    html += `</div>`;
    html += `<div class="voice-actions">`;
    html += `<button type="button" class="${playButtonClass}" data-voice-id="${voice.id}" ${playButtonDisabled}>`;
    html += playButtonContent;
    html += `</button>`;
    html += `<button type="button" class="${selectButtonClass}" data-voice-id="${voice.id}" ${selectButtonDisabled}>`;
    html += selectButtonText;
    html += `</button>`;
    html += `</div>`;
    html += `</div>`;

    return html;
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
    const currentState = this.playbackStates[voiceId];

    if (currentState === 'playing') {
      // Stop playback
      this.audioPreview.stop();
    } else {
      // Start playback - fetch audio with authentication via TTSService
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
   * @param {string} state - 'loading'|'playing'|'stopped'|'error'
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
    playBtn.classList.remove('loading', 'playing');
    playBtn.disabled = false;

    // Update based on state
    switch (state) {
      case 'loading':
        playBtn.textContent = '⋯';
        playBtn.classList.add('loading');
        playBtn.disabled = true;
        break;
      case 'playing':
        playBtn.textContent = '■';
        playBtn.classList.add('playing');
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
