/**
 * Preview Window Logic
 * Handles image display, zoom controls, and user actions
 */

// Tauri API - gracefully handle non-Tauri environments (for testing)
const invoke = (typeof window !== 'undefined' && window.__TAURI__)
    ? window.__TAURI__.invoke
    : async () => { throw new Error('Tauri not available'); };

const listen = (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.event)
    ? window.__TAURI__.event.listen
    : async () => ({ unlisten: () => {} });

// Constants
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.25;
const DEFAULT_ZOOM = 1.0;

// State
const state = {
    imagePath: null,
    imageWidth: 0,
    imageHeight: 0,
    fileSize: 0,
    zoom: DEFAULT_ZOOM,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    scrollStart: { x: 0, y: 0 }
};

// DOM Elements (initialized on DOMContentLoaded)
let elements = {};

/**
 * Initialize DOM element references
 */
function initElements() {
    elements = {
        container: document.getElementById('preview-container'),
        imageWrapper: document.getElementById('image-wrapper'),
        image: document.getElementById('preview-image'),
        loading: document.getElementById('loading-indicator'),
        dimensions: document.getElementById('dimensions'),
        fileSize: document.getElementById('file-size'),
        zoomLevel: document.getElementById('zoom-level'),
        btnZoomIn: document.getElementById('btn-zoom-in'),
        btnZoomOut: document.getElementById('btn-zoom-out'),
        btnZoomFit: document.getElementById('btn-zoom-fit'),
        btnZoomActual: document.getElementById('btn-zoom-actual'),
        btnRecapture: document.getElementById('btn-recapture'),
        btnSave: document.getElementById('btn-save'),
        btnClose: document.getElementById('btn-close'),
        errorToast: document.getElementById('error-toast'),
        errorMessage: document.getElementById('error-message'),
        successToast: document.getElementById('success-toast'),
        successMessage: document.getElementById('success-message')
    };
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Update zoom level display
 */
function updateZoomDisplay() {
    if (elements.zoomLevel) {
        elements.zoomLevel.textContent = Math.round(state.zoom * 100) + '%';
    }
}

/**
 * Apply current zoom level to image
 */
function applyZoom() {
    if (elements.image) {
        const scaledWidth = state.imageWidth * state.zoom;
        const scaledHeight = state.imageHeight * state.zoom;
        elements.image.style.width = scaledWidth + 'px';
        elements.image.style.height = scaledHeight + 'px';
    }
    updateZoomDisplay();
}

/**
 * Set zoom level with bounds checking
 */
function setZoom(newZoom) {
    state.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    applyZoom();
}

/**
 * Zoom in by step amount
 */
function zoomIn() {
    setZoom(state.zoom + ZOOM_STEP);
}

/**
 * Zoom out by step amount
 */
function zoomOut() {
    setZoom(state.zoom - ZOOM_STEP);
}

/**
 * Fit image to window
 */
function zoomFit() {
    if (!elements.imageWrapper || state.imageWidth === 0 || state.imageHeight === 0) return;

    const wrapperRect = elements.imageWrapper.getBoundingClientRect();
    const padding = 40; // Padding around image

    const availableWidth = wrapperRect.width - padding;
    const availableHeight = wrapperRect.height - padding;

    const scaleX = availableWidth / state.imageWidth;
    const scaleY = availableHeight / state.imageHeight;

    setZoom(Math.min(scaleX, scaleY, 1.0)); // Don't zoom in beyond 100% for fit
}

/**
 * Set zoom to actual size (100%)
 */
function zoomActual() {
    setZoom(DEFAULT_ZOOM);
}

/**
 * Load image from file path
 */
async function loadImage(imagePath) {
    state.imagePath = imagePath;

    // Show loading indicator
    if (elements.loading) elements.loading.classList.remove('hidden');
    if (elements.image) elements.image.classList.add('hidden');

    try {
        // Convert file path to file:// URL for the image
        const imageUrl = convertFilePath(imagePath);

        // Create a new image to get dimensions
        const img = new Image();

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = imageUrl;
        });

        state.imageWidth = img.naturalWidth;
        state.imageHeight = img.naturalHeight;

        // Update UI
        if (elements.image) {
            elements.image.src = imageUrl;
            elements.image.classList.remove('hidden');
        }

        if (elements.dimensions) {
            elements.dimensions.textContent = `${state.imageWidth} x ${state.imageHeight} px`;
        }

        // Try to get file size (may not work in all contexts)
        await updateFileSize(imagePath);

        // Fit image to window initially
        zoomFit();

    } catch (error) {
        showError('Failed to load image: ' + error.message);
    } finally {
        if (elements.loading) elements.loading.classList.add('hidden');
    }
}

/**
 * Convert file path to appropriate URL format
 */
function convertFilePath(filePath) {
    // Handle Windows and Unix paths
    if (filePath.startsWith('/')) {
        return 'file://' + filePath;
    } else if (/^[a-zA-Z]:/.test(filePath)) {
        // Windows path
        return 'file:///' + filePath.replace(/\\/g, '/');
    }
    return filePath;
}

/**
 * Update file size display
 */
async function updateFileSize(filePath) {
    // File size would need to be passed from backend or fetched
    // For now, we'll leave it empty or get it via invoke
    try {
        // This would need a backend command to get file size
        // For now just show placeholder
        if (elements.fileSize) {
            elements.fileSize.textContent = '';
        }
    } catch (e) {
        // Ignore file size errors
    }
}

/**
 * Handle recapture button - start new capture
 */
async function handleRecapture() {
    try {
        // Close this preview and start new capture
        await invoke('start_capture_mode');
    } catch (error) {
        showError('Failed to start capture: ' + error.message);
    }
}

/**
 * Handle save button - save image to user-selected location
 */
async function handleSave() {
    if (!state.imagePath) {
        showError('No image to save');
        return;
    }

    try {
        const savedPath = await invoke('save_captured_image', {
            sourcePath: state.imagePath
        });
        showSuccess('Image saved to: ' + savedPath);
    } catch (error) {
        if (error.toString().includes('cancelled')) {
            // User cancelled, not an error
            return;
        }
        showError('Failed to save image: ' + error.message);
    }
}

/**
 * Handle close button - close preview window
 */
async function handleClose() {
    try {
        await invoke('cancel_capture');
    } catch (error) {
        // If invoke fails, try to close window directly
        if (window.__TAURI__ && window.__TAURI__.window) {
            const currentWindow = window.__TAURI__.window.getCurrent();
            await currentWindow.close();
        }
    }
}

/**
 * Show error toast
 */
function showError(message) {
    if (elements.errorMessage) {
        elements.errorMessage.textContent = message;
    }
    if (elements.errorToast) {
        elements.errorToast.classList.remove('hidden');
        setTimeout(() => {
            elements.errorToast.classList.add('hidden');
        }, 4000);
    }
}

/**
 * Show success toast
 */
function showSuccess(message) {
    if (elements.successMessage) {
        elements.successMessage.textContent = message;
    }
    if (elements.successToast) {
        elements.successToast.classList.remove('hidden');
        setTimeout(() => {
            elements.successToast.classList.add('hidden');
        }, 3000);
    }
}

/**
 * Handle mouse wheel zoom
 */
function handleWheel(event) {
    event.preventDefault();

    if (event.deltaY < 0) {
        zoomIn();
    } else {
        zoomOut();
    }
}

/**
 * Handle pan start
 */
function handlePanStart(event) {
    if (event.button !== 0) return; // Only left mouse button

    state.isPanning = true;
    state.panStart = { x: event.clientX, y: event.clientY };
    state.scrollStart = {
        x: elements.imageWrapper.scrollLeft,
        y: elements.imageWrapper.scrollTop
    };

    event.preventDefault();
}

/**
 * Handle pan move
 */
function handlePanMove(event) {
    if (!state.isPanning) return;

    const dx = event.clientX - state.panStart.x;
    const dy = event.clientY - state.panStart.y;

    elements.imageWrapper.scrollLeft = state.scrollStart.x - dx;
    elements.imageWrapper.scrollTop = state.scrollStart.y - dy;
}

/**
 * Handle pan end
 */
function handlePanEnd() {
    state.isPanning = false;
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(event) {
    // Prevent default for our shortcuts
    switch (event.key) {
        case 'Escape':
            event.preventDefault();
            handleClose();
            break;
        case 'r':
        case 'R':
            event.preventDefault();
            handleRecapture();
            break;
        case 's':
        case 'S':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                handleSave();
            }
            break;
        case '+':
        case '=':
            event.preventDefault();
            zoomIn();
            break;
        case '-':
        case '_':
            event.preventDefault();
            zoomOut();
            break;
        case 'f':
        case 'F':
            event.preventDefault();
            zoomFit();
            break;
        case '1':
            event.preventDefault();
            zoomActual();
            break;
        case '0':
            event.preventDefault();
            zoomFit();
            break;
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Button clicks
    if (elements.btnZoomIn) elements.btnZoomIn.addEventListener('click', zoomIn);
    if (elements.btnZoomOut) elements.btnZoomOut.addEventListener('click', zoomOut);
    if (elements.btnZoomFit) elements.btnZoomFit.addEventListener('click', zoomFit);
    if (elements.btnZoomActual) elements.btnZoomActual.addEventListener('click', zoomActual);
    if (elements.btnRecapture) elements.btnRecapture.addEventListener('click', handleRecapture);
    if (elements.btnSave) elements.btnSave.addEventListener('click', handleSave);
    if (elements.btnClose) elements.btnClose.addEventListener('click', handleClose);

    // Mouse wheel zoom
    if (elements.imageWrapper) {
        elements.imageWrapper.addEventListener('wheel', handleWheel, { passive: false });

        // Pan with mouse drag
        elements.imageWrapper.addEventListener('mousedown', handlePanStart);
        document.addEventListener('mousemove', handlePanMove);
        document.addEventListener('mouseup', handlePanEnd);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);
}

/**
 * Setup Tauri event listeners
 */
async function setupTauriListeners() {
    // Listen for load-image event from backend
    await listen('load-image', (event) => {
        loadImage(event.payload);
    });
}

/**
 * Initialize the preview window
 */
async function init() {
    initElements();
    setupEventListeners();
    await setupTauriListeners();
}

// Initialize on DOM ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        state,
        formatFileSize,
        setZoom,
        zoomIn,
        zoomOut,
        zoomFit,
        zoomActual,
        convertFilePath,
        showError,
        showSuccess,
        MIN_ZOOM,
        MAX_ZOOM,
        ZOOM_STEP,
        DEFAULT_ZOOM,
        initElements,
        loadImage,
        handleKeyDown
    };
}
