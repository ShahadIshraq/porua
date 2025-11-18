/**
 * Shared Test Helpers
 * Common utilities and setup functions for test files
 */

const overlay = require('../overlay.js');
const preview = require('../preview.js');

/**
 * Reset overlay module state to initial values
 * Use in beforeEach() to ensure clean state between tests
 */
function resetOverlayState() {
    overlay.state.isSelecting = false;
    overlay.state.isDragging = false;
    overlay.state.startPoint = null;
    overlay.state.currentPoint = null;
    overlay.state.selectionRect = null;
    overlay.state.animationFrameId = null;
    overlay.state.instructionsVisible = true;
    overlay.state.permissionChecked = false;
    overlay.state.hasPermission = true;
}

/**
 * Reset preview module state to initial values
 * Use in beforeEach() to ensure clean state between tests
 */
function resetPreviewState() {
    preview.state.imagePath = null;
    preview.state.imageWidth = 0;
    preview.state.imageHeight = 0;
    preview.state.fileSize = 0;
    preview.state.zoom = preview.DEFAULT_ZOOM;
    preview.state.isPanning = false;
    preview.state.panStart = { x: 0, y: 0 };
    preview.state.scrollStart = { x: 0, y: 0 };
}

/**
 * Reset all module states at once
 * Convenient for integration tests that use multiple modules
 */
function resetAllStates() {
    resetOverlayState();
    resetPreviewState();
}

/**
 * Create a mock selection scenario
 * @param {Object} options - Configuration options
 * @param {Object} options.start - Start point {x, y}
 * @param {Object} options.end - End point {x, y}
 * @param {boolean} options.isDragging - Whether currently dragging
 * @returns {Object} The calculated selection rect
 */
function createMockSelection(options = {}) {
    const start = options.start || { x: 100, y: 100 };
    const end = options.end || { x: 300, y: 300 };
    const isDragging = options.isDragging !== undefined ? options.isDragging : false;

    overlay.state.isSelecting = true;
    overlay.state.isDragging = isDragging;
    overlay.state.startPoint = start;
    overlay.state.currentPoint = end;

    const rect = overlay.calculateRect(start, end);
    overlay.state.selectionRect = rect;

    return rect;
}

/**
 * Create a mock capture result for preview testing
 * @param {Object} options - Configuration options
 * @returns {Object} Mock capture result
 */
function createMockCaptureResult(options = {}) {
    return {
        file_path: options.file_path || '/tmp/test_capture_20231118_120000_abc123.png',
        width: options.width || 300,
        height: options.height || 200,
        timestamp: options.timestamp || '2023-11-18 12:00:00'
    };
}

/**
 * Create a mock monitor info object
 * @param {Object} options - Configuration options
 * @returns {Object} Mock monitor info
 */
function createMockMonitor(options = {}) {
    return {
        id: options.id || 0,
        name: options.name || 'Mock Monitor',
        x: options.x || 0,
        y: options.y || 0,
        width: options.width || 1920,
        height: options.height || 1080,
        dpi_scale: options.dpi_scale || 1.0,
        is_primary: options.is_primary !== undefined ? options.is_primary : true
    };
}

/**
 * Simulate a complete mouse drag operation
 * @param {Object} startPoint - {x, y} starting position
 * @param {Object} endPoint - {x, y} ending position
 * @returns {Object} The resulting selection rect
 */
function simulateMouseDrag(startPoint, endPoint) {
    // Mouse down
    overlay.state.isSelecting = true;
    overlay.state.isDragging = true;
    overlay.state.startPoint = startPoint;
    overlay.state.currentPoint = startPoint;

    // Mouse move
    overlay.state.currentPoint = endPoint;
    const rect = overlay.calculateRect(startPoint, endPoint);
    overlay.state.selectionRect = rect;

    // Mouse up
    overlay.state.isDragging = false;

    return rect;
}

/**
 * Assert that two rectangles are equal
 * @param {Object} rect1 - First rectangle
 * @param {Object} rect2 - Second rectangle
 */
function expectRectsEqual(rect1, rect2) {
    expect(rect1.x).toBe(rect2.x);
    expect(rect1.y).toBe(rect2.y);
    expect(rect1.width).toBe(rect2.width);
    expect(rect1.height).toBe(rect2.height);
}

/**
 * Create a multi-monitor setup for testing
 * @returns {Array} Array of monitor info objects
 */
function createMultiMonitorSetup() {
    return [
        createMockMonitor({
            id: 0,
            name: 'Primary Monitor',
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary: true
        }),
        createMockMonitor({
            id: 1,
            name: 'Secondary Monitor',
            x: 1920,
            y: 0,
            width: 1920,
            height: 1080,
            dpi_scale: 1.5,
            is_primary: false
        })
    ];
}

module.exports = {
    // State reset functions
    resetOverlayState,
    resetPreviewState,
    resetAllStates,

    // Mock data creators
    createMockSelection,
    createMockCaptureResult,
    createMockMonitor,
    createMultiMonitorSetup,

    // Simulation helpers
    simulateMouseDrag,

    // Assertion helpers
    expectRectsEqual,

    // Re-export modules for convenience
    overlay,
    preview
};
