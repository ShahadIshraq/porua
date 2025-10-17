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

describe('SettingsForm', () => {
  let settingsForm;
  let mockFormElement;
  let mockStatusMessage;
  let mockApiUrlInput;
  let mockApiKeyInput;
  let mockTestButton;
  let mockToggleButton;
  let mockChangeButton;

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
    mockTestButton.textContent = 'Test Connection';

    mockToggleButton = document.createElement('button');
    mockToggleButton.id = 'toggle-visibility';
    mockToggleButton.textContent = '👁️';

    mockChangeButton = document.createElement('button');
    mockChangeButton.id = 'change-key';

    mockFormElement = document.createElement('form');
    mockFormElement.appendChild(mockApiUrlInput);
    mockFormElement.appendChild(mockApiKeyInput);
    mockFormElement.appendChild(mockTestButton);
    mockFormElement.appendChild(mockToggleButton);
    mockFormElement.appendChild(mockChangeButton);

    // Create voice selector container
    const mockVoiceSelectorContainer = document.createElement('div');
    mockVoiceSelectorContainer.id = 'voice-selector-container';
    mockFormElement.appendChild(mockVoiceSelectorContainer);

    mockFormElement.querySelector = vi.fn((selector) => {
      switch (selector) {
        case '#api-url':
          return mockApiUrlInput;
        case '#api-key':
          return mockApiKeyInput;
        case '#test-connection':
          return mockTestButton;
        case '#toggle-visibility':
          return mockToggleButton;
        case '#change-key':
          return mockChangeButton;
        case '#voice-selector-container':
          return mockVoiceSelectorContainer;
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
  });

  describe('init', () => {
    it('should call loadSettings', async () => {
      SettingsStore.get.mockResolvedValue({ apiUrl: 'http://test.com', apiKey: '' });
      const loadSpy = vi.spyOn(settingsForm, 'loadSettings');

      settingsForm.init();

      expect(loadSpy).toHaveBeenCalled();
    });

    it('should call setupEventListeners', () => {
      SettingsStore.get.mockResolvedValue({ apiUrl: 'http://test.com', apiKey: '' });
      const setupSpy = vi.spyOn(settingsForm, 'setupEventListeners');

      settingsForm.init();

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
        apiKey: ''
      });

      await settingsForm.loadSettings();

      expect(mockApiUrlInput.value).toBe('http://example.com');
    });

    it('should handle stored API key', async () => {
      SettingsStore.get.mockResolvedValue({
        apiUrl: 'http://example.com',
        apiKey: 'stored-key-123'
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
        apiKey: ''
      });

      await settingsForm.loadSettings();

      expect(mockApiKeyInput.placeholder).toBe('Enter API key if required');
      expect(mockApiKeyInput.disabled).toBe(false);
      expect(settingsForm.hasStoredKey).toBe(false);
      expect(mockToggleButton.style.display).toBe('none');
      expect(mockChangeButton.style.display).toBe('none');
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

    it('should save API URL', async () => {
      mockApiUrlInput.value = 'http://test.com';
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledWith({ apiUrl: 'http://test.com' });
    });

    it('should trim API URL', async () => {
      mockApiUrlInput.value = '  http://test.com  ';
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledWith({ apiUrl: 'http://test.com' });
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
      SettingsStore.set.mockResolvedValue(undefined);

      await settingsForm.handleSubmit({ preventDefault: vi.fn() });

      expect(SettingsStore.set).toHaveBeenCalledTimes(1);
      expect(SettingsStore.set).toHaveBeenCalledWith({ apiUrl: 'http://test.com' });
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

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Please enter an API URL',
        'error'
      );
    });

    it('should disable test button during test', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      const testPromise = settingsForm.testConnection();

      expect(mockTestButton.disabled).toBe(true);
      expect(mockTestButton.textContent).toBe('Testing...');

      await testPromise;
    });

    it('should re-enable test button after test', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'ok' });

      await settingsForm.testConnection();

      expect(mockTestButton.disabled).toBe(false);
      expect(mockTestButton.textContent).toBe('Test Connection');
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

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Connection successful!',
        'success'
      );
    });

    it('should show error for unexpected response', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockResolvedValue({ status: 'error' });

      await settingsForm.testConnection();

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Unexpected response from server',
        'error'
      );
    });

    it('should show auth error for 401', async () => {
      mockApiUrlInput.value = 'http://test.com';
      const error = new Error('Unauthorized');
      error.status = 401;
      ttsService.checkHealth.mockRejectedValue(error);

      await settingsForm.testConnection();

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Authentication failed. Check your API key.',
        'error'
      );
    });

    it('should show auth error for 403', async () => {
      mockApiUrlInput.value = 'http://test.com';
      const error = new Error('Forbidden');
      error.status = 403;
      ttsService.checkHealth.mockRejectedValue(error);

      await settingsForm.testConnection();

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Authentication failed. Check your API key.',
        'error'
      );
    });

    it('should show connection error for other errors', async () => {
      mockApiUrlInput.value = 'http://test.com';
      ttsService.checkHealth.mockRejectedValue(new Error('Network error'));

      await settingsForm.testConnection();

      expect(mockStatusMessage.show).toHaveBeenCalledWith(
        'Connection failed: Network error',
        'error'
      );
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
});
