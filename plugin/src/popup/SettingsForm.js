import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { ttsService } from '../shared/services/TTSService.js';
import { VoiceSelector } from './VoiceSelector.js';
import { SpeedControl } from './SpeedControl.js';
import { AudioPreview } from './AudioPreview.js';

export class SettingsForm {
  constructor(formElement, statusMessage) {
    this.form = formElement;
    this.statusMessage = statusMessage;
    this.apiUrlInput = formElement.querySelector('#api-url');
    this.apiKeyInput = formElement.querySelector('#api-key');
    this.testButton = formElement.querySelector('#test-connection');
    this.toggleButton = formElement.querySelector('#toggle-visibility');
    this.changeButton = formElement.querySelector('#change-key');

    this.isApiKeyModified = false;
    this.hasStoredKey = false;

    // Initialize shared AudioPreview for both VoiceSelector and SpeedControl
    this.audioPreview = new AudioPreview();

    // Initialize VoiceSelector with shared AudioPreview
    const voiceSelectorContainer = formElement.querySelector('#voice-selector-container');
    this.voiceSelector = new VoiceSelector(voiceSelectorContainer, statusMessage, this.audioPreview);

    // Initialize SpeedControl with dependencies for test functionality
    const speedControlContainer = formElement.querySelector('#speed-control-container');
    this.speedControl = new SpeedControl(speedControlContainer, {
      audioPreview: this.audioPreview,
      ttsService: ttsService,
      settingsStore: SettingsStore,
      statusMessage: statusMessage
    });
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    await this.voiceSelector.init();
  }

  setupEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.testButton.addEventListener('click', () => this.testConnection());
    this.toggleButton.addEventListener('click', () => this.togglePasswordVisibility());
    this.changeButton.addEventListener('click', () => this.handleChangeKey());
    this.apiKeyInput.addEventListener('input', () => this.handleApiKeyInput());
  }

  async loadSettings() {
    const settings = await SettingsStore.get();
    this.apiUrlInput.value = settings.apiUrl;

    if (settings.apiKey) {
      this.apiKeyInput.value = '';
      this.apiKeyInput.placeholder = '••••••••••••••••';
      this.apiKeyInput.disabled = true;
      this.hasStoredKey = true;
      this.toggleButton.style.display = 'none';
      this.changeButton.style.display = 'block';
    } else {
      this.apiKeyInput.placeholder = 'Enter API key if required';
      this.apiKeyInput.disabled = false;
      this.hasStoredKey = false;
      this.toggleButton.style.display = 'none';
      this.changeButton.style.display = 'none';
    }

    // Initialize speed control with saved speed
    this.speedControl.init(settings.speed);
  }

  async handleSubmit(e) {
    e.preventDefault();

    const apiUrl = this.apiUrlInput.value.trim();
    const apiKey = this.apiKeyInput.value.trim();
    const speed = this.speedControl.getSpeed();

    try {
      await SettingsStore.set({ apiUrl, speed });

      if (this.isApiKeyModified || apiKey) {
        await SettingsStore.set({ apiKey });

        this.apiKeyInput.value = '';
        this.apiKeyInput.placeholder = '••••••••••••••••';
        this.apiKeyInput.disabled = true;
        this.isApiKeyModified = false;
        this.hasStoredKey = true;
        this.toggleButton.style.display = 'none';
        this.changeButton.style.display = 'block';
      }

      this.statusMessage.show('Settings saved successfully!', 'success');
    } catch (error) {
      this.statusMessage.show('Error saving settings: ' + error.message, 'error');
    }
  }

  async testConnection() {
    const apiUrl = this.apiUrlInput.value.trim();

    if (!apiUrl) {
      this.statusMessage.show('Please enter an API URL', 'error');
      return;
    }

    this.testButton.disabled = true;
    this.testButton.textContent = 'Testing...';

    try {
      // Force refresh TTSService with potential new settings
      ttsService.reset();
      const data = await ttsService.checkHealth();

      if (data.status === 'ok') {
        this.statusMessage.show('Connection successful!', 'success');
      } else {
        this.statusMessage.show('Unexpected response from server', 'error');
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        this.statusMessage.show('Authentication failed. Check your API key.', 'error');
      } else {
        this.statusMessage.show('Connection failed: ' + error.message, 'error');
      }
    } finally {
      this.testButton.disabled = false;
      this.testButton.textContent = 'Test Connection';
    }
  }

  togglePasswordVisibility() {
    if (this.apiKeyInput.type === 'password') {
      this.apiKeyInput.type = 'text';
      this.toggleButton.textContent = '🙈';
    } else {
      this.apiKeyInput.type = 'password';
      this.toggleButton.textContent = '👁️';
    }
  }

  handleApiKeyInput() {
    this.isApiKeyModified = true;

    if (this.apiKeyInput.value.length > 0) {
      this.toggleButton.style.display = 'block';
      this.changeButton.style.display = 'none';
    } else {
      this.toggleButton.style.display = 'none';
      if (this.hasStoredKey) {
        this.changeButton.style.display = 'block';
      }
    }
  }

  handleChangeKey() {
    this.apiKeyInput.disabled = false;
    this.apiKeyInput.value = '';
    this.apiKeyInput.placeholder = 'Enter new API key';
    this.apiKeyInput.focus();
    this.isApiKeyModified = true;
    this.changeButton.style.display = 'none';
  }

  cleanup() {
    if (this.voiceSelector) {
      this.voiceSelector.cleanup();
    }
    if (this.speedControl) {
      this.speedControl.cleanup();
    }
    if (this.audioPreview) {
      this.audioPreview.cleanup();
    }
  }
}
