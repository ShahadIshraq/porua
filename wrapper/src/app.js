// Tauri API access
const { invoke } = window.__TAURI__.tauri;
const { listen } = window.__TAURI__.event;

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

// Progress tracking
let currentStep = 0;
const totalSteps = 7; // Total installation steps

function updateProgress(step, message, details = '') {
    currentStep = step;

    // Update step counter
    document.getElementById('current-step').textContent = currentStep;
    document.getElementById('total-steps').textContent = totalSteps;

    // Update progress bar
    const progressPercentage = (currentStep / totalSteps) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercentage}%`;

    // Update messages
    document.getElementById('progress-message').textContent = message;
    document.getElementById('progress-details').textContent = details;
}

// Installation process
async function startInstallation() {
    try {
        showScreen('progress');
        updateProgress(0, 'Initializing...', 'Preparing to install');

        // Start the installation process
        await invoke('start_installation');
    } catch (error) {
        console.error('Failed to start installation:', error);
        showError('Failed to start installation', error.toString());
    }
}

function showError(message, errorDetails = '') {
    showScreen('error');
    document.getElementById('error-message').textContent = message;

    // Get log path from home directory
    const logPath = '~/.porua/logs/install.log';
    document.getElementById('log-path').textContent = logPath;
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
        const { step, message, details } = event.payload;
        updateProgress(step, message, details || '');
    });

    // Listen for installation error events
    await listen('install-error', (event) => {
        const { message } = event.payload;
        showError('Installation Error', message);
    });

    // Listen for installation success events
    await listen('install-success', async () => {
        showScreen('success');
    });
}

// Button event handlers
document.getElementById('start-btn').addEventListener('click', () => {
    startInstallation();
});

document.getElementById('done-btn').addEventListener('click', () => {
    finishInstallation();
});

document.getElementById('retry-btn').addEventListener('click', () => {
    retryInstallation();
});

document.getElementById('quit-btn').addEventListener('click', () => {
    quitApplication();
});

// Initialize the application
async function initialize() {
    try {
        // Set up event listeners first
        await setupEventListeners();

        // Check if installation is needed
        const needsInstall = await invoke('needs_installation');

        if (!needsInstall) {
            // Installation already complete, close this window
            console.log('Installation already complete');
            window.close();
        } else {
            // Show welcome screen to start installation
            showScreen('welcome');
        }
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize', error.toString());
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
