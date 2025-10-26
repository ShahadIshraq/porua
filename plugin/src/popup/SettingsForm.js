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
    this.connectionIcon = formElement.querySelector('.connection-icon');
    this.connectionStatus = formElement.querySelector('#connection-status');
    this.toggleButton = formElement.querySelector('#toggle-visibility');
    this.changeButton = formElement.querySelector('#change-key');
    this.saveButton = formElement.querySelector('button[type="submit"]');
    this.resetButton = formElement.querySelector('#reset-changes');
    this.firstUseHelp = formElement.querySelector('#first-use-help');

    this.isApiKeyModified = false;
    this.hasStoredKey = false;
    this.connectionTestPassed = false;

    // Advanced settings visibility
    this.showAdvancedSettings = false;
    this.advancedSettingsSection = formElement.querySelector('#advanced-settings-section');
    this.cacheStatsWrapper = document.querySelector('#cache-stats-container');

    // Dirty state tracking
    this.originalValues = {
      apiUrl: '',
      speed: 1.0
    };
    this.isDirty = false;
    this.dirtyFields = new Set();

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

    // Setup combined callback for shared AudioPreview
    this.setupSharedAudioPreviewCallback();
  }

  /**
   * Setup combined callback handler for shared AudioPreview
   * Both VoiceSelector and SpeedControl need to respond to state changes
   */
  setupSharedAudioPreviewCallback() {
    this.audioPreview.onPlayStateChange = (id, state, error) => {
      // Let VoiceSelector handle its voice samples
      if (this.voiceSelector && id !== this.speedControl.TEST_ID) {
        this.voiceSelector.handlePlaybackStateChange(id, state, error);
      }

      // Let SpeedControl handle its test samples
      if (this.speedControl && id === this.speedControl.TEST_ID) {
        this.speedControl.handleAudioPreviewStateChange(id, state, error);
      }
    };
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    await this.voiceSelector.init();

    // Set initial UI state (disabled save button)
    this.isDirty = false;
    this.updateDirtyUI();
  }

  setupEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.testButton.addEventListener('click', () => this.testConnection());
    this.toggleButton.addEventListener('click', () => this.togglePasswordVisibility());
    this.changeButton.addEventListener('click', () => this.handleChangeKey());
    this.resetButton.addEventListener('click', () => this.handleReset());
    this.apiKeyInput.addEventListener('input', () => this.handleApiKeyInput());

    // Track API URL changes
    this.apiUrlInput.addEventListener('input', () => this.checkDirty());

    // Track speed changes
    this.speedControl.onChange(() => this.checkDirty());

    // Warn on window close with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });
  }

  async loadSettings() {
    const settings = await SettingsStore.get();
    this.apiUrlInput.value = settings.apiUrl;

    // Store original values for dirty checking
    this.originalValues = {
      apiUrl: settings.apiUrl,
      speed: settings.speed
    };

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

    // Determine if advanced settings should be shown
    this.showAdvancedSettings = this.shouldShowAdvancedSettings(settings.isConfigured);
    this.updateAdvancedSettingsVisibility();

    // Show/hide first-use help text
    this.updateFirstUseHelpVisibility();

    // Initialize speed control with saved speed
    this.speedControl.init(settings.speed);
  }

  async handleSubmit(e) {
    e.preventDefault();

    const apiUrl = this.apiUrlInput.value.trim();
    const apiKey = this.apiKeyInput.value.trim();
    const speed = this.speedControl.getSpeed();

    try {
      await SettingsStore.set({ apiUrl, speed, isConfigured: true });

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

      // Update advanced settings visibility after save
      const previousState = this.showAdvancedSettings;
      this.showAdvancedSettings = this.shouldShowAdvancedSettings(true);
      if (previousState !== this.showAdvancedSettings) {
        this.updateAdvancedSettingsVisibility();
        this.updateFirstUseHelpVisibility();
      }

      // Update original values after successful save
      this.originalValues = {
        apiUrl: apiUrl,
        speed: speed
      };

      // Reset dirty state
      this.dirtyFields.clear();
      this.isDirty = false;
      this.updateDirtyUI();

      this.statusMessage.show('Settings saved successfully!', 'success');
    } catch (error) {
      this.statusMessage.show('Error saving settings: ' + error.message, 'error');
    }
  }

  async testConnection() {
    const apiUrl = this.apiUrlInput.value.trim();
    const apiKey = this.apiKeyInput.value.trim();

    if (!apiUrl) {
      this.showConnectionStatus('Please enter an API URL', 'error');
      return;
    }

    this.testButton.disabled = true;
    this.showConnectionStatus('Testing connection...', 'testing');

    // Temporarily save the current input values for testing
    const originalSettings = await SettingsStore.get();
    let settingsChanged = false;

    try {
      // Temporarily update settings with current input values
      await SettingsStore.set({
        apiUrl,
        ...(this.isApiKeyModified && apiKey ? { apiKey } : {})
      });
      settingsChanged = true;

      // Force refresh TTSService with new settings
      ttsService.reset();
      const data = await ttsService.checkHealth();

      if (data.status === 'ok') {
        this.showConnectionStatus('Connection successful', 'success');
        this.connectionTestPassed = true;
        this.updateFirstUseHelpVisibility(); // Hide help text after successful test
        this.updateDirtyUI(); // Update save button state based on connection test result
      } else {
        this.showConnectionStatus('Unexpected response from server', 'error');
        this.connectionTestPassed = false;
        this.updateFirstUseHelpVisibility(); // Update help text visibility
        this.updateDirtyUI(); // Update save button state
      }
    } catch (error) {
      this.connectionTestPassed = false;
      this.updateFirstUseHelpVisibility(); // Update help text visibility
      this.updateDirtyUI(); // Update save button state
      if (error.status === 401 || error.status === 403) {
        this.showConnectionStatus('Authentication failed', 'error');
      } else {
        this.showConnectionStatus('Connection failed: ' + error.message, 'error');
      }
    } finally {
      // Restore original settings if they were changed
      if (settingsChanged && originalSettings &&
          (originalSettings.apiUrl !== apiUrl ||
           (this.isApiKeyModified && apiKey && originalSettings.apiKey !== apiKey))) {
        await SettingsStore.set({
          apiUrl: originalSettings.apiUrl,
          apiKey: originalSettings.apiKey
        });
        ttsService.reset();
      }

      this.testButton.disabled = false;
    }
  }

  showConnectionStatus(message, type) {
    this.connectionStatus.textContent = message;
    this.connectionStatus.className = 'connection-status ' + type;

    // Reset button classes
    this.testButton.classList.remove('success', 'error', 'testing');

    // Add state class to button
    if (type === 'success') {
      this.connectionIcon.src = 'icons/connection-test-success.png';
      this.testButton.classList.add('success');
    } else if (type === 'error') {
      this.connectionIcon.src = 'icons/connection-test-fail.png';
      this.testButton.classList.add('error');
    } else if (type === 'testing') {
      this.connectionIcon.src = 'icons/connection-test-idle.png';
      this.testButton.classList.add('testing');
    } else {
      this.connectionIcon.src = 'icons/connection-test-idle.png';
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

    // Check dirty state when API key changes
    this.checkDirty();
  }

  handleChangeKey() {
    this.apiKeyInput.disabled = false;
    this.apiKeyInput.value = '';
    this.apiKeyInput.placeholder = 'Enter new API key';
    this.apiKeyInput.focus();
    this.isApiKeyModified = true;
    this.changeButton.style.display = 'none';
  }

  /**
   * Check if there are unsaved changes and update dirty state
   */
  checkDirty() {
    this.dirtyFields.clear();

    // Check API URL
    if (this.apiUrlInput.value.trim() !== this.originalValues.apiUrl) {
      this.dirtyFields.add('apiUrl');
    }

    // Check API Key (use existing flag)
    if (this.isApiKeyModified) {
      this.dirtyFields.add('apiKey');
    }

    // Check Speed
    const currentSpeed = this.speedControl.getSpeed();
    if (Math.abs(currentSpeed - this.originalValues.speed) > 0.01) {
      this.dirtyFields.add('speed');
    }

    // Update dirty state
    const wasDirty = this.isDirty;
    this.isDirty = this.dirtyFields.size > 0;

    // Update UI if state changed
    if (wasDirty !== this.isDirty) {
      this.updateDirtyUI();
    }
  }

  /**
   * Update UI based on dirty state
   */
  updateDirtyUI() {
    // On first use, enable save based solely on connection test
    if (!this.showAdvancedSettings) {
      const canSave = this.connectionTestPassed;
      this.saveButton.disabled = !canSave;
      this.saveButton.classList.remove('has-changes');
      this.saveButton.textContent = 'Save Settings';

      // No reset button on first use
      if (this.resetButton) {
        this.resetButton.hidden = true;
      }
      return;
    }

    // Normal case: require dirty state
    if (this.isDirty) {
      this.saveButton.disabled = false;
      this.saveButton.classList.add('has-changes');
      this.saveButton.innerHTML = 'Save Changes <span class="changes-indicator">●</span>';

      // Show reset button
      if (this.resetButton) {
        this.resetButton.hidden = false;
      }
    } else {
      // Disable save button and reset appearance
      this.saveButton.disabled = true;
      this.saveButton.classList.remove('has-changes');
      this.saveButton.textContent = 'Save Settings';

      // Hide reset button
      if (this.resetButton) {
        this.resetButton.hidden = true;
      }
    }
  }

  /**
   * Reset all fields to their original values
   */
  handleReset() {
    // Confirm if user really wants to discard
    const confirmed = confirm('Discard all unsaved changes?');
    if (!confirmed) return;

    // Restore original values
    this.apiUrlInput.value = this.originalValues.apiUrl;
    this.speedControl.setSpeed(this.originalValues.speed);

    // Reset API Key state
    if (this.isApiKeyModified) {
      this.isApiKeyModified = false;

      if (this.hasStoredKey) {
        // Restore masked state
        this.apiKeyInput.value = '';
        this.apiKeyInput.placeholder = '••••••••••••••••';
        this.apiKeyInput.disabled = true;
        this.toggleButton.style.display = 'none';
        this.changeButton.style.display = 'block';
      } else {
        // Restore empty state
        this.apiKeyInput.value = '';
        this.apiKeyInput.placeholder = 'Enter API key if required';
      }
    }

    // Reset dirty state
    this.dirtyFields.clear();
    this.isDirty = false;
    this.updateDirtyUI();

    this.statusMessage.show('Changes discarded', 'info');
  }

  /**
   * Determine if advanced settings should be shown
   * @param {boolean} isConfigured - Whether user has saved settings before
   * @returns {boolean}
   */
  shouldShowAdvancedSettings(isConfigured) {
    return isConfigured;
  }

  /**
   * Update visibility of advanced settings sections
   */
  updateAdvancedSettingsVisibility() {
    const hidden = !this.showAdvancedSettings;

    if (this.advancedSettingsSection) {
      if (hidden) {
        this.advancedSettingsSection.classList.add('hidden');
      } else {
        this.advancedSettingsSection.classList.remove('hidden');
      }
    }

    if (this.cacheStatsWrapper) {
      if (hidden) {
        this.cacheStatsWrapper.classList.add('hidden');
      } else {
        this.cacheStatsWrapper.classList.remove('hidden');
      }
    }
  }

  /**
   * Update visibility of first-use help text
   */
  updateFirstUseHelpVisibility() {
    if (this.firstUseHelp) {
      // Show help only when: not configured AND connection not tested
      if (!this.showAdvancedSettings && !this.connectionTestPassed) {
        this.firstUseHelp.classList.remove('hidden');
      } else {
        this.firstUseHelp.classList.add('hidden');
      }
    }
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
