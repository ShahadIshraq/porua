import { Encryption } from '../crypto/encryption.js';
import { DEFAULT_SETTINGS } from '../utils/constants.js';

export class SettingsStore {
  static async get() {
    const syncData = await chrome.storage.sync.get({
      apiUrl: DEFAULT_SETTINGS.apiUrl
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
      apiKey
    };
  }

  static async set({ apiUrl, apiKey }) {
    await chrome.storage.sync.set({ apiUrl });

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
}
