import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsForm } from '../../../src/popup/SettingsForm.js';
import { SettingsStore } from '../../../src/shared/storage/SettingsStore.js';
import { ttsService } from '../../../src/shared/services/TTSService.js';

// Mock dependencies
vi.mock('../../../src/shared/storage/SettingsStore.js');
vi.mock('../../../src/shared/services/TTSService.js', () => ({
  ttsService: {
    checkHealth: vi.fn(),
    reset: vi.fn()
  }
}));

// Create a mock SpeedControl class
const mockSpeedControlInstance = {
  init: vi.fn(),
  getSpeed: vi.fn(() => 1.0),
  setSpeed: vi.fn(),
  onChange: vi.fn(),
  cleanup: vi.fn()
};

vi.mock('../../../src/popup/SpeedControl.js', () => ({
  SpeedControl: vi.fn(() => mockSpeedControlInstance)
}));
vi.mock('../../../src/popup/AudioPreview.js', () => ({
  AudioPreview: vi.fn(() => ({
    cleanup: vi.fn(),
    onPlayStateChange: null
  }))
}));

describe('SettingsForm', () => {
  let settingsForm;
  let mockFormElement;
  let mockStatusMessage;
  let mockApiUrlInput;
  let mockApiKeyInput;
  let mockTestButton;
  let mockToggleButton;
  let mockChangeButton;
  let mockSaveButton;
  let mockResetButton;
  let mockConnectionStatus;
  let mockConnectionIcon;
  let mockFirstUseHelp;

  beforeEach(() => {
    // Create mock form elements
    mockApiUrlInput = document.createElement('input');
    mockApiUrlInput.id = 'api-url';

    mockApiKeyInput = document.createElement('input');
    mockApiKeyInput.id = 'api-key';
    mockApiKeyInput.type = 'password';
    mockApiKeyInput.focus = vi.fn();

    mockTestButton = document.createElement('button');
    mockTestButton.id = 'test-connection';

    mockConnectionIcon = document.createElement('img');
    mockConnectionIcon.className = 'connection-icon';
    mockConnectionIcon.src = 'icons/connection-test-idle.png';
    mockTestButton.appendChild(mockConnectionIcon);

    mockConnectionStatus = document.createElement('div');
    mockConnectionStatus.id = 'connection-status';
    mockConnectionStatus.className = 'connection-status hidden';

    mockToggleButton = document.createElement('button');
    mockToggleButton.id = 'toggle-visibility';
    mockToggleButton.textContent = '👁️';

    mockChangeButton = document.createElement('button');
    mockChangeButton.id = 'change-key';

    mockSaveButton = document.createElement('button');
    mockSaveButton.type = 'submit';
    mockSaveButton.textContent = 'Save Settings';

    mockResetButton = document.createElement('button');
    mockResetButton.id = 'reset-changes';
    mockResetButton.hidden = true;

    mockFirstUseHelp = document.createElement('small');
    mockFirstUseHelp.id = 'first-use-help';
    mockFirstUseHelp.classList.add('first-use-help', 'hidden');

    mockFormElement = document.createElement('form');
    mockFormElement.appendChild(mockApiUrlInput);
    mockFormElement.appendChild(mockApiKeyInput);
    mockFormElement.appendChild(mockTestButton);
    mockFormElement.appendChild(mockConnectionStatus);
    mockFormElement.appendChild(mockToggleButton);
    mockFormElement.appendChild(mockChangeButton);
    mockFormElement.appendChild(mockSaveButton);
    mockFormElement.appendChild(mockResetButton);
    mockFormElement.appendChild(mockFirstUseHelp);

    // Create voice selector container
    const mockVoiceSelectorContainer = document.createElement('div');
    mockVoiceSelectorContainer.id = 'voice-selector-container';
    mockFormElement.appendChild(mockVoiceSelectorContainer);

    // Create speed control container
    const mockSpeedControlContainer = document.createElement('div');
    mockSpeedControlContainer.id = 'speed-control-container';
    mockFormElement.appendChild(mockSpeedControlContainer);

    // Create advanced settings section
    const mockAdvancedSettingsSection = document.createElement('div');
    mockAdvancedSettingsSection.id = 'advanced-settings-section';
    mockFormElement.appendChild(mockAdvancedSettingsSection);

    // Create cache stats wrapper (in document, not in form)
    const mockCacheStatsWrapper = document.createElement('div');
    mockCacheStatsWrapper.id = 'cache-stats-container';
    mockCacheStatsWrapper.classList.add('cache-stats-wrapper');
    document.body.appendChild(mockCacheStatsWrapper);

    mockFormElement.querySelector = vi.fn((selector) => {
      switch (selector) {
        case '#api-url':
          return mockApiUrlInput;
        case '#api-key':
          return mockApiKeyInput;
        case '#test-connection':
          return mockTestButton;
        case '.connection-icon':
          return mockConnectionIcon;
        case '#connection-status':
          return mockConnectionStatus;
        case '#toggle-visibility':
          return mockToggleButton;
        case '#change-key':
          return mockChangeButton;
        case 'button[type="submit"]':
          return mockSaveButton;
        case '#reset-changes':
          return mockResetButton;
        case '#voice-selector-container':
          return mockVoiceSelectorContainer;
        case '#speed-control-container':
          return mockSpeedControlContainer;
        case '#advanced-settings-section':
          return mockAdvancedSettingsSection;
        case '#first-use-help':
          return mockFirstUseHelp;
        default:
          return null;
      }
    });

    mockFormElement.addEventListener = vi.fn((event, handler) => {
      if (event === 'submit') {
        mockFormElement._submitHandler = handler;
      }
    });

    mockStatusMessage = {
      show: vi.fn()
    };

    // Reset mocks
    SettingsStore.get = vi.fn();
    SettingsStore.set = vi.fn();
    SettingsStore.getApiKey = vi.fn();
    SettingsStore.getSelectedVoice = vi.fn().mockResolvedValue({ id: 'bf_lily', name: 'Lily' });

    // Reset mock implementations
    mockSpeedControlInstance.init.mockClear();
    mockSpeedControlInstance.getSpeed.mockClear().mockReturnValue(1.0);
    mockSpeedControlInstance.setSpeed.mockClear();
    mockSpeedControlInstance.onChange.mockClear();
    mockSpeedControlInstance.cleanup.mockClear();

    // Create the SettingsForm instance
    settingsForm = new SettingsForm(mockFormElement, mockStatusMessage);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should store form and statusMessage references', () => {
      expect(settingsForm.form).toBe(mockFormElement);
      expect(settingsForm.statusMessage).toBe(mockStatusMessage);
    });

    it('should find and store input elements', () => {
      expect(settingsForm.apiUrlInput).toBe(mockApiUrlInput);
      expect(settingsForm.apiKeyInput).toBe(mockApiKeyInput);
      expect(settingsForm.testButton).toBe(mockTestButton);
      expect(settingsForm.toggleButton).toBe(mockToggleButton);
      expect(settingsForm.changeButton).toBe(mockChangeButton);
    });

    it('should initialize flags', () => {
      expect(settingsForm.isApiKeyModified).toBe(false);
      expect(settingsForm.hasStoredKey).toBe(false);
    });

    it('should initialize advanced settings visibility state', () => {
      expect(settingsForm.showAdvancedSettings).toBe(false);
      expect(settingsForm.advancedSettingsSection).toBeTruthy();
      expect(settingsForm.cacheStatsWrapper).toBeTruthy();
    });

    it('should initialize connection test state', () => {
      expect(settingsForm.connectionTestPassed).toBe(false);
      expect(settingsForm.firstUseHelp).toBeTruthy();
    });
  });

  describe('init', () => {
    it('should call loadSettings', async () => {
      SettingsStore.get.mockResolvedValue({ apiUrl: 'http://test.com', apiKey: '' });
      const loadSpy = vi.spyOn(settingsForm, 'loadSettings');

      settingsForm.init();

      expect(loadSpy).toHaveBeenCalled();
    });

    it('should call setupEventListeners', async () => {
      SettingsStore.get.mockResolvedValue({ apiUrl: 'http://test.com', apiKey: '', speed: 1.0 });
      const setupSpy = vi.spyOn(settingsForm, 'setupEventListeners');

      await settingsForm.init();

      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('setupEventListeners', () => {
    it('should add submit listener', () => {
      settingsForm.setupEventListeners();

      expect(mockFormElement.addEventListener).toHaveBeenCalledWith(
        'submit',
        expect.any(Function)
      );
    });

    it('should add test button listener', () => {
      mockTestButton.addEventListener = vi.fn();

      settingsForm.setupEventListeners();

      expect(mockTestButton.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should add toggle button listener', () => {
      mockToggleButton.addEventListener = vi.fn();

      settingsForm.setupEventListeners();

      expect(mockToggleButton.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should add change button listener', () => {
      mockChangeButton.addEventListener = vi.fn();

      settingsForm.setupEventListeners();

      expect(mockChangeButton.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should add api key input listener', () => {
      mockApiKeyInput.addEventListener = vi.fn();

      settingsForm.setupEventListeners();

      expect(mockApiKeyInput.addEventListener).toHaveBeenCalledWith(
        'input',
        expect.any(Function)
      );
    });
  });

  describe('loadSettings', () => {
    it('should load and populate API URL', async () => {
      SettingsStore.get.mockResolvedValue({
        apiUrl: 'http://example.com',
        apiKey: '',
        speed: 1.0
      });

      await settingsForm.loadSettings();

      expect(mockApiUrlInput.value).toBe('http://example.com');
    });

    it('should handle stored API key', async () => {
      SettingsStore.get.mockResolvedValue({
        apiUrl: 'http://example.com',
        apiKey: 'stored-key-123',
        speed: 1.0
      });

      await settingsForm.loadSettings();

      expect(mockApiKeyInput.value).toBe('');
      expect(mockApiKeyInput.placeholder).toBe('••••••••••••••••');
      expect(mockApiKeyInput.disabled).toBe(true);
      expect(settingsForm.hasStoredKey).toBe(true);
      expect(mockToggleButton.style.display).toBe('none');
      expect(mockChangeButton.style.display).toBe('block');
    });

    it('should handle no stored API key', async () => {
      SettingsStore.get.mockResolvedValue({
        apiUrl: 'http://example.com',
        apiKey: '',
        speed: 1.0
      });

      await settingsForm.loadSettings();

      expect(mockApiKeyInput.placeholder).toBe('Enter API key if required');
      expect(mockApiKeyInput.disabled).toBe(false);
      expect(settingsForm.hasStoredKey).toBe(false);
      expect(mockToggleButton.style.display).toBe('none');
      expect(mockChangeButton.style.display).toBe('none');
    });

    it('should initialize speed control with saved speed', async () => {
      SettingsStore.get.mockResolvedValue({
        apiUrl: 'http://example.com',
        apiKey: '',
        speed: 1.5,
        isConfigured: false
      });

      await settingsForm.loadSettings();

      expect(settingsForm.speedControl.init).toHaveBeenCalledWith(1.5);
    });

    it('should check visibility when isConfigured is false', async () => {
      SettingsStore.get.mockResolvedValue({
        apiUrl: 'http://example.com',
        apiKey: '',
        speed: 1.0,
        isConfigured: false
      });

      const shouldShowSpy = vi.spyOn(settingsForm, 'shouldShowAdvancedSettings');
      const updateVisibilitySpy = vi.spyOn(settingsForm, 'updateAdvancedSettingsVisibility');

      await settingsForm.loadSettings();

      expect(shouldShowSpy).toHaveBeenCalledWith(false);
      expect(settingsForm.showAdvancedSettings).toBe(false);
      expect(updateVisibilitySpy).toHaveBeenCalled();
    });

    it('should check visibility when isConfigured is true', async () => {
      SettingsStore.get.mockResolvedValue({
        apiUrl: 'http://example.com',
        apiKey: '',
        speed: 1.0,
        isConfigured: true
      });

      const shouldShowSpy = vi.spyOn(settingsForm, 'shouldShowAdvancedSettings');
      const updateVisibilitySpy = vi.spyOn(settingsForm, 'updateAdvancedSettingsVisibility');

      await settingsForm.loadSettings();

      expect(shouldShowSpy).toHaveBeenCalledWith(true);
      expect(settingsForm.showAdvancedSettings).toBe(true);
      expect(updateVisibilitySpy).toHaveBeenCalled();
    });
  });

  describe('handleSubmit', () => {
    it('should prevent default form submission', async () => {
      mockApiUrlInput.value = 'http://test.com';
      SettingsStore.set.mockResolvedValue(undefined);

      const event = { preventDefault: vi.fn() };

      await settingsForm.handleSubmit(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should save API URL and speed with isConfigured flag', async () => {
      mockApiUrlInput.value = 'http://test.com';
      settingsForm.speedControl.getSpeed.mockReturnValue(1.25);
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledWith({
        apiUrl: 'http://test.com',
        speed: 1.25,
        isConfigured: true
      });
    });

    it('should trim API URL', async () => {
      mockApiUrlInput.value = '  http://test.com  ';
      settingsForm.speedControl.getSpeed.mockReturnValue(1.0);
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledWith({
        apiUrl: 'http://test.com',
        speed: 1.0,
        isConfigured: true
      });
    });

    it('should save API key if modified', async () => {
      mockApiUrlInput.value = 'http://test.com';
      mockApiKeyInput.value = 'new-key';
      settingsForm.isApiKeyModified = true;
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledWith({ apiKey: 'new-key' });
    });

    it('should save API key if not empty', async () => {
      mockApiUrlInput.value = 'http://test.com';
      mockApiKeyInput.value = 'new-key';
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledWith({ apiKey: 'new-key' });
    });

    it('should not save empty API key if not modified', async () => {
      mockApiUrlInput.value = 'http://test.com';
      mockApiKeyInput.value = '';
      settingsForm.isApiKeyModified = false;
      settingsForm.speedControl.getSpeed.mockReturnValue(1.0);
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledTimes(1);
      expect(SettingsStore.set).toHaveBeenCalledWith({
        apiUrl: 'http://test.com',
        speed: 1.0,
        isConfigured: true
      });
    });

    it('should update UI after saving key', async () => {
      mockApiUrlInput.value = 'http://test.com';
      mockApiKeyInput.value = 'new-key';
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(mockApiKeyInput.value).toBe('');
      expect(mockApiKeyInput.placeholder).toBe('••••••••••••••••');
      expect(mockApiKeyInput.disabled).toBe(true);
      expect(settingsForm.isApiKeyModified).toBe(false);
      expect(settingsForm.hasStoredKey).toBe(true);
    });

    it('should show success message', async () => {
      mockApiUrlInput.value = 'http://test.com';
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Settings saved successfully!',
        'success'
      );
    });

    it('should show error message on failure', async () => {
      mockApiUrlInput.value = 'http://test.com';
      SettingsStore.set.mockRejectedValue(new Error('Save failed'));

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Error saving settings: Save failed',
        'error'
      );
    });
  });

  describe('testConnection', () => {
    it('should validate API URL', async () => {
      mockApiUrlInput.value = '';

      await settingsForm.testConnection();

      expect(mockConnectionStatus.textContent).toBe('Please enter an API URL');
      expect(mockConnectionStatus.className).toContain('error');
    });

    it('should disable test button during test', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      const testPromise = settingsForm.testConnection();

      expect(mockTestButton.disabled).toBe(true);
      expect(mockConnectionStatus.textContent).toBe('Testing connection...');
      expect(mockConnectionStatus.className).toContain('testing');

      await testPromise;
    });

    it('should re-enable test button after test', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      await settingsForm.testConnection();

      expect(mockTestButton.disabled).toBe(false);
    });

    it('should reset ttsService before testing', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      await settingsForm.testConnection();

      expect(ttsService.reset).toHaveBeenCalled();
    });

    it('should call ttsService checkHealth', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      await settingsForm.testConnection();

      expect(ttsService.checkHealth).toHaveBeenCalled();
    });

    it('should show success message on successful connection', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      await settingsForm.testConnection();

      expect(mockConnectionStatus.textContent).toBe('Connection successful');
      expect(mockConnectionStatus.className).toContain('success');
      expect(mockConnectionIcon.src).toContain('connection-test-success.png');
    });

    it('should set connectionTestPassed to true on successful connection', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });
      settingsForm.connectionTestPassed = false;

      await settingsForm.testConnection();

      expect(settingsForm.connectionTestPassed).toBe(true);
    });

    it('should set connectionTestPassed to false on failed connection', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockRejectedValue(new Error('Connection failed'));
      settingsForm.connectionTestPassed = true;

      await settingsForm.testConnection();

      expect(settingsForm.connectionTestPassed).toBe(false);
    });

    it('should call updateFirstUseHelpVisibility on successful connection', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });
      const updateHelpSpy = vi.spyOn(settingsForm, 'updateFirstUseHelpVisibility');

      await settingsForm.testConnection();

      expect(updateHelpSpy).toHaveBeenCalled();
    });

    it('should call updateFirstUseHelpVisibility on failed connection', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockRejectedValue(new Error('Connection failed'));
      const updateHelpSpy = vi.spyOn(settingsForm, 'updateFirstUseHelpVisibility');

      await settingsForm.testConnection();

      expect(updateHelpSpy).toHaveBeenCalled();
    });

    it('should call updateDirtyUI on successful connection', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });
      const updateDirtyUISpy = vi.spyOn(settingsForm, 'updateDirtyUI');

      await settingsForm.testConnection();

      expect(updateDirtyUISpy).toHaveBeenCalled();
    });

    it('should call updateDirtyUI on failed connection', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockRejectedValue(new Error('Connection failed'));
      const updateDirtyUISpy = vi.spyOn(settingsForm, 'updateDirtyUI');

      await settingsForm.testConnection();

      expect(updateDirtyUISpy).toHaveBeenCalled();
    });

    it('should call updateDirtyUI on unexpected response', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'error' });
      const updateDirtyUISpy = vi.spyOn(settingsForm, 'updateDirtyUI');

      await settingsForm.testConnection();

      expect(updateDirtyUISpy).toHaveBeenCalled();
    });

    it('should enable save button after successful connection test on first use', async () => {
      // Setup: first use scenario
      mockApiUrlInput.value = 'http://test.com';
      settingsForm.showAdvancedSettings = false;
      settingsForm.connectionTestPassed = false;
      mockSaveButton.disabled = true;
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      await settingsForm.testConnection();

      expect(settingsForm.connectionTestPassed).toBe(true);
      expect(mockSaveButton.disabled).toBe(false);
    });

    it('should keep save button disabled after failed connection test on first use', async () => {
      // Setup: first use scenario
      mockApiUrlInput.value = 'http://test.com';
      settingsForm.showAdvancedSettings = false;
      settingsForm.connectionTestPassed = false;
      mockSaveButton.disabled = true;
      ttsService.checkHealth.mockRejectedValue(new Error('Connection failed'));

      await settingsForm.testConnection();

      expect(settingsForm.connectionTestPassed).toBe(false);
      expect(mockSaveButton.disabled).toBe(true);
    });

    it('should show error for unexpected response', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'error' });

      await settingsForm.testConnection();

      expect(mockConnectionStatus.textContent).toBe('Unexpected response from server');
      expect(mockConnectionStatus.className).toContain('error');
      expect(mockConnectionIcon.src).toContain('connection-test-fail.png');
    });

    it('should show auth error for 401', async () => {
      mockApiUrlInput.value = 'http://test.com';
      const error = new Error('Unauthorized');
      error.status = 401;
      ttsService.checkHealth.mockRejectedValue(error);

      await settingsForm.testConnection();

      expect(mockConnectionStatus.textContent).toBe('Authentication failed');
      expect(mockConnectionStatus.className).toContain('error');
      expect(mockConnectionIcon.src).toContain('connection-test-fail.png');
    });

    it('should show auth error for 403', async () => {
      mockApiUrlInput.value = 'http://test.com';
      const error = new Error('Forbidden');
      error.status = 403;
      ttsService.checkHealth.mockRejectedValue(error);

      await settingsForm.testConnection();

      expect(mockConnectionStatus.textContent).toBe('Authentication failed');
      expect(mockConnectionStatus.className).toContain('error');
      expect(mockConnectionIcon.src).toContain('connection-test-fail.png');
    });

    it('should show connection error for other errors', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockRejectedValue(new Error('Network error'));

      await settingsForm.testConnection();

      expect(mockConnectionStatus.textContent).toBe('Connection failed: Network error');
      expect(mockConnectionStatus.className).toContain('error');
      expect(mockConnectionIcon.src).toContain('connection-test-fail.png');
    });
  });

  describe('togglePasswordVisibility', () => {
    it('should change password to text', () => {
      mockApiKeyInput.type = 'password';

      settingsForm.togglePasswordVisibility();

      expect(mockApiKeyInput.type).toBe('text');
      expect(mockToggleButton.textContent).toBe('🙈');
    });

    it('should change text to password', () => {
      mockApiKeyInput.type = 'text';

      settingsForm.togglePasswordVisibility();

      expect(mockApiKeyInput.type).toBe('password');
      expect(mockToggleButton.textContent).toBe('👁️');
    });

    it('should toggle back and forth', () => {
      mockApiKeyInput.type = 'password';

      settingsForm.togglePasswordVisibility();
      expect(mockApiKeyInput.type).toBe('text');

      settingsForm.togglePasswordVisibility();
      expect(mockApiKeyInput.type).toBe('password');
    });
  });

  describe('handleApiKeyInput', () => {
    it('should set modified flag', () => {
      settingsForm.handleApiKeyInput();

      expect(settingsForm.isApiKeyModified).toBe(true);
    });

    it('should show toggle button when input has value', () => {
      mockApiKeyInput.value = 'some-key';

      settingsForm.handleApiKeyInput();

      expect(mockToggleButton.style.display).toBe('block');
      expect(mockChangeButton.style.display).toBe('none');
    });

    it('should hide toggle button when input empty', () => {
      mockApiKeyInput.value = '';

      settingsForm.handleApiKeyInput();

      expect(mockToggleButton.style.display).toBe('none');
    });

    it('should show change button when empty and has stored key', () => {
      mockApiKeyInput.value = '';
      settingsForm.hasStoredKey = true;

      settingsForm.handleApiKeyInput();

      expect(mockChangeButton.style.display).toBe('block');
    });

    it('should not show change button when empty and no stored key', () => {
      mockApiKeyInput.value = '';
      settingsForm.hasStoredKey = false;

      settingsForm.handleApiKeyInput();

      expect(mockChangeButton.style.display).not.toBe('block');
    });
  });

  describe('handleChangeKey', () => {
    it('should enable input', () => {
      mockApiKeyInput.disabled = true;

      settingsForm.handleChangeKey();

      expect(mockApiKeyInput.disabled).toBe(false);
    });

    it('should clear input value', () => {
      mockApiKeyInput.value = '••••••••';

      settingsForm.handleChangeKey();

      expect(mockApiKeyInput.value).toBe('');
    });

    it('should update placeholder', () => {
      settingsForm.handleChangeKey();

      expect(mockApiKeyInput.placeholder).toBe('Enter new API key');
    });

    it('should focus input', () => {
      settingsForm.handleChangeKey();

      expect(mockApiKeyInput.focus).toHaveBeenCalled();
    });

    it('should set modified flag', () => {
      settingsForm.handleChangeKey();

      expect(settingsForm.isApiKeyModified).toBe(true);
    });

    it('should hide change button', () => {
      settingsForm.handleChangeKey();

      expect(mockChangeButton.style.display).toBe('none');
    });
  });

  describe('shouldShowAdvancedSettings', () => {
    it('should return false when isConfigured is false', () => {
      expect(settingsForm.shouldShowAdvancedSettings(false)).toBe(false);
    });

    it('should return true when isConfigured is true', () => {
      expect(settingsForm.shouldShowAdvancedSettings(true)).toBe(true);
    });
  });

  describe('updateAdvancedSettingsVisibility', () => {
    it('should add hidden class when showAdvancedSettings is false', () => {
      settingsForm.showAdvancedSettings = false;

      settingsForm.updateAdvancedSettingsVisibility();

      expect(settingsForm.advancedSettingsSection.classList.contains('hidden')).toBe(true);
      expect(settingsForm.cacheStatsWrapper.classList.contains('hidden')).toBe(true);
    });

    it('should remove hidden class when showAdvancedSettings is true', () => {
      settingsForm.showAdvancedSettings = true;
      // Add hidden class first
      settingsForm.advancedSettingsSection.classList.add('hidden');
      settingsForm.cacheStatsWrapper.classList.add('hidden');

      settingsForm.updateAdvancedSettingsVisibility();

      expect(settingsForm.advancedSettingsSection.classList.contains('hidden')).toBe(false);
      expect(settingsForm.cacheStatsWrapper.classList.contains('hidden')).toBe(false);
    });

    it('should handle missing advancedSettingsSection gracefully', () => {
      settingsForm.advancedSettingsSection = null;
      settingsForm.showAdvancedSettings = false;

      expect(() => settingsForm.updateAdvancedSettingsVisibility()).not.toThrow();
    });

    it('should handle missing cacheStatsWrapper gracefully', () => {
      settingsForm.cacheStatsWrapper = null;
      settingsForm.showAdvancedSettings = false;

      expect(() => settingsForm.updateAdvancedSettingsVisibility()).not.toThrow();
    });
  });

  describe('handleSubmit - visibility updates', () => {
    it('should update visibility when settings become configured', async () => {
      mockApiUrlInput.value = 'http://test.com';
      settingsForm.speedControl.getSpeed.mockReturnValue(1.0);
      settingsForm.showAdvancedSettings = false;
      SettingsStore.set.mockResolvedValue(undefined);

      const updateVisibilitySpy = vi.spyOn(settingsForm, 'updateAdvancedSettingsVisibility');

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(settingsForm.showAdvancedSettings).toBe(true);
      expect(updateVisibilitySpy).toHaveBeenCalled();
    });

    it('should not update visibility if already configured', async () => {
      mockApiUrlInput.value = 'http://test.com';
      settingsForm.speedControl.getSpeed.mockReturnValue(1.0);
      settingsForm.showAdvancedSettings = true;
      SettingsStore.set.mockResolvedValue(undefined);

      const updateVisibilitySpy = vi.spyOn(settingsForm, 'updateAdvancedSettingsVisibility');

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(settingsForm.showAdvancedSettings).toBe(true);
      expect(updateVisibilitySpy).not.toHaveBeenCalled();
    });
  });

  describe('updateFirstUseHelpVisibility', () => {
    it('should show help text when not configured and connection not tested', () => {
      settingsForm.showAdvancedSettings = false;
      settingsForm.connectionTestPassed = false;
      mockFirstUseHelp.classList.add('hidden');

      settingsForm.updateFirstUseHelpVisibility();

      expect(mockFirstUseHelp.classList.contains('hidden')).toBe(false);
    });

    it('should hide help text when connection tested (even if not configured)', () => {
      settingsForm.showAdvancedSettings = false;
      settingsForm.connectionTestPassed = true;
      mockFirstUseHelp.classList.remove('hidden');

      settingsForm.updateFirstUseHelpVisibility();

      expect(mockFirstUseHelp.classList.contains('hidden')).toBe(true);
    });

    it('should hide help text when configured', () => {
      settingsForm.showAdvancedSettings = true;
      settingsForm.connectionTestPassed = false;
      mockFirstUseHelp.classList.remove('hidden');

      settingsForm.updateFirstUseHelpVisibility();

      expect(mockFirstUseHelp.classList.contains('hidden')).toBe(true);
    });

    it('should handle missing firstUseHelp gracefully', () => {
      settingsForm.firstUseHelp = null;
      settingsForm.showAdvancedSettings = false;

      expect(() => settingsForm.updateFirstUseHelpVisibility()).not.toThrow();
    });
  });

  describe('updateDirtyUI - connection test requirement', () => {
    it('should disable save button when not configured and connection not tested', () => {
      settingsForm.showAdvancedSettings = false;
      settingsForm.connectionTestPassed = false;

      settingsForm.updateDirtyUI();

      expect(mockSaveButton.disabled).toBe(true);
    });

    it('should enable save button when not configured but connection tested (regardless of dirty state)', () => {
      settingsForm.isDirty = false; // Not dirty
      settingsForm.showAdvancedSettings = false;
      settingsForm.connectionTestPassed = true;

      settingsForm.updateDirtyUI();

      expect(mockSaveButton.disabled).toBe(false);
    });

    it('should enable save button when configured and dirty', () => {
      settingsForm.isDirty = true;
      settingsForm.showAdvancedSettings = true;
      settingsForm.connectionTestPassed = false;

      settingsForm.updateDirtyUI();

      expect(mockSaveButton.disabled).toBe(false);
    });

    it('should disable save button when configured but not dirty', () => {
      settingsForm.isDirty = false;
      settingsForm.showAdvancedSettings = true;
      settingsForm.connectionTestPassed = true;

      settingsForm.updateDirtyUI();

      expect(mockSaveButton.disabled).toBe(true);
    });

    it('should not show changes indicator on first use', () => {
      settingsForm.showAdvancedSettings = false;
      settingsForm.connectionTestPassed = true;

      settingsForm.updateDirtyUI();

      expect(mockSaveButton.classList.contains('has-changes')).toBe(false);
      expect(mockSaveButton.textContent).toBe('Save Settings');
    });

    it('should show changes indicator when configured and dirty', () => {
      settingsForm.isDirty = true;
      settingsForm.showAdvancedSettings = true;

      settingsForm.updateDirtyUI();

      expect(mockSaveButton.classList.contains('has-changes')).toBe(true);
      expect(mockSaveButton.innerHTML).toContain('Save Changes');
      expect(mockSaveButton.innerHTML).toContain('changes-indicator');
    });
  });
});
