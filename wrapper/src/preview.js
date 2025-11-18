const { invoke } = window.__TAURI__.tauri;
const { convertFileSrc } = window.__TAURI__.tauri;
const { save } = window.__TAURI__.dialog;
const { appWindow } = window.__TAURI__.window;

// DOM elements
const capturedImage = document.getElementById('captured-image');
const dimensionsInfo = document.getElementById('dimensions-info');
const fileInfo = document.getElementById('file-info');
const recaptureBtn = document.getElementById('recapture-btn');
const saveBtn = document.getElementById('save-btn');
const closeBtn = document.getElementById('close-btn');

// Store image path
let currentImagePath = null;

/**
 * Initialize preview window with image path
 */
async function initialize() {
    try {
        // Get image path from window label (passed during window creation)
        // For now, we'll use a URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        currentImagePath = urlParams.get('path');

        if (!currentImagePath) {
            throw new Error('No image path provided');
        }

        console.log('Loading image:', currentImagePath);

        // Convert file path to URL that can be used in img src
        const imageUrl = convertFileSrc(currentImagePath);
        capturedImage.src = imageUrl;

        // Wait for image to load to get dimensions
        capturedImage.onload = () => {
            const width = capturedImage.naturalWidth;
            const height = capturedImage.naturalHeight;

            dimensionsInfo.textContent = `${width} × ${height} pixels`;
            fileInfo.textContent = getFileName(currentImagePath);

            console.log('Image loaded successfully:', width, height);
        };

        capturedImage.onerror = () => {
            throw new Error('Failed to load image');
        };

    } catch (error) {
        console.error('Initialization error:', error);
        showError(error.message);
    }
}

/**
 * Extract filename from path
 */
function getFileName(path) {
    return path.split('/').pop().split('\\').pop();
}

/**
 * Show error message
 */
function showError(message) {
    const imageContainer = document.getElementById('image-container');
    imageContainer.innerHTML = `<div class="error-message">Error: ${message}</div>`;
}

/**
 * Handle Recapture button
 */
recaptureBtn.addEventListener('click', async () => {
    try {
        console.log('Recapture requested');

        // Close preview window
        await appWindow.close();

        // Start new capture
        await invoke('start_screen_capture');

    } catch (error) {
        console.error('Recapture failed:', error);
        alert(`Failed to start recapture: ${error}`);
    }
});

/**
 * Handle Save As button
 */
saveBtn.addEventListener('click', async () => {
    try {
        console.log('Save As requested');

        // Open save dialog
        const savePath = await save({
            defaultPath: 'screenshot.png',
            filters: [{
                name: 'PNG Image',
                extensions: ['png']
            }]
        });

        if (!savePath) {
            console.log('Save cancelled by user');
            return;
        }

        console.log('Saving to:', savePath);

        // Copy file to selected location
        await invoke('save_capture_as', {
            sourcePath: currentImagePath,
            destinationPath: savePath
        });

        console.log('Save successful');

        // Show success feedback
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="btn-icon">✓</span>Saved!';
        saveBtn.disabled = true;

        setTimeout(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('Save failed:', error);
        alert(`Failed to save image: ${error}`);
    }
});

/**
 * Handle Close button
 */
closeBtn.addEventListener('click', async () => {
    try {
        console.log('Close requested');
        await appWindow.close();
    } catch (error) {
        console.error('Close failed:', error);
    }
});

/**
 * Handle ESC key
 */
document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
        await appWindow.close();
    }
});

/**
 * Prevent context menu
 */
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Initialize on load
initialize();

console.log('Preview window loaded');
