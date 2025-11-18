const { invoke } = window.__TAURI__.tauri;

// Selection state
let isSelecting = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

// DOM elements
const overlayContainer = document.getElementById('overlay-container');
const selectionBox = document.getElementById('selection-box');
const dimensionsTooltip = document.getElementById('dimensions-tooltip');
const dimensionsText = document.getElementById('dimensions-text');

// Minimum selection size (10x10 pixels)
const MIN_SIZE = 10;

/**
 * Calculate selection bounds from start and end coordinates
 * Normalizes to top-left origin regardless of drag direction
 */
function calculateBounds(sx, sy, ex, ey) {
    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    const width = Math.abs(ex - sx);
    const height = Math.abs(ey - sy);
    return { x, y, width, height };
}

/**
 * Update selection rectangle and dimensions display
 */
function updateSelection() {
    const bounds = calculateBounds(startX, startY, currentX, currentY);

    // Update selection box
    selectionBox.style.left = bounds.x + 'px';
    selectionBox.style.top = bounds.y + 'px';
    selectionBox.style.width = bounds.width + 'px';
    selectionBox.style.height = bounds.height + 'px';

    // Update dimensions tooltip
    dimensionsText.textContent = `${bounds.width} × ${bounds.height}`;

    // Position tooltip near cursor (offset to avoid cursor overlap)
    const tooltipX = currentX + 15;
    const tooltipY = currentY - 30;
    dimensionsTooltip.style.left = tooltipX + 'px';
    dimensionsTooltip.style.top = tooltipY + 'px';

    // Change color if selection is too small
    if (bounds.width < MIN_SIZE || bounds.height < MIN_SIZE) {
        selectionBox.style.borderColor = '#ff4444';
        selectionBox.style.background = 'rgba(255, 68, 68, 0.1)';
    } else {
        selectionBox.style.borderColor = '#0066ff';
        selectionBox.style.background = 'rgba(0, 102, 255, 0.1)';
    }
}

/**
 * Handle mouse down - start selection
 */
overlayContainer.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;

    // Show selection box and tooltip
    selectionBox.style.display = 'block';
    dimensionsTooltip.style.display = 'block';
    overlayContainer.classList.add('dragging');

    updateSelection();
});

/**
 * Handle mouse move - update selection
 */
overlayContainer.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;

    currentX = e.clientX;
    currentY = e.clientY;

    updateSelection();
});

/**
 * Handle mouse up - complete selection
 */
overlayContainer.addEventListener('mouseup', async (e) => {
    if (!isSelecting) return;

    isSelecting = false;
    overlayContainer.classList.remove('dragging');

    // Calculate final bounds
    const bounds = calculateBounds(startX, startY, currentX, currentY);

    // Validate selection size
    if (bounds.width < MIN_SIZE || bounds.height < MIN_SIZE) {
        // Show error message briefly
        dimensionsText.textContent = `Selection too small (min ${MIN_SIZE}×${MIN_SIZE})`;
        dimensionsTooltip.style.background = 'rgba(255, 68, 68, 0.9)';

        // Reset after delay
        setTimeout(() => {
            selectionBox.style.display = 'none';
            dimensionsTooltip.style.display = 'none';
            dimensionsTooltip.style.background = 'rgba(0, 0, 0, 0.85)';
        }, 1500);

        return;
    }

    // Valid selection - capture the region
    try {
        console.log('Capturing region:', bounds);
        const imagePath = await invoke('capture_region', {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
        });

        console.log('Capture successful:', imagePath);

        // Note: The overlay window will be closed by the backend
        // After capture_region completes, a preview window should be opened
        // (This will be handled in Phase 6)

    } catch (error) {
        console.error('Capture failed:', error);

        // Show error message
        dimensionsText.textContent = `Error: ${error}`;
        dimensionsTooltip.style.background = 'rgba(255, 68, 68, 0.9)';

        // Reset after delay
        setTimeout(() => {
            selectionBox.style.display = 'none';
            dimensionsTooltip.style.display = 'none';
            dimensionsTooltip.style.background = 'rgba(0, 0, 0, 0.85)';
        }, 2000);
    }
});

/**
 * Handle ESC key - cancel selection
 */
document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
        console.log('Capture cancelled by user');

        try {
            await invoke('cancel_capture');
        } catch (error) {
            console.error('Failed to cancel capture:', error);
        }

        // Window will be closed by backend
    }
});

/**
 * Prevent context menu
 */
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

console.log('Overlay loaded and ready');
