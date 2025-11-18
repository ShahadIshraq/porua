/**
 * Screen Capture Overlay
 * Handles mouse-based rectangular selection for screen capture
 */

// Tauri API - only available in Tauri environment
const invoke = (typeof window !== 'undefined' && window.__TAURI__)
    ? window.__TAURI__.invoke
    : async () => { throw new Error('Tauri not available'); };

// ==================== Selection State ====================

const state = {
    isSelecting: false,
    isDragging: false,
    startPoint: null,
    currentPoint: null,
    selectionRect: null,
    animationFrameId: null,
    instructionsVisible: true
};

// Minimum selection size in pixels
const MIN_SELECTION_SIZE = 10;

// ==================== DOM Elements ====================

let canvas, ctx;
let dimensionTooltip, tooltipWidth, tooltipHeight;
let instructions, errorToast, toastMessage;

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    initializeCanvas();
    attachEventListeners();
    startRenderLoop();
});

function initializeElements() {
    canvas = document.getElementById('overlay-canvas');
    ctx = canvas.getContext('2d');

    dimensionTooltip = document.getElementById('dimension-tooltip');
    tooltipWidth = document.getElementById('tooltip-width');
    tooltipHeight = document.getElementById('tooltip-height');

    instructions = document.getElementById('instructions');
    errorToast = document.getElementById('error-toast');
    toastMessage = document.getElementById('toast-message');
}

function initializeCanvas() {
    // Set canvas to full window size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function attachEventListeners() {
    // Mouse events
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    // Keyboard events
    document.addEventListener('keydown', handleKeyDown);

    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ==================== Event Handlers ====================

function handleMouseDown(e) {
    if (e.button !== 0) return; // Only left click

    // Hide instructions on first interaction
    if (state.instructionsVisible) {
        hideInstructions();
    }

    state.isSelecting = true;
    state.isDragging = true;
    state.startPoint = { x: e.clientX, y: e.clientY };
    state.currentPoint = { x: e.clientX, y: e.clientY };
    state.selectionRect = null;

    // Show tooltip
    showTooltip();
}

function handleMouseMove(e) {
    if (!state.isDragging) return;

    state.currentPoint = { x: e.clientX, y: e.clientY };
    state.selectionRect = calculateRect(state.startPoint, state.currentPoint);

    // Update tooltip position and values
    updateTooltip(e.clientX, e.clientY, state.selectionRect);
}

function handleMouseUp(e) {
    if (!state.isDragging) return;

    state.isDragging = false;
    state.currentPoint = { x: e.clientX, y: e.clientY };
    state.selectionRect = calculateRect(state.startPoint, state.currentPoint);

    // Hide tooltip
    hideTooltip();

    // Validate and complete selection
    if (state.selectionRect) {
        completeSelection(state.selectionRect);
    }
}

function handleKeyDown(e) {
    if (e.key === 'Escape') {
        cancelCapture();
    }
}

// ==================== Selection Logic ====================

/**
 * Calculate rectangle from two corner points
 * Handles any drag direction (top-left to bottom-right, etc.)
 */
function calculateRect(point1, point2) {
    if (!point1 || !point2) return null;

    const x = Math.min(point1.x, point2.x);
    const y = Math.min(point1.y, point2.y);
    const width = Math.abs(point2.x - point1.x);
    const height = Math.abs(point2.y - point1.y);

    return { x, y, width, height };
}

/**
 * Validate selection and trigger capture
 */
async function completeSelection(rect) {
    // Check if this is just a click (no real drag)
    if (rect.width < 2 && rect.height < 2) {
        // Just a click, reset state and continue
        resetSelectionState();
        return;
    }

    // Check minimum size
    if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
        showError(`Selection too small (minimum ${MIN_SELECTION_SIZE}x${MIN_SELECTION_SIZE}px)`);
        resetSelectionState();
        return;
    }

    // Clamp to screen boundaries
    const clampedRect = clampToScreen(rect);

    try {
        // Call Tauri backend to capture the region
        const result = await invoke('capture_screen_region', {
            x: Math.round(clampedRect.x),
            y: Math.round(clampedRect.y),
            width: Math.round(clampedRect.width),
            height: Math.round(clampedRect.height)
        });

        // Open preview window with the captured image
        await invoke('open_preview_window', {
            imagePath: result.file_path,
            timestamp: result.timestamp
        });

    } catch (error) {
        console.error('Capture failed:', error);
        showError('Failed to capture screen: ' + error);
        resetSelectionState();
    }
}

/**
 * Clamp rectangle to screen boundaries
 */
function clampToScreen(rect) {
    const x = Math.max(0, rect.x);
    const y = Math.max(0, rect.y);
    const right = Math.min(window.innerWidth, rect.x + rect.width);
    const bottom = Math.min(window.innerHeight, rect.y + rect.height);

    return {
        x: x,
        y: y,
        width: Math.max(0, right - x),
        height: Math.max(0, bottom - y)
    };
}

/**
 * Reset selection state for new selection
 */
function resetSelectionState() {
    state.isSelecting = false;
    state.isDragging = false;
    state.startPoint = null;
    state.currentPoint = null;
    state.selectionRect = null;
}

/**
 * Cancel capture and close overlay
 */
async function cancelCapture() {
    try {
        await invoke('cancel_capture');
    } catch (error) {
        console.error('Failed to cancel capture:', error);
    }
}

// ==================== Rendering ====================

/**
 * Start the render loop for smooth 60fps updates
 */
function startRenderLoop() {
    function render() {
        drawOverlay();
        state.animationFrameId = requestAnimationFrame(render);
    }
    render();
}

/**
 * Main drawing function
 */
function drawOverlay() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.isDragging && state.selectionRect) {
        // Draw semi-transparent dark overlay
        drawDarkOverlay(state.selectionRect);

        // Draw selection rectangle border
        drawSelectionBorder(state.selectionRect);

        // Draw corner handles
        drawCornerHandles(state.selectionRect);
    } else if (!state.instructionsVisible) {
        // When not selecting but instructions hidden, show light overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

/**
 * Draw dark overlay with transparent selection cutout
 */
function drawDarkOverlay(rect) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

    // Top region
    ctx.fillRect(0, 0, canvas.width, rect.y);

    // Bottom region
    ctx.fillRect(0, rect.y + rect.height, canvas.width, canvas.height - rect.y - rect.height);

    // Left region
    ctx.fillRect(0, rect.y, rect.x, rect.height);

    // Right region
    ctx.fillRect(rect.x + rect.width, rect.y, canvas.width - rect.x - rect.width, rect.height);
}

/**
 * Draw selection rectangle border
 */
function drawSelectionBorder(rect) {
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    // Inner white border for contrast
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
}

/**
 * Draw corner handles for visual feedback
 */
function drawCornerHandles(rect) {
    const handleSize = 8;
    ctx.fillStyle = '#2196F3';

    // Top-left
    ctx.fillRect(rect.x - handleSize/2, rect.y - handleSize/2, handleSize, handleSize);

    // Top-right
    ctx.fillRect(rect.x + rect.width - handleSize/2, rect.y - handleSize/2, handleSize, handleSize);

    // Bottom-left
    ctx.fillRect(rect.x - handleSize/2, rect.y + rect.height - handleSize/2, handleSize, handleSize);

    // Bottom-right
    ctx.fillRect(rect.x + rect.width - handleSize/2, rect.y + rect.height - handleSize/2, handleSize, handleSize);
}

// ==================== UI Helpers ====================

function hideInstructions() {
    state.instructionsVisible = false;
    instructions.classList.add('hidden');
}

function showTooltip() {
    dimensionTooltip.classList.remove('hidden');
}

function hideTooltip() {
    dimensionTooltip.classList.add('hidden');
}

function updateTooltip(mouseX, mouseY, rect) {
    if (!rect) return;

    // Update dimension values
    tooltipWidth.textContent = Math.round(rect.width);
    tooltipHeight.textContent = Math.round(rect.height);

    // Position tooltip near cursor but offset to not obscure
    const offsetX = 15;
    const offsetY = 15;
    let tooltipX = mouseX + offsetX;
    let tooltipY = mouseY + offsetY;

    // Keep tooltip on screen
    const tooltipRect = dimensionTooltip.getBoundingClientRect();
    if (tooltipX + tooltipRect.width > window.innerWidth) {
        tooltipX = mouseX - tooltipRect.width - offsetX;
    }
    if (tooltipY + tooltipRect.height > window.innerHeight) {
        tooltipY = mouseY - tooltipRect.height - offsetY;
    }

    dimensionTooltip.style.left = tooltipX + 'px';
    dimensionTooltip.style.top = tooltipY + 'px';
}

function showError(message) {
    toastMessage.textContent = message;
    errorToast.classList.remove('hidden');
    errorToast.classList.add('visible');

    // Auto-hide after 3 seconds
    setTimeout(() => {
        errorToast.classList.remove('visible');
        errorToast.classList.add('hidden');
    }, 3000);
}

// ==================== Exports for Testing ====================

// Export functions for unit testing (if in test environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateRect,
        clampToScreen,
        state,
        MIN_SELECTION_SIZE
    };
}
