// Tauri API access
let invoke, listen, openUrl;
try {
    if (window.__TAURI__) {
        invoke = window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke);
        listen = window.__TAURI__.listen || (window.__TAURI__.event && window.__TAURI__.event.listen);
        openUrl = window.__TAURI__.shell?.open || (window.__TAURI__.shell && window.__TAURI__.shell.open);

        if (!invoke || !listen) {
            throw new Error('Tauri API not properly initialized');
        }
    } else {
        throw new Error('Tauri API not found');
    }
} catch (error) {
    console.error('Failed to load Tauri API:', error);
}

// Screen management
const screens = {
    welcome: document.getElementById('welcome-screen'),
    progress: document.getElementById('progress-screen'),
    success: document.getElementById('success-screen'),
    error: document.getElementById('error-screen')
};

function showScreen(screenName) {
    // Hide all screens
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });

    // Show the requested screen
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
}

// Progress tracking with task checkboxes
const stepMap = {
    'CreatingDirectories': 1,
    'ExtractingServer': 2,
    'ExtractingEspeak': 3,
    'ExtractingSamples': 4,
    'DownloadingModels': 5,
    'CreatingConfig': 6,
    'Complete': 7
};

function updateProgress(stepName, progress, message, details = '') {
    // Find the task item for this step
    const taskItem = document.querySelector(`.task-item[data-step="${stepName}"]`);
    if (!taskItem) {
        return;
    }

    const checkbox = taskItem.querySelector('.task-checkbox');
    const taskText = taskItem.querySelector('.task-text');

    // Update checkbox state
    checkbox.className = 'task-checkbox in-progress';
    taskItem.classList.add('in-progress');
    taskItem.classList.remove('completed', 'pending');

    // Update task text if message is provided
    if (message) {
        taskText.textContent = message;
    }

    // Update download details if this is the download step
    if (stepName === 'DownloadingModels' && details) {
        const detailsSpan = document.getElementById('download-details');
        if (detailsSpan) {
            detailsSpan.textContent = details;
        }
    }

    // Mark as complete if progress is 1.0 or if this is a quick step
    if (stepName !== 'DownloadingModels' || progress >= 0.95) {
        setTimeout(() => {
            checkbox.className = 'task-checkbox completed';
            taskItem.classList.remove('in-progress');
            taskItem.classList.add('completed');
        }, 500);
    }
}

// Installation process
async function startInstallation() {
    try {
        showScreen('progress');
        await invoke('start_installation');
    } catch (error) {
        console.error('Failed to start installation:', error);
        await showError('Failed to start installation', error.toString());
    }
}

async function showError(message, errorDetails = '') {
    showScreen('error');

    // Show both message and error details
    const fullMessage = errorDetails ? message + '\n\n' + errorDetails : message;
    document.getElementById('error-message').textContent = message;

    // Get actual log path from backend if invoke is available
    if (typeof invoke === 'function') {
        try {
            const logPath = await invoke('get_log_path');
            document.getElementById('log-path').textContent = logPath + '/app.log';
        } catch (error) {
            console.error('Failed to get log path:', error);
            document.getElementById('log-path').textContent = 'Error: ' + errorDetails;
        }
    } else {
        // If invoke not available, show the error details directly
        document.getElementById('log-path').textContent = errorDetails || 'Tauri API not loaded';
    }
}

async function finishInstallation() {
    try {
        // Notify backend that installation is complete
        // The backend will hide the window and start the server
        await invoke('finish_installation');
    } catch (error) {
        console.error('Failed to finish installation:', error);
    }
}

async function retryInstallation() {
    // Reset and restart installation
    currentStep = 0;
    await startInstallation();
}

async function quitApplication() {
    try {
        await invoke('quit_application');
    } catch (error) {
        console.error('Failed to quit:', error);
        window.close();
    }
}

// Event listeners for progress updates
async function setupEventListeners() {
    // Listen for installation progress events
    await listen('install-progress', (event) => {
        const { step, progress, message, details } = event.payload;
        updateProgress(step, progress, message, details || '');

        // Show success screen when complete
        if (step === 'Complete' && progress >= 1.0) {
            setTimeout(() => {
                showScreen('success');
            }, 1000);
        }
    });

    // Listen for installation error events
    await listen('install-error', async (event) => {
        const errorMsg = typeof event.payload === 'string' ? event.payload : event.payload.message;
        await showError('Installation Error', errorMsg);
    });
}

// Button event handlers
document.getElementById('start-btn').addEventListener('click', startInstallation);
document.getElementById('done-btn').addEventListener('click', finishInstallation);
document.getElementById('retry-btn').addEventListener('click', retryInstallation);
document.getElementById('quit-btn').addEventListener('click', quitApplication);

// Handle external links - open in default browser
document.addEventListener('click', (event) => {
    const target = event.target.closest('a[href^="http"]');
    if (target && openUrl) {
        event.preventDefault();
        const url = target.getAttribute('href');
        openUrl(url).catch(err => console.error('Failed to open URL:', err));
    }
});

// Initialize the application
async function initialize() {
    try {
        // Verify Tauri API is available
        if (!invoke || !listen) {
            throw new Error('Tauri API not available');
        }

        // Set up event listeners first
        await setupEventListeners();

        // Check if installation is needed
        const needsInstall = await invoke('needs_installation');

        if (!needsInstall) {
            // Installation already complete, close this window
            window.close();
        } else {
            // Show welcome screen to start installation
            showScreen('welcome');
        }
    } catch (error) {
        console.error('Initialization error:', error);
        await showError('Failed to initialize', error.toString());
    }
}

// Settings Screen Management
function initializeSettingsScreen() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const provider = e.target.dataset.provider;
            switchProviderTab(provider);
        });
    });

    // Show/hide password toggles
    document.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            togglePasswordVisibility(targetId);
        });
    });

    // Validation buttons
    const validateGeminiBtn = document.getElementById('validate-gemini-btn');
    const validateOpenAIBtn = document.getElementById('validate-openai-btn');

    if (validateGeminiBtn) {
        validateGeminiBtn.addEventListener('click', validateAndSaveGemini);
    }
    if (validateOpenAIBtn) {
        validateOpenAIBtn.addEventListener('click', validateAndSaveOpenAI);
    }

    // Remove buttons
    const removeGeminiBtn = document.getElementById('remove-gemini-btn');
    const removeOpenAIBtn = document.getElementById('remove-openai-btn');

    if (removeGeminiBtn) {
        removeGeminiBtn.addEventListener('click', removeGeminiKey);
    }
    if (removeOpenAIBtn) {
        removeOpenAIBtn.addEventListener('click', removeOpenAIKey);
    }

    // Provider selection
    document.querySelectorAll('input[name="provider"]').forEach(radio => {
        radio.addEventListener('change', saveActiveProvider);
    });

    // Close button
    const closeBtn = document.getElementById('close-settings-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettings);
    }

    // Load existing settings
    loadSettings();
}

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

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

function showValidationStatus(element, state, message) {
    element.className = 'validation-status ' + state;
    element.textContent = message;
}

async function validateAndSaveGemini() {
    const key = document.getElementById('gemini-key').value.trim();
    const statusEl = document.getElementById('gemini-status');

    if (!key) {
        showValidationStatus(statusEl, 'error', 'Please enter an API key');
        return;
    }

    showValidationStatus(statusEl, 'pending', 'Validating...');

    try {
        const isValid = await invoke('validate_gemini_key', { key });

        if (isValid) {
            await invoke('set_gemini_key', { key });
            showValidationStatus(statusEl, 'success', 'Key validated and saved successfully');
            document.getElementById('remove-gemini-btn').style.display = 'inline-block';
        } else {
            showValidationStatus(statusEl, 'error', 'Invalid API key');
        }
    } catch (error) {
        showValidationStatus(statusEl, 'error', `Error: ${error}`);
    }
}

async function validateAndSaveOpenAI() {
    const key = document.getElementById('openai-key').value.trim();
    const statusEl = document.getElementById('openai-status');

    if (!key) {
        showValidationStatus(statusEl, 'error', 'Please enter an API key');
        return;
    }

    showValidationStatus(statusEl, 'pending', 'Validating...');

    try {
        const isValid = await invoke('validate_openai_key', { key });

        if (isValid) {
            await invoke('set_openai_key', { key });
            showValidationStatus(statusEl, 'success', 'Key validated and saved successfully');
            document.getElementById('remove-openai-btn').style.display = 'inline-block';
        } else {
            showValidationStatus(statusEl, 'error', 'Invalid API key');
        }
    } catch (error) {
        showValidationStatus(statusEl, 'error', `Error: ${error}`);
    }
}

async function removeGeminiKey() {
    const statusEl = document.getElementById('gemini-status');

    try {
        await invoke('remove_gemini_key');
        document.getElementById('gemini-key').value = '';
        document.getElementById('remove-gemini-btn').style.display = 'none';
        showValidationStatus(statusEl, 'success', 'Key removed successfully');
    } catch (error) {
        showValidationStatus(statusEl, 'error', `Error: ${error}`);
    }
}

async function removeOpenAIKey() {
    const statusEl = document.getElementById('openai-status');

    try {
        await invoke('remove_openai_key');
        document.getElementById('openai-key').value = '';
        document.getElementById('remove-openai-btn').style.display = 'none';
        showValidationStatus(statusEl, 'success', 'Key removed successfully');
    } catch (error) {
        showValidationStatus(statusEl, 'error', `Error: ${error}`);
    }
}

async function saveActiveProvider() {
    const selectedProvider = document.querySelector('input[name="provider"]:checked').value;

    try {
        await invoke('set_active_provider', { provider: selectedProvider });
        console.log('Active provider set to:', selectedProvider);
    } catch (error) {
        console.error('Failed to set active provider:', error);
    }
}

async function loadSettings() {
    try {
        // Load Gemini key status
        const geminiKey = await invoke('get_gemini_key');
        if (geminiKey) {
            document.getElementById('remove-gemini-btn').style.display = 'inline-block';
            // Don't populate the input with the actual key for security
        }

        // Load OpenAI key status
        const openaiKey = await invoke('get_openai_key');
        if (openaiKey) {
            document.getElementById('remove-openai-btn').style.display = 'inline-block';
            // Don't populate the input with the actual key for security
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

function closeSettings() {
    // In a real app, this would close the settings window
    // For now, just hide the settings screen
    showScreen('welcome');
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initialize();
        initializeSettingsScreen();
    });
} else {
    initialize();
    initializeSettingsScreen();
}
