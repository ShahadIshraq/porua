// Tauri API access
let invoke, listen;
try {
    if (window.__TAURI__) {
        invoke = window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke);
        listen = window.__TAURI__.listen || (window.__TAURI__.event && window.__TAURI__.event.listen);

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
        await invoke('finish_installation');

        // Close the installer window
        window.close();
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

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
