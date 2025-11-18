// Tauri API access
let invoke;
try {
    if (window.__TAURI__) {
        invoke = window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke);
        if (!invoke) {
            throw new Error('Tauri invoke API not properly initialized');
        }
    } else {
        throw new Error('Tauri API not found');
    }
} catch (error) {
    console.error('Failed to load Tauri API:', error);
}

// State management
const state = {
    geminiConfigured: false,
    openaiConfigured: false,
    activeProvider: null,
    editingProvider: null
};

// Rate limiting configuration
const VALIDATION_COOLDOWN_MS = 2000; // 2 second cooldown between validation attempts
const lastValidationAttempt = {
    gemini: 0,
    openai: 0
};

// DOM Elements
const elements = {
    gemini: {
        radioLabel: document.getElementById('gemini-radio-label'),
        radio: document.getElementById('provider-gemini'),
        status: document.getElementById('gemini-status'),
        card: document.getElementById('gemini-card'),
        badge: document.getElementById('gemini-badge'),
        keyDisplay: document.getElementById('gemini-key-display'),
        maskedKey: document.getElementById('gemini-masked-key'),
        inputGroup: document.getElementById('gemini-input-group'),
        input: document.getElementById('gemini-key-input'),
        validation: document.getElementById('gemini-validation'),
        editBtn: document.getElementById('gemini-edit-btn'),
        saveBtn: document.getElementById('gemini-save-btn'),
        cancelBtn: document.getElementById('gemini-cancel-btn'),
        removeBtn: document.getElementById('gemini-remove-btn')
    },
    openai: {
        radioLabel: document.getElementById('openai-radio-label'),
        radio: document.getElementById('provider-openai'),
        status: document.getElementById('openai-status'),
        card: document.getElementById('openai-card'),
        badge: document.getElementById('openai-badge'),
        keyDisplay: document.getElementById('openai-key-display'),
        maskedKey: document.getElementById('openai-masked-key'),
        inputGroup: document.getElementById('openai-input-group'),
        input: document.getElementById('openai-key-input'),
        validation: document.getElementById('openai-validation'),
        editBtn: document.getElementById('openai-edit-btn'),
        saveBtn: document.getElementById('openai-save-btn'),
        cancelBtn: document.getElementById('openai-cancel-btn'),
        removeBtn: document.getElementById('openai-remove-btn')
    }
};

// Load initial state from backend
async function loadApiKeysConfig() {
    try {
        const config = await invoke('get_api_keys_config');
        state.geminiConfigured = config.gemini_configured;
        state.openaiConfigured = config.openai_configured;
        state.activeProvider = config.active_provider;
        updateUI();
    } catch (error) {
        console.error('Failed to load API keys config:', error);
        showGlobalError('Failed to load settings: ' + error);
    }
}

// Load key status for a specific provider
async function loadKeyStatus(provider) {
    try {
        const status = await invoke('get_api_key_status', { provider });
        return status;
    } catch (error) {
        console.error(`Failed to load ${provider} key status:`, error);
        return null;
    }
}

// Update the entire UI based on current state
function updateUI() {
    updateProviderCard('gemini', state.geminiConfigured);
    updateProviderCard('openai', state.openaiConfigured);
    updateProviderSelection();
}

// Update a provider's card UI
function updateProviderCard(provider, configured) {
    const el = elements[provider];

    if (configured) {
        el.badge.textContent = 'Configured';
        el.badge.classList.add('configured');
        el.badge.classList.remove('not-configured');
        el.status.textContent = '(configured)';
        el.status.classList.add('configured');
        el.removeBtn.style.display = 'inline-block';

        // Load and display masked key
        loadKeyStatus(provider).then(status => {
            if (status && status.masked_key) {
                el.maskedKey.textContent = status.masked_key;
            }
        });
    } else {
        el.badge.textContent = 'Not configured';
        el.badge.classList.remove('configured');
        el.badge.classList.add('not-configured');
        el.status.textContent = '';
        el.status.classList.remove('configured');
        el.maskedKey.textContent = 'No key configured';
        el.removeBtn.style.display = 'none';
    }

    // Reset to view mode
    exitEditMode(provider);
}

// Update provider selection radio buttons
function updateProviderSelection() {
    const geminiEl = elements.gemini;
    const openaiEl = elements.openai;

    // Update radio button states
    geminiEl.radio.checked = state.activeProvider === 'gemini';
    openaiEl.radio.checked = state.activeProvider === 'openai';

    // Disable radio if not configured
    geminiEl.radio.disabled = !state.geminiConfigured;
    openaiEl.radio.disabled = !state.openaiConfigured;

    // Update visual state of radio labels
    geminiEl.radioLabel.classList.toggle('disabled', !state.geminiConfigured);
    openaiEl.radioLabel.classList.toggle('disabled', !state.openaiConfigured);
}

// Enter edit mode for a provider
function enterEditMode(provider) {
    const el = elements[provider];
    state.editingProvider = provider;

    el.keyDisplay.style.display = 'none';
    el.inputGroup.style.display = 'flex';
    el.editBtn.style.display = 'none';
    el.saveBtn.style.display = 'inline-block';
    el.cancelBtn.style.display = 'inline-block';
    el.removeBtn.style.display = 'none';
    el.validation.textContent = '';
    el.validation.className = 'validation-message';
    el.input.value = '';
    el.input.type = 'password';
    el.input.focus();
}

// Exit edit mode for a provider
function exitEditMode(provider) {
    const el = elements[provider];
    const configured = provider === 'gemini' ? state.geminiConfigured : state.openaiConfigured;

    state.editingProvider = null;

    el.keyDisplay.style.display = 'block';
    el.inputGroup.style.display = 'none';
    el.editBtn.style.display = 'inline-block';
    el.saveBtn.style.display = 'none';
    el.cancelBtn.style.display = 'none';
    el.removeBtn.style.display = configured ? 'inline-block' : 'none';
    el.validation.textContent = '';
    el.validation.className = 'validation-message';
    el.input.value = '';
    el.input.type = 'password';
}

// Show validation message
function showValidation(provider, message, isError = false) {
    const el = elements[provider];
    el.validation.textContent = message;
    el.validation.className = 'validation-message ' + (isError ? 'error' : 'success');
}

// Show global error (for load failures)
function showGlobalError(message) {
    // For now just log to console - could add a toast/notification system
    console.error(message);
}

// Validate API key format before making API call
function validateKeyFormat(provider, key) {
    if (provider === 'gemini') {
        // Gemini keys typically start with 'AIza'
        if (!key.startsWith('AIza')) {
            return { valid: false, message: 'Gemini API keys should start with "AIza"' };
        }
    } else if (provider === 'openai') {
        // OpenAI keys start with 'sk-'
        if (!key.startsWith('sk-')) {
            return { valid: false, message: 'OpenAI API keys should start with "sk-"' };
        }
    }
    return { valid: true };
}

// Save API key for a provider
async function saveApiKey(provider) {
    const el = elements[provider];
    const key = el.input.value.trim();

    if (!key) {
        showValidation(provider, 'Please enter an API key', true);
        return;
    }

    // Validate key format before making API call
    const formatCheck = validateKeyFormat(provider, key);
    if (!formatCheck.valid) {
        showValidation(provider, formatCheck.message, true);
        return;
    }

    // Check rate limiting cooldown
    const now = Date.now();
    const timeSinceLastAttempt = now - lastValidationAttempt[provider];
    if (timeSinceLastAttempt < VALIDATION_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((VALIDATION_COOLDOWN_MS - timeSinceLastAttempt) / 1000);
        showValidation(provider, `Please wait ${remainingSeconds}s before trying again`, true);
        return;
    }
    lastValidationAttempt[provider] = now;

    // Show validating state
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Validating...';
    showValidation(provider, 'Validating API key...');

    try {
        const result = await invoke('validate_and_save_api_key', { provider, key });

        if (result.valid) {
            showValidation(provider, 'API key saved successfully!');

            // Update state
            if (provider === 'gemini') {
                state.geminiConfigured = true;
            } else {
                state.openaiConfigured = true;
            }

            // Auto-select this provider if none is selected
            if (!state.activeProvider) {
                await setActiveProvider(provider);
            }

            // Refresh UI immediately after successful save
            await loadApiKeysConfig();
        } else {
            showValidation(provider, result.message, true);
        }
    } catch (error) {
        showValidation(provider, 'Error: ' + error, true);
    } finally {
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = 'Save';
    }
}

// Remove API key for a provider
async function removeApiKey(provider) {
    if (!confirm(`Are you sure you want to remove the ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key?`)) {
        return;
    }

    try {
        await invoke('remove_api_key', { provider });

        // Update state
        if (provider === 'gemini') {
            state.geminiConfigured = false;
        } else {
            state.openaiConfigured = false;
        }

        // If this was the active provider, clear or switch
        if (state.activeProvider === provider) {
            const otherProvider = provider === 'gemini' ? 'openai' : 'gemini';
            const otherConfigured = provider === 'gemini' ? state.openaiConfigured : state.geminiConfigured;

            if (otherConfigured) {
                await setActiveProvider(otherProvider);
            } else {
                await setActiveProvider(null);
            }
        }

        // Refresh UI
        loadApiKeysConfig();
    } catch (error) {
        console.error('Failed to remove API key:', error);
        alert('Failed to remove API key: ' + error);
    }
}

// Set active provider
async function setActiveProvider(provider) {
    try {
        await invoke('set_active_provider', { provider });
        state.activeProvider = provider;
        updateProviderSelection();
    } catch (error) {
        console.error('Failed to set active provider:', error);
        alert('Failed to set active provider: ' + error);
        // Revert radio selection
        updateProviderSelection();
    }
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

// Event listeners
function setupEventListeners() {
    // Edit buttons
    elements.gemini.editBtn.addEventListener('click', () => enterEditMode('gemini'));
    elements.openai.editBtn.addEventListener('click', () => enterEditMode('openai'));

    // Save buttons
    elements.gemini.saveBtn.addEventListener('click', () => saveApiKey('gemini'));
    elements.openai.saveBtn.addEventListener('click', () => saveApiKey('openai'));

    // Cancel buttons
    elements.gemini.cancelBtn.addEventListener('click', () => exitEditMode('gemini'));
    elements.openai.cancelBtn.addEventListener('click', () => exitEditMode('openai'));

    // Remove buttons
    elements.gemini.removeBtn.addEventListener('click', () => removeApiKey('gemini'));
    elements.openai.removeBtn.addEventListener('click', () => removeApiKey('openai'));

    // Provider selection radio buttons
    elements.gemini.radio.addEventListener('change', async (e) => {
        if (e.target.checked && state.geminiConfigured) {
            await setActiveProvider('gemini');
        }
    });

    elements.openai.radio.addEventListener('change', async (e) => {
        if (e.target.checked && state.openaiConfigured) {
            await setActiveProvider('openai');
        }
    });

    // Password visibility toggles
    document.querySelectorAll('.toggle-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            togglePasswordVisibility(targetId);
        });
    });

    // Enter key to save
    elements.gemini.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveApiKey('gemini');
        } else if (e.key === 'Escape') {
            exitEditMode('gemini');
        }
    });

    elements.openai.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveApiKey('openai');
        } else if (e.key === 'Escape') {
            exitEditMode('openai');
        }
    });
}

// Initialize the settings page
async function initialize() {
    try {
        if (!invoke) {
            throw new Error('Tauri API not available');
        }

        setupEventListeners();
        await loadApiKeysConfig();
    } catch (error) {
        console.error('Settings initialization error:', error);
        showGlobalError('Failed to initialize settings: ' + error);
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
