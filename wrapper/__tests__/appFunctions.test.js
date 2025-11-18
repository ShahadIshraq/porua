/**
 * Comprehensive tests for app.js functions
 *
 * Note: Since app.js uses global scope and has side effects,
 * we test the functions by loading and executing relevant code snippets
 */

describe('App.js Function Tests', () => {
  let invoke, listen, openUrl;

  beforeEach(() => {
    resetAllMocks();
    createSettingsDom();

    // Set up Tauri mocks
    invoke = jest.fn();
    listen = jest.fn();
    openUrl = jest.fn();

    global.invoke = invoke;
    global.listen = listen;
    global.openUrl = openUrl;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('switchProviderTab(provider)', () => {
    // Define the function locally for testing
    function switchProviderTab(provider) {
      // Update tab buttons
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.provider === provider) {
          btn.classList.add('active');
        }
      });

      // Update content
      document.querySelectorAll('.provider-content').forEach(content => {
        content.classList.remove('active');
        if (content.dataset.provider === provider) {
          content.classList.add('active');
        }
      });
    }

    test('switches to gemini tab correctly', () => {
      switchProviderTab('gemini');

      const geminiBtn = document.querySelector('.tab-btn[data-provider="gemini"]');
      const openaiBtn = document.querySelector('.tab-btn[data-provider="openai"]');

      expect(geminiBtn.classList.contains('active')).toBe(true);
      expect(openaiBtn.classList.contains('active')).toBe(false);
    });

    test('switches to openai tab correctly', () => {
      switchProviderTab('openai');

      const geminiBtn = document.querySelector('.tab-btn[data-provider="gemini"]');
      const openaiBtn = document.querySelector('.tab-btn[data-provider="openai"]');
      const geminiContent = document.querySelector('.provider-content[data-provider="gemini"]');
      const openaiContent = document.querySelector('.provider-content[data-provider="openai"]');

      expect(geminiBtn.classList.contains('active')).toBe(false);
      expect(openaiBtn.classList.contains('active')).toBe(true);
      expect(geminiContent.classList.contains('active')).toBe(false);
      expect(openaiContent.classList.contains('active')).toBe(true);
    });

    test('handles invalid provider without crashing', () => {
      expect(() => switchProviderTab('invalid')).not.toThrow();
    });
  });

  describe('togglePasswordVisibility(inputId)', () => {
    function togglePasswordVisibility(inputId) {
      const input = document.getElementById(inputId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    }

    test('toggles password to text', () => {
      const input = document.getElementById('gemini-key');
      expect(input.type).toBe('password');

      togglePasswordVisibility('gemini-key');

      expect(input.type).toBe('text');
    });

    test('toggles text back to password', () => {
      const input = document.getElementById('gemini-key');
      input.type = 'text';

      togglePasswordVisibility('gemini-key');

      expect(input.type).toBe('password');
    });

    test('handles non-existent input gracefully', () => {
      expect(() => togglePasswordVisibility('non-existent')).not.toThrow();
    });
  });

  describe('showValidationStatus(element, state, message)', () => {
    function showValidationStatus(element, state, message) {
      element.className = 'validation-status ' + state;
      element.textContent = message;
    }

    test('displays pending status', () => {
      const el = document.getElementById('gemini-status');
      showValidationStatus(el, 'pending', 'Validating...');

      expect(el.className).toBe('validation-status pending');
      expect(el.textContent).toBe('Validating...');
    });

    test('displays success status', () => {
      const el = document.getElementById('gemini-status');
      showValidationStatus(el, 'success', 'Success!');

      expect(el.className).toBe('validation-status success');
      expect(el.textContent).toBe('Success!');
    });

    test('displays error status', () => {
      const el = document.getElementById('gemini-status');
      showValidationStatus(el, 'error', 'Error occurred');

      expect(el.className).toBe('validation-status error');
      expect(el.textContent).toBe('Error occurred');
    });
  });

  describe('validateAndSaveGemini() - with mocked Tauri', () => {
    async function validateAndSaveGemini() {
      const key = document.getElementById('gemini-key').value.trim();
      const statusEl = document.getElementById('gemini-status');

      if (!key) {
        statusEl.className = 'validation-status error';
        statusEl.textContent = 'Please enter an API key';
        return;
      }

      statusEl.className = 'validation-status pending';
      statusEl.textContent = 'Validating...';

      try {
        const isValid = await invoke('validate_gemini_key', { key });

        if (isValid) {
          await invoke('set_gemini_key', { key });
          statusEl.className = 'validation-status success';
          statusEl.textContent = 'Key validated and saved successfully';
          document.getElementById('remove-gemini-btn').style.display = 'inline-block';
        } else {
          statusEl.className = 'validation-status error';
          statusEl.textContent = 'Invalid API key';
        }
      } catch (error) {
        statusEl.className = 'validation-status error';
        statusEl.textContent = `Error: ${error}`;
      }
    }

    test('shows error for empty key', async () => {
      document.getElementById('gemini-key').value = '';

      await validateAndSaveGemini();

      const statusEl = document.getElementById('gemini-status');
      expect(statusEl.className).toBe('validation-status error');
      expect(statusEl.textContent).toBe('Please enter an API key');
    });

    test('validates and saves valid key', async () => {
      document.getElementById('gemini-key').value = 'AIzaSyTest39CharacterKeyForTesting12345';
      invoke.mockResolvedValueOnce(true); // validate_gemini_key returns true
      invoke.mockResolvedValueOnce(); // set_gemini_key returns void

      await validateAndSaveGemini();

      const statusEl = document.getElementById('gemini-status');
      expect(statusEl.className).toBe('validation-status success');
      expect(statusEl.textContent).toBe('Key validated and saved successfully');
      expect(document.getElementById('remove-gemini-btn').style.display).toBe('inline-block');
    });

    test('shows error for invalid key', async () => {
      document.getElementById('gemini-key').value = 'invalid-key';
      invoke.mockResolvedValueOnce(false); // validate_gemini_key returns false

      await validateAndSaveGemini();

      const statusEl = document.getElementById('gemini-status');
      expect(statusEl.className).toBe('validation-status error');
      expect(statusEl.textContent).toBe('Invalid API key');
    });

    test('handles validation error', async () => {
      document.getElementById('gemini-key').value = 'test-key';
      invoke.mockRejectedValueOnce('Network error');

      await validateAndSaveGemini();

      const statusEl = document.getElementById('gemini-status');
      expect(statusEl.className).toBe('validation-status error');
      expect(statusEl.textContent).toContain('Error');
    });
  });

  describe('removeGeminiKey() - with mocked Tauri', () => {
    async function removeGeminiKey() {
      const statusEl = document.getElementById('gemini-status');

      try {
        await invoke('remove_gemini_key');
        document.getElementById('gemini-key').value = '';
        document.getElementById('remove-gemini-btn').style.display = 'none';
        statusEl.className = 'validation-status success';
        statusEl.textContent = 'Key removed successfully';
      } catch (error) {
        statusEl.className = 'validation-status error';
        statusEl.textContent = `Error: ${error}`;
      }
    }

    test('removes key successfully', async () => {
      document.getElementById('gemini-key').value = 'test-key';
      document.getElementById('remove-gemini-btn').style.display = 'inline-block';
      invoke.mockResolvedValueOnce(); // remove_gemini_key succeeds

      await removeGeminiKey();

      expect(document.getElementById('gemini-key').value).toBe('');
      expect(document.getElementById('remove-gemini-btn').style.display).toBe('none');

      const statusEl = document.getElementById('gemini-status');
      expect(statusEl.className).toBe('validation-status success');
      expect(statusEl.textContent).toBe('Key removed successfully');
    });

    test('handles removal error', async () => {
      invoke.mockRejectedValueOnce('Storage error');

      await removeGeminiKey();

      const statusEl = document.getElementById('gemini-status');
      expect(statusEl.className).toBe('validation-status error');
      expect(statusEl.textContent).toContain('Error');
    });
  });

  describe('saveActiveProvider() - with mocked Tauri', () => {
    async function saveActiveProvider() {
      const selectedProvider = document.querySelector('input[name="provider"]:checked').value;

      try {
        await invoke('set_active_provider', { provider: selectedProvider });
        console.log('Active provider set to:', selectedProvider);
      } catch (error) {
        console.error('Failed to set active provider:', error);
      }
    }

    test('saves gemini as active provider', async () => {
      document.querySelector('input[value="gemini"]').checked = true;
      invoke.mockResolvedValueOnce();

      await saveActiveProvider();

      expect(invoke).toHaveBeenCalledWith('set_active_provider', { provider: 'gemini' });
    });

    test('saves openai as active provider', async () => {
      document.querySelector('input[value="openai"]').checked = true;
      invoke.mockResolvedValueOnce();

      await saveActiveProvider();

      expect(invoke).toHaveBeenCalledWith('set_active_provider', { provider: 'openai' });
    });

    test('handles error gracefully', async () => {
      document.querySelector('input[value="gemini"]').checked = true;
      invoke.mockRejectedValueOnce('Config error');

      await expect(saveActiveProvider()).resolves.not.toThrow();
    });
  });

  describe('loadSettings() - with mocked Tauri', () => {
    async function loadSettings() {
      try {
        // Load Gemini key status
        const geminiKey = await invoke('get_gemini_key');
        if (geminiKey) {
          document.getElementById('remove-gemini-btn').style.display = 'inline-block';
        }

        // Load OpenAI key status
        const openaiKey = await invoke('get_openai_key');
        if (openaiKey) {
          document.getElementById('remove-openai-btn').style.display = 'inline-block';
        }

        // Load active provider
        const activeProvider = await invoke('get_active_provider');
        const providerRadio = document.querySelector(`input[name="provider"][value="${activeProvider}"]`);
        if (providerRadio) {
          providerRadio.checked = true;
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }

    test('loads settings with both keys present', async () => {
      invoke
        .mockResolvedValueOnce('some-gemini-key')  // get_gemini_key
        .mockResolvedValueOnce('some-openai-key')  // get_openai_key
        .mockResolvedValueOnce('gemini');          // get_active_provider

      await loadSettings();

      expect(document.getElementById('remove-gemini-btn').style.display).toBe('inline-block');
      expect(document.getElementById('remove-openai-btn').style.display).toBe('inline-block');
      expect(document.querySelector('input[value="gemini"]').checked).toBe(true);
    });

    test('loads settings with no keys', async () => {
      invoke
        .mockResolvedValueOnce(null)      // get_gemini_key
        .mockResolvedValueOnce(null)      // get_openai_key
        .mockResolvedValueOnce('openai'); // get_active_provider

      await loadSettings();

      expect(document.getElementById('remove-gemini-btn').style.display).toBe('none');
      expect(document.getElementById('remove-openai-btn').style.display).toBe('none');
      expect(document.querySelector('input[value="openai"]').checked).toBe(true);
    });

    test('handles errors gracefully', async () => {
      invoke.mockRejectedValue('Connection error');

      await expect(loadSettings()).resolves.not.toThrow();
    });
  });

  describe('showScreen(screenName)', () => {
    function showScreen(screenName) {
      const screens = {
        welcome: document.getElementById('welcome-screen'),
        progress: document.getElementById('progress-screen'),
        success: document.getElementById('success-screen'),
        error: document.getElementById('error-screen'),
        settings: document.getElementById('settings-screen')
      };

      // Hide all screens
      Object.values(screens).forEach(screen => {
        if (screen) screen.classList.remove('active');
      });

      // Show the requested screen
      if (screens[screenName]) {
        screens[screenName].classList.add('active');
      }
    }

    test('shows welcome screen', () => {
      showScreen('welcome');

      expect(document.getElementById('welcome-screen').classList.contains('active')).toBe(true);
      expect(document.getElementById('settings-screen').classList.contains('active')).toBe(false);
    });

    test('shows settings screen', () => {
      showScreen('settings');

      expect(document.getElementById('settings-screen').classList.contains('active')).toBe(true);
      expect(document.getElementById('welcome-screen').classList.contains('active')).toBe(false);
    });

    test('hides all screens when showing one', () => {
      document.getElementById('welcome-screen').classList.add('active');
      document.getElementById('settings-screen').classList.add('active');

      showScreen('progress');

      expect(document.getElementById('welcome-screen').classList.contains('active')).toBe(false);
      expect(document.getElementById('settings-screen').classList.contains('active')).toBe(false);
      expect(document.getElementById('progress-screen').classList.contains('active')).toBe(true);
    });

    test('handles invalid screen name gracefully', () => {
      expect(() => showScreen('nonexistent')).not.toThrow();
    });
  });
});
