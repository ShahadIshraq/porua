import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsStore } from '../../../../src/shared/storage/SettingsStore.js';
import { Encryption } from '../../../../src/shared/crypto/encryption.js';
import { DEFAULT_SETTINGS } from '../../../../src/shared/utils/constants.js';

// Mock Encryption module
vi.mock('../../../../src/shared/crypto/encryption.js', () => ({
  Encryption: {
    encrypt: vi.fn(),
    decrypt: vi.fn()
  }
}));

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset chrome storage mocks
    chrome.storage.sync.get = vi.fn();
    chrome.storage.sync.set = vi.fn();
    chrome.storage.local.get = vi.fn();
    chrome.storage.local.set = vi.fn();
  });

  describe('get', () => {
    it('should return default settings when storage is empty', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
      chrome.storage.local.get.mockResolvedValue({
        encryptedApiKey: ''
      });

      const settings = await SettingsStore.get();

      expect(settings.apiUrl).toBe(DEFAULT_SETTINGS.apiUrl);
      expect(settings.apiKey).toBe('');
    });

    it('should retrieve apiUrl from sync storage', async () => {
      const customUrl = 'http://custom-server:8080';
      chrome.storage.sync.get.mockResolvedValue({ apiUrl: customUrl });
      chrome.storage.local.get.mockResolvedValue({ encryptedApiKey: '' });

      const settings = await SettingsStore.get();

      expect(settings.apiUrl).toBe(customUrl);
    });

    it('should decrypt API key from local storage', async () => {
      const encryptedKey = 'encrypted-api-key-base64';
      const decryptedKey = 'my-secret-api-key';

      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
      chrome.storage.local.get.mockResolvedValue({
        encryptedApiKey: encryptedKey
      });
      Encryption.decrypt.mockResolvedValue(decryptedKey);

      const settings = await SettingsStore.get();

      expect(Encryption.decrypt).toHaveBeenCalledWith(encryptedKey);
      expect(settings.apiKey).toBe(decryptedKey);
    });

    it('should handle missing encryptedApiKey gracefully', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
      chrome.storage.local.get.mockResolvedValue({
        encryptedApiKey: ''
      });

      const settings = await SettingsStore.get();

      expect(Encryption.decrypt).not.toHaveBeenCalled();
      expect(settings.apiKey).toBe('');
    });

    it('should request correct default values from sync storage', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
      chrome.storage.local.get.mockResolvedValue({ encryptedApiKey: '' });

      await SettingsStore.get();

      expect(chrome.storage.sync.get).toHaveBeenCalledWith({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
    });

    it('should request correct default values from local storage', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
      chrome.storage.local.get.mockResolvedValue({ encryptedApiKey: '' });

      await SettingsStore.get();

      expect(chrome.storage.local.get).toHaveBeenCalledWith({
        encryptedApiKey: ''
      });
    });
  });

  describe('set', () => {
    it('should store apiUrl in sync storage', async () => {
      const newUrl = 'https://new-server.com:3000';
      chrome.storage.sync.set.mockResolvedValue(undefined);
      chrome.storage.local.set.mockResolvedValue(undefined);
      Encryption.encrypt.mockResolvedValue('encrypted');

      await SettingsStore.set({ apiUrl: newUrl, apiKey: '' });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        apiUrl: newUrl
      });
    });

    it('should encrypt and store API key in local storage', async () => {
      const apiKey = 'my-secret-key';
      const encryptedKey = 'encrypted-base64-string';

      chrome.storage.sync.set.mockResolvedValue(undefined);
      chrome.storage.local.set.mockResolvedValue(undefined);
      Encryption.encrypt.mockResolvedValue(encryptedKey);

      await SettingsStore.set({
        apiUrl: DEFAULT_SETTINGS.apiUrl,
        apiKey
      });

      expect(Encryption.encrypt).toHaveBeenCalledWith(apiKey);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        encryptedApiKey: encryptedKey
      });
    });

    it('should handle empty apiKey by encrypting to empty string', async () => {
      chrome.storage.sync.set.mockResolvedValue(undefined);
      chrome.storage.local.set.mockResolvedValue(undefined);
      Encryption.encrypt.mockResolvedValue('');

      await SettingsStore.set({
        apiUrl: DEFAULT_SETTINGS.apiUrl,
        apiKey: ''
      });

      // Empty string is falsy, so it gets encrypted to empty string
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        encryptedApiKey: ''
      });
    });

    it('should not store apiKey when undefined', async () => {
      chrome.storage.sync.set.mockResolvedValue(undefined);
      chrome.storage.local.set.mockResolvedValue(undefined);

      await SettingsStore.set({ apiUrl: DEFAULT_SETTINGS.apiUrl });

      expect(Encryption.encrypt).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle both apiUrl and apiKey together', async () => {
      const apiUrl = 'http://test.com';
      const apiKey = 'test-key';
      const encryptedKey = 'encrypted-test-key';

      chrome.storage.sync.set.mockResolvedValue(undefined);
      chrome.storage.local.set.mockResolvedValue(undefined);
      Encryption.encrypt.mockResolvedValue(encryptedKey);

      await SettingsStore.set({ apiUrl, apiKey });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ apiUrl });
      expect(Encryption.encrypt).toHaveBeenCalledWith(apiKey);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        encryptedApiKey: encryptedKey
      });
    });

    it('should update only apiUrl when apiKey is undefined', async () => {
      chrome.storage.sync.set.mockResolvedValue(undefined);

      await SettingsStore.set({ apiUrl: 'http://new-url.com' });

      expect(chrome.storage.sync.set).toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('getApiUrl', () => {
    it('should return apiUrl from sync storage', async () => {
      const customUrl = 'http://custom-api.com';
      chrome.storage.sync.get.mockResolvedValue({ apiUrl: customUrl });

      const url = await SettingsStore.getApiUrl();

      expect(url).toBe(customUrl);
    });

    it('should return default apiUrl when not set', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });

      const url = await SettingsStore.getApiUrl();

      expect(url).toBe(DEFAULT_SETTINGS.apiUrl);
    });

    it('should request with correct defaults', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });

      await SettingsStore.getApiUrl();

      expect(chrome.storage.sync.get).toHaveBeenCalledWith({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
    });
  });

  describe('getApiKey', () => {
    it('should decrypt and return API key from local storage', async () => {
      const encryptedKey = 'encrypted-key';
      const decryptedKey = 'decrypted-api-key';

      chrome.storage.local.get.mockResolvedValue({
        encryptedApiKey: encryptedKey
      });
      Encryption.decrypt.mockResolvedValue(decryptedKey);

      const apiKey = await SettingsStore.getApiKey();

      expect(Encryption.decrypt).toHaveBeenCalledWith(encryptedKey);
      expect(apiKey).toBe(decryptedKey);
    });

    it('should return empty string when encryptedApiKey is empty', async () => {
      chrome.storage.local.get.mockResolvedValue({ encryptedApiKey: '' });

      const apiKey = await SettingsStore.getApiKey();

      expect(Encryption.decrypt).not.toHaveBeenCalled();
      expect(apiKey).toBe('');
    });

    it('should return empty string when encryptedApiKey is not set', async () => {
      chrome.storage.local.get.mockResolvedValue({ encryptedApiKey: '' });

      const apiKey = await SettingsStore.getApiKey();

      expect(apiKey).toBe('');
    });

    it('should request with correct defaults', async () => {
      chrome.storage.local.get.mockResolvedValue({ encryptedApiKey: '' });

      await SettingsStore.getApiKey();

      expect(chrome.storage.local.get).toHaveBeenCalledWith({
        encryptedApiKey: ''
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete save and retrieve flow', async () => {
      const testUrl = 'http://test.example.com';
      const testKey = 'test-api-key-123';
      const encryptedTestKey = 'encrypted-test-key-123';

      // Mock set
      chrome.storage.sync.set.mockResolvedValue(undefined);
      chrome.storage.local.set.mockResolvedValue(undefined);
      Encryption.encrypt.mockResolvedValue(encryptedTestKey);

      await SettingsStore.set({ apiUrl: testUrl, apiKey: testKey });

      // Mock get
      chrome.storage.sync.get.mockResolvedValue({ apiUrl: testUrl });
      chrome.storage.local.get.mockResolvedValue({
        encryptedApiKey: encryptedTestKey
      });
      Encryption.decrypt.mockResolvedValue(testKey);

      const settings = await SettingsStore.get();

      expect(settings.apiUrl).toBe(testUrl);
      expect(settings.apiKey).toBe(testKey);
    });

    it('should handle clearing API key', async () => {
      // Set empty API key
      chrome.storage.sync.set.mockResolvedValue(undefined);
      chrome.storage.local.set.mockResolvedValue(undefined);
      Encryption.encrypt.mockResolvedValue('');

      await SettingsStore.set({
        apiUrl: DEFAULT_SETTINGS.apiUrl,
        apiKey: ''
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        encryptedApiKey: ''
      });

      // Get should return empty key
      chrome.storage.sync.get.mockResolvedValue({
        apiUrl: DEFAULT_SETTINGS.apiUrl
      });
      chrome.storage.local.get.mockResolvedValue({ encryptedApiKey: '' });

      const settings = await SettingsStore.get();

      expect(settings.apiKey).toBe('');
    });
  });
});
