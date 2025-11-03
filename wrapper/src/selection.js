// Tauri API
const { invoke } = window.__TAURI__.tauri;

// Selection state
let isSelecting = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

// DOM elements
const selectionBox = document.getElementById('selection-box');
const instructions = document.getElementById('instructions');
const coordinates = document.getElementById('coordinates');
const coordDisplay = document.getElementById('coord-display');

// Start selection
document.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;

    // Hide instructions
    instructions.classList.add('hidden');

    // Show selection box
    selectionBox.style.display = 'block';
    updateSelectionBox();

    // Show coordinates
    coordinates.classList.add('visible');
});

// Update selection
document.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;

    currentX = e.clientX;
    currentY = e.clientY;

    updateSelectionBox();
    updateCoordinates();
});

// End selection
document.addEventListener('mouseup', async (e) => {
    if (!isSelecting) return;

    isSelecting = false;

    // Calculate final region
    const region = calculateRegion();

    // Only proceed if selection has meaningful size
    if (region.width > 10 && region.height > 10) {
        await confirmSelection(region);
    } else {
        // Reset if selection too small
        resetSelection();
        instructions.classList.remove('hidden');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
        await cancelSelection();
    } else if (e.key === 'Enter' && !isSelecting) {
        const region = calculateRegion();
        if (region.width > 0 && region.height > 0) {
            await confirmSelection(region);
        }
    }
});

// Update selection box visual
function updateSelectionBox() {
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = x + 'px';
    selectionBox.style.top = y + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
}

// Update coordinates display
function updateCoordinates() {
    const region = calculateRegion();
    coordDisplay.innerHTML = `
        Position: ${region.x}, ${region.y}<br>
        Size: ${region.width} × ${region.height}
    `;
}

// Calculate region
function calculateRegion() {
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    return { x, y, width, height };
}

// Reset selection
function resetSelection() {
    selectionBox.style.display = 'none';
    coordinates.classList.remove('visible');
    startX = 0;
    startY = 0;
    currentX = 0;
    currentY = 0;
}

// Confirm selection
async function confirmSelection(region) {
    try {
        console.log('Confirming selection:', region);

        // Show loading state
        coordDisplay.innerHTML = 'Capturing and processing...';

        // Close selection window first
        await invoke('overlay_close_selection');

        // Capture and extract text
        const extractedText = await invoke('overlay_capture_and_extract', {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height
        });

        console.log('Extracted text:', extractedText);

        // Open overlay reader window
        await invoke('overlay_open_reader', {
            x: region.x,
            y: region.y + region.height + 10 // Position below selected region
        });

        // Send extracted text to overlay window
        // (The overlay window will listen for this event)
        if (window.__TAURI__?.event) {
            await window.__TAURI__.event.emit('text-extracted', extractedText);
        }

    } catch (error) {
        console.error('Failed to process selection:', error);
        alert(`Failed to process selection: ${error}`);

        // Close selection window on error
        await invoke('overlay_close_selection').catch(console.error);
    }
}

// Cancel selection
async function cancelSelection() {
    try {
        await invoke('overlay_close_selection');
    } catch (error) {
        console.error('Failed to close selection:', error);
    }
}

// Initialize
console.log('Selection window initialized');
