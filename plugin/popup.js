// TTS Reader Popup Script
// Handles settings UI and storage

(function() {
  'use strict';

  const form = document.getElementById('settings-form');
  const apiUrlInput = document.getElementById('api-url');
  const apiKeyInput = document.getElementById('api-key');
  const testConnectionBtn = document.getElementById('test-connection');
  const toggleVisibilityBtn = document.getElementById('toggle-visibility');
  const changeKeyBtn = document.getElementById('change-key');
  const statusMessage = document.getElementById('status-message');

  let isApiKeyModified = false;
  let hasStoredKey = false;

  // Default settings
  const DEFAULT_SETTINGS = {
    apiUrl: 'http://localhost:3000',
    apiKey: ''
  };

  // Show status message
  function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');

    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 3000);
  }

  // Load settings from chrome.storage
  async function loadSettings() {
    // Load API URL from sync storage (can sync across devices)
    chrome.storage.sync.get({ apiUrl: DEFAULT_SETTINGS.apiUrl }, (syncSettings) => {
      apiUrlInput.value = syncSettings.apiUrl || DEFAULT_SETTINGS.apiUrl;
    });

    // Load encrypted API Key from local storage
    chrome.storage.local.get({ encryptedApiKey: '' }, async (localSettings) => {
      if (localSettings.encryptedApiKey) {
        try {
          // Don't decrypt - just show placeholder
          apiKeyInput.value = '';
          apiKeyInput.placeholder = '••••••••••••••••';
          apiKeyInput.disabled = true;
          isApiKeyModified = false;
          hasStoredKey = true;
          // Show change button, hide toggle button
          toggleVisibilityBtn.style.display = 'none';
          changeKeyBtn.style.display = 'block';
        } catch (error) {
          apiKeyInput.placeholder = 'Enter API key if required';
          apiKeyInput.disabled = false;
          hasStoredKey = false;
          toggleVisibilityBtn.style.display = 'none';
          changeKeyBtn.style.display = 'none';
        }
      } else {
        apiKeyInput.placeholder = 'Enter API key if required';
        apiKeyInput.disabled = false;
        hasStoredKey = false;
        toggleVisibilityBtn.style.display = 'none';
        changeKeyBtn.style.display = 'none';
      }
    });
  }

  // Save settings to chrome.storage
  async function saveSettings(e) {
    e.preventDefault();

    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    // Save API URL to sync storage
    chrome.storage.sync.set({ apiUrl }, async () => {
      if (chrome.runtime.lastError) {
        showStatus('Error saving API URL: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      // Only save API key if it was modified
      if (isApiKeyModified || apiKey) {
        try {
          let encryptedApiKey = '';
          if (apiKey) {
            // Encrypt the API key before storage
            encryptedApiKey = await window.CryptoUtils.encryptString(apiKey);
          }

          // Save encrypted API Key to local storage
          chrome.storage.local.set({ encryptedApiKey }, () => {
            if (chrome.runtime.lastError) {
              showStatus('Error saving API Key: ' + chrome.runtime.lastError.message, 'error');
            } else {
              showStatus('Settings saved successfully!', 'success');
              // Clear the input and show placeholder
              apiKeyInput.value = '';
              apiKeyInput.placeholder = '••••••••••••••••';
              apiKeyInput.disabled = true;
              isApiKeyModified = false;
              hasStoredKey = true;
              // Show change button, hide toggle button
              toggleVisibilityBtn.style.display = 'none';
              changeKeyBtn.style.display = 'block';
            }
          });
        } catch (error) {
          showStatus('Error encrypting API key: ' + error.message, 'error');
        }
      } else {
        showStatus('Settings saved successfully!', 'success');
      }
    });
  }

  // Test connection to TTS server
  async function testConnection() {
    const apiUrl = apiUrlInput.value.trim();
    let apiKey = apiKeyInput.value.trim();

    if (!apiUrl) {
      showStatus('Please enter an API URL', 'error');
      return;
    }

    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = 'Testing...';

    try {
      // If API key input is empty, try to load from storage
      if (!apiKey) {
        const stored = await new Promise(resolve => {
          chrome.storage.local.get({ encryptedApiKey: '' }, resolve);
        });

        if (stored.encryptedApiKey) {
          apiKey = await window.CryptoUtils.decryptString(stored.encryptedApiKey);
        }
      }

      const headers = {};

      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        headers: headers
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          showStatus('Connection successful!', 'success');
        } else {
          showStatus('Unexpected response from server', 'error');
        }
      } else if (response.status === 401 || response.status === 403) {
        showStatus('Authentication failed. Check your API key.', 'error');
      } else {
        showStatus(`Connection failed with status: ${response.status}`, 'error');
      }
    } catch (error) {
      showStatus('Connection failed: ' + error.message, 'error');
    } finally {
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = 'Test Connection';
    }
  }

  // Toggle password visibility
  function togglePasswordVisibility() {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleVisibilityBtn.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      toggleVisibilityBtn.textContent = '👁️';
    }
  }

  // Track when API key is modified
  function onApiKeyInput() {
    isApiKeyModified = true;
    // Show toggle button when user starts typing
    if (apiKeyInput.value.length > 0) {
      toggleVisibilityBtn.style.display = 'block';
      changeKeyBtn.style.display = 'none';
    } else {
      toggleVisibilityBtn.style.display = 'none';
      if (hasStoredKey) {
        changeKeyBtn.style.display = 'block';
      }
    }
  }

  // Handle change key button click
  function handleChangeKey() {
    // Enable input for editing
    apiKeyInput.disabled = false;
    apiKeyInput.value = '';
    apiKeyInput.placeholder = 'Enter new API key';
    apiKeyInput.focus();
    isApiKeyModified = true;

    // Hide change button
    changeKeyBtn.style.display = 'none';
  }

  // Event listeners
  form.addEventListener('submit', saveSettings);
  testConnectionBtn.addEventListener('click', testConnection);
  toggleVisibilityBtn.addEventListener('click', togglePasswordVisibility);
  changeKeyBtn.addEventListener('click', handleChangeKey);
  apiKeyInput.addEventListener('input', onApiKeyInput);

  // Load settings on popup open
  loadSettings();
})();
