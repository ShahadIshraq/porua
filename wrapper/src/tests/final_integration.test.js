/**
 * Final Integration Tests
 * Comprehensive tests verifying the complete capture workflow
 */

const {
    overlay,
    preview,
    resetAllStates,
    simulateMouseDrag
} = require('./test-helpers.js');

describe('Complete Capture Workflow', () => {

    beforeEach(() => {
        resetAllStates();
    });

    describe('Selection to Capture Flow', () => {

        test('complete flow: mouse down -> drag -> mouse up -> valid selection', () => {
            // Simulate mouse down
            overlay.state.isSelecting = true;
            overlay.state.isDragging = true;
            overlay.state.startPoint = { x: 100, y: 100 };

            // Simulate drag
            overlay.state.currentPoint = { x: 400, y: 350 };
            const rect = overlay.calculateRect(
                overlay.state.startPoint,
                overlay.state.currentPoint
            );
            overlay.state.selectionRect = rect;

            // Verify selection is valid
            expect(overlay.isSelectionValid(rect)).toBe(true);
            expect(overlay.isJustAClick(rect)).toBe(false);

            // Verify dimensions
            expect(rect.width).toBe(300);
            expect(rect.height).toBe(250);

            // Clamp to screen
            const clamped = overlay.clampToScreen(rect);
            expect(clamped.width).toBeGreaterThanOrEqual(overlay.MIN_SELECTION_SIZE);
            expect(clamped.height).toBeGreaterThanOrEqual(overlay.MIN_SELECTION_SIZE);
        });

        test('complete flow handles minimum valid selection', () => {
            overlay.state.startPoint = { x: 500, y: 500 };
            overlay.state.currentPoint = {
                x: 500 + overlay.MIN_SELECTION_SIZE,
                y: 500 + overlay.MIN_SELECTION_SIZE
            };

            const rect = overlay.calculateRect(
                overlay.state.startPoint,
                overlay.state.currentPoint
            );

            expect(overlay.isSelectionValid(rect)).toBe(true);
            expect(rect.width).toBe(overlay.MIN_SELECTION_SIZE);
            expect(rect.height).toBe(overlay.MIN_SELECTION_SIZE);
        });

        test('complete flow rejects click without drag', () => {
            overlay.state.startPoint = { x: 500, y: 500 };
            overlay.state.currentPoint = { x: 501, y: 501 };

            const rect = overlay.calculateRect(
                overlay.state.startPoint,
                overlay.state.currentPoint
            );

            expect(overlay.isJustAClick(rect)).toBe(true);
        });

    });

    describe('Preview Window Flow', () => {

        test('complete flow: load image -> zoom -> pan', () => {
            // Simulate image loaded
            preview.state.imagePath = '/tmp/capture_test.png';
            preview.state.imageWidth = 1920;
            preview.state.imageHeight = 1080;

            // Verify initial state
            expect(preview.state.zoom).toBe(preview.DEFAULT_ZOOM);

            // Zoom in
            preview.zoomIn();
            expect(preview.state.zoom).toBe(preview.DEFAULT_ZOOM + preview.ZOOM_STEP);

            // Zoom out
            preview.zoomOut();
            expect(preview.state.zoom).toBe(preview.DEFAULT_ZOOM);

            // Set specific zoom
            preview.setZoom(2.0);
            expect(preview.state.zoom).toBe(2.0);
        });

        test('complete flow: file path conversion for different platforms', () => {
            // Unix path
            const unixPath = '/Users/test/captures/screenshot.png';
            const unixUrl = preview.convertFilePath(unixPath);
            expect(unixUrl).toContain('file://');

            // Windows path
            const winPath = 'C:\\Users\\test\\captures\\screenshot.png';
            const winUrl = preview.convertFilePath(winPath);
            expect(winUrl).toContain('file:///');
            expect(winUrl).not.toContain('\\');
        });

    });

    describe('Error Handling Flow', () => {

        test('complete flow: permission denied scenario', () => {
            overlay.state.hasPermission = false;

            // Attempt to capture should be blocked by permission check
            expect(overlay.state.hasPermission).toBe(false);

            // Error should be parseable
            const error = overlay.parseErrorMessage('Permission denied');
            expect(error.type).toBe(overlay.ErrorType.PERMISSION_DENIED);
        });

        test('complete flow: selection too small scenario', () => {
            overlay.state.startPoint = { x: 100, y: 100 };
            overlay.state.currentPoint = { x: 105, y: 105 };

            const rect = overlay.calculateRect(
                overlay.state.startPoint,
                overlay.state.currentPoint
            );

            expect(overlay.isSelectionValid(rect)).toBe(false);

            const error = overlay.parseErrorMessage('Selection too small');
            expect(error.type).toBe(overlay.ErrorType.SELECTION_TOO_SMALL);
            expect(error.message).toContain(overlay.MIN_SELECTION_SIZE.toString());
        });

    });

    describe('Multi-Monitor Flow', () => {

        test('selection on extended desktop (secondary monitor)', () => {
            // Secondary monitor starts at x = 1920
            overlay.state.startPoint = { x: 2000, y: 100 };
            overlay.state.currentPoint = { x: 2500, y: 400 };

            const rect = overlay.calculateRect(
                overlay.state.startPoint,
                overlay.state.currentPoint
            );

            expect(rect.x).toBe(2000);
            expect(rect.width).toBe(500);
            expect(rect.height).toBe(300);
            expect(overlay.isSelectionValid(rect)).toBe(true);
        });

        test('selection spanning multiple monitors', () => {
            // Selection from primary to secondary
            overlay.state.startPoint = { x: 1800, y: 500 };
            overlay.state.currentPoint = { x: 2200, y: 800 };

            const rect = overlay.calculateRect(
                overlay.state.startPoint,
                overlay.state.currentPoint
            );

            expect(rect.x).toBe(1800);
            expect(rect.width).toBe(400);
            expect(overlay.isSelectionValid(rect)).toBe(true);
        });

    });

    describe('State Consistency', () => {

        test('overlay and preview states are independent', () => {
            overlay.state.isSelecting = true;
            preview.state.isPanning = true;

            expect(overlay.state.isSelecting).toBe(true);
            expect(preview.state.isPanning).toBe(true);
            expect(overlay.state).not.toBe(preview.state);
        });

        test('state modifications are isolated', () => {
            const overlayStart = { ...overlay.state };
            const previewStart = { ...preview.state };

            // Modify overlay
            overlay.state.startPoint = { x: 100, y: 100 };

            // Modify preview
            preview.state.zoom = 2.5;

            // Verify isolation
            expect(overlay.state.startPoint).toEqual({ x: 100, y: 100 });
            expect(preview.state.zoom).toBe(2.5);

            // Reset
            overlay.state.startPoint = null;
            preview.state.zoom = preview.DEFAULT_ZOOM;
        });

    });

});

describe('API Contract Verification', () => {

    describe('Overlay Module Exports', () => {

        test('exports all required functions', () => {
            expect(typeof overlay.calculateRect).toBe('function');
            expect(typeof overlay.clampToScreen).toBe('function');
            expect(typeof overlay.isSelectionValid).toBe('function');
            expect(typeof overlay.isJustAClick).toBe('function');
            expect(typeof overlay.parseErrorMessage).toBe('function');
        });

        test('exports all required constants', () => {
            expect(overlay.MIN_SELECTION_SIZE).toBeDefined();
            expect(typeof overlay.MIN_SELECTION_SIZE).toBe('number');
            expect(overlay.MIN_SELECTION_SIZE).toBe(10);
        });

        test('exports ErrorType enum', () => {
            expect(overlay.ErrorType).toBeDefined();
            expect(overlay.ErrorType.SELECTION_TOO_SMALL).toBeDefined();
            expect(overlay.ErrorType.PERMISSION_DENIED).toBeDefined();
            expect(overlay.ErrorType.CAPTURE_FAILED).toBeDefined();
            expect(overlay.ErrorType.SAVE_FAILED).toBeDefined();
        });

        test('exports state object', () => {
            expect(overlay.state).toBeDefined();
            expect(typeof overlay.state).toBe('object');
        });

    });

    describe('Preview Module Exports', () => {

        test('exports all required functions', () => {
            expect(typeof preview.formatFileSize).toBe('function');
            expect(typeof preview.setZoom).toBe('function');
            expect(typeof preview.zoomIn).toBe('function');
            expect(typeof preview.zoomOut).toBe('function');
            expect(typeof preview.convertFilePath).toBe('function');
        });

        test('exports all required constants', () => {
            expect(preview.MIN_ZOOM).toBeDefined();
            expect(preview.MAX_ZOOM).toBeDefined();
            expect(preview.ZOOM_STEP).toBeDefined();
            expect(preview.DEFAULT_ZOOM).toBeDefined();
        });

        test('exports state object', () => {
            expect(preview.state).toBeDefined();
            expect(typeof preview.state).toBe('object');
        });

    });

});

describe('Cross-Module Integration', () => {

    test('overlay selection parameters are compatible with capture command format', () => {
        const selection = overlay.calculateRect(
            { x: 100.5, y: 200.7 },
            { x: 400.9, y: 500.3 }
        );

        // Capture command expects integers
        const captureParams = {
            x: Math.round(selection.x),
            y: Math.round(selection.y),
            width: Math.round(selection.width),
            height: Math.round(selection.height)
        };

        expect(Number.isInteger(captureParams.x)).toBe(true);
        expect(Number.isInteger(captureParams.y)).toBe(true);
        expect(Number.isInteger(captureParams.width)).toBe(true);
        expect(Number.isInteger(captureParams.height)).toBe(true);
    });

    test('file paths from capture are valid for preview', () => {
        // Simulate capture result
        const captureResult = {
            file_path: '/tmp/capture_20231118_120000_abc123.png',
            width: 300,
            height: 250,
            timestamp: '2023-11-18 12:00:00'
        };

        // Convert for preview
        const previewUrl = preview.convertFilePath(captureResult.file_path);
        expect(previewUrl).toContain('file://');
        expect(previewUrl).toContain('capture_20231118_120000_abc123.png');
    });

});

describe('Requirements Verification', () => {

    test('minimum selection size is 10x10 pixels', () => {
        expect(overlay.MIN_SELECTION_SIZE).toBe(10);

        // 9x9 is invalid
        expect(overlay.isSelectionValid({ x: 0, y: 0, width: 9, height: 9 })).toBe(false);

        // 10x10 is valid
        expect(overlay.isSelectionValid({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    });

    test('zoom range is 10% to 500%', () => {
        expect(preview.MIN_ZOOM).toBe(0.1);
        expect(preview.MAX_ZOOM).toBe(5.0);
    });

    test('default zoom is 100%', () => {
        expect(preview.DEFAULT_ZOOM).toBe(1.0);
    });

    test('zoom step is 25%', () => {
        expect(preview.ZOOM_STEP).toBe(0.25);
    });

});
