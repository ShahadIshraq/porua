import { Encryption } from '../crypto/encryption.js';
import { DEFAULT_SETTINGS } from '../utils/constants.js';

export class SettingsStore {
  static async get() {
    const syncData = await chrome.storage.sync.get({
      apiUrl: DEFAULT_SETTINGS.apiUrl,
      selectedVoiceId: DEFAULT_SETTINGS.selectedVoiceId,
      selectedVoiceName: DEFAULT_SETTINGS.selectedVoiceName
    });

    const localData = await chrome.storage.local.get({
      encryptedApiKey: ''
    });

    let apiKey = '';
    if (localData.encryptedApiKey) {
      apiKey = await Encryption.decrypt(localData.encryptedApiKey);
    }

    return {
      apiUrl: syncData.apiUrl,
      apiKey,
      selectedVoiceId: syncData.selectedVoiceId,
      selectedVoiceName: syncData.selectedVoiceName
    };
  }

  static async set({ apiUrl, apiKey, selectedVoiceId, selectedVoiceName }) {
    // Build sync data object dynamically
    const syncData = {};
    if (apiUrl !== undefined) syncData.apiUrl = apiUrl;
    if (selectedVoiceId !== undefined) syncData.selectedVoiceId = selectedVoiceId;
    if (selectedVoiceName !== undefined) syncData.selectedVoiceName = selectedVoiceName;

    if (Object.keys(syncData).length > 0) {
      await chrome.storage.sync.set(syncData);
    }

    if (apiKey !== undefined) {
      const encryptedApiKey = apiKey ? await Encryption.encrypt(apiKey) : '';
      await chrome.storage.local.set({ encryptedApiKey });
    }
  }

  static async getApiUrl() {
    const data = await chrome.storage.sync.get({
      apiUrl: DEFAULT_SETTINGS.apiUrl
    });
    return data.apiUrl;
  }

  static async getApiKey() {
    const data = await chrome.storage.local.get({ encryptedApiKey: '' });
    if (data.encryptedApiKey) {
      return await Encryption.decrypt(data.encryptedApiKey);
    }
    return '';
  }

  static async getSelectedVoice() {
    const data = await chrome.storage.sync.get({
      selectedVoiceId: DEFAULT_SETTINGS.selectedVoiceId,
      selectedVoiceName: DEFAULT_SETTINGS.selectedVoiceName
    });
    return {
      id: data.selectedVoiceId,
      name: data.selectedVoiceName
    };
  }

  static async setSelectedVoice(voiceId, voiceName) {
    await chrome.storage.sync.set({
      selectedVoiceId: voiceId,
      selectedVoiceName: voiceName
    });
  }
}
