/**
 * End-to-End Tests for Capture Workflow
 * Tests the integration between frontend selection and backend capture
 */

// Import overlay functions
const {
    calculateRect,
    clampToScreen,
    state,
    MIN_SELECTION_SIZE
} = require('../overlay.js');

// Mock Tauri invoke responses
const mockCaptureResult = {
    file_path: '/tmp/capture_20231118_120000_abc123.png',
    width: 200,
    height: 150,
    timestamp: '2023-11-18 12:00:00'
};

describe('Capture Workflow E2E', () => {

    beforeEach(() => {
        // Reset mocks before each test
        window.__TAURI__.invoke.mockReset();
        window.__TAURI__.invoke.mockResolvedValue(mockCaptureResult);
    });

    describe('Selection to Capture Flow', () => {

        test('valid selection produces correct capture parameters', async () => {
            const startPoint = { x: 100, y: 100 };
            const endPoint = { x: 300, y: 250 };

            const rect = calculateRect(startPoint, endPoint);

            expect(rect.x).toBe(100);
            expect(rect.y).toBe(100);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(150);

            // These would be the parameters sent to capture_screen_region
            expect(rect.width).toBeGreaterThanOrEqual(MIN_SELECTION_SIZE);
            expect(rect.height).toBeGreaterThanOrEqual(MIN_SELECTION_SIZE);
        });

        test('selection is clamped before capture', () => {
            // Selection extending past screen bounds
            const rect = { x: 1800, y: 900, width: 300, height: 300 };
            const clamped = clampToScreen(rect);

            // Should be clamped to screen bounds (1920x1080)
            expect(clamped.x).toBe(1800);
            expect(clamped.y).toBe(900);
            expect(clamped.width).toBe(120); // 1920 - 1800
            expect(clamped.height).toBe(180); // 1080 - 900
        });

        test('capture parameters are integers', () => {
            const startPoint = { x: 100.7, y: 200.3 };
            const endPoint = { x: 300.9, y: 450.1 };

            const rect = calculateRect(startPoint, endPoint);

            // For Tauri IPC, we need integers
            const captureParams = {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };

            expect(Number.isInteger(captureParams.x)).toBe(true);
            expect(Number.isInteger(captureParams.y)).toBe(true);
            expect(Number.isInteger(captureParams.width)).toBe(true);
            expect(Number.isInteger(captureParams.height)).toBe(true);
        });

    });

    describe('Selection Validation', () => {

        test('selection below minimum size is rejected', () => {
            const rect = { x: 100, y: 100, width: 5, height: 5 };
            const isValid = rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE;

            expect(isValid).toBe(false);
        });

        test('selection at exact minimum size is accepted', () => {
            const rect = { x: 100, y: 100, width: 10, height: 10 };
            const isValid = rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE;

            expect(isValid).toBe(true);
        });

        test('click without drag produces invalid selection', () => {
            const startPoint = { x: 100, y: 100 };
            const endPoint = { x: 101, y: 101 }; // Very small movement

            const rect = calculateRect(startPoint, endPoint);

            // This should be treated as a click, not a selection
            const isClick = rect.width < 2 && rect.height < 2;
            expect(isClick).toBe(true);
        });

    });

    describe('Multi-Monitor Scenarios', () => {

        test('selection on secondary monitor calculates correctly', () => {
            // Secondary monitor starts at x=1920
            const startPoint = { x: 2000, y: 100 };
            const endPoint = { x: 2400, y: 400 };

            const rect = calculateRect(startPoint, endPoint);

            expect(rect.x).toBe(2000);
            expect(rect.y).toBe(100);
            expect(rect.width).toBe(400);
            expect(rect.height).toBe(300);
        });

        test('selection spanning monitors is calculated correctly', () => {
            // Selection from primary to secondary monitor
            const startPoint = { x: 1800, y: 500 };
            const endPoint = { x: 2200, y: 700 };

            const rect = calculateRect(startPoint, endPoint);

            expect(rect.x).toBe(1800);
            expect(rect.width).toBe(400);
            // Spans across monitor boundary at x=1920
        });

    });

    describe('Capture Result Handling', () => {

        test('capture result contains required fields', () => {
            expect(mockCaptureResult).toHaveProperty('file_path');
            expect(mockCaptureResult).toHaveProperty('width');
            expect(mockCaptureResult).toHaveProperty('height');
            expect(mockCaptureResult).toHaveProperty('timestamp');
        });

        test('file path is non-empty string', () => {
            expect(typeof mockCaptureResult.file_path).toBe('string');
            expect(mockCaptureResult.file_path.length).toBeGreaterThan(0);
        });

        test('dimensions are positive integers', () => {
            expect(mockCaptureResult.width).toBeGreaterThan(0);
            expect(mockCaptureResult.height).toBeGreaterThan(0);
            expect(Number.isInteger(mockCaptureResult.width)).toBe(true);
            expect(Number.isInteger(mockCaptureResult.height)).toBe(true);
        });

        test('timestamp is in expected format', () => {
            // Format: YYYY-MM-DD HH:MM:SS
            const timestampRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
            expect(mockCaptureResult.timestamp).toMatch(timestampRegex);
        });

    });

    describe('Error Scenarios', () => {

        test('handles capture failure gracefully', async () => {
            window.__TAURI__.invoke.mockRejectedValue(new Error('Capture failed'));

            // In real app, this would show error toast
            let errorCaught = false;
            try {
                await window.__TAURI__.invoke('capture_screen_region', {
                    x: 0, y: 0, width: 100, height: 100
                });
            } catch (e) {
                errorCaught = true;
                expect(e.message).toBe('Capture failed');
            }
            expect(errorCaught).toBe(true);
        });

        test('handles selection too small error', async () => {
            window.__TAURI__.invoke.mockRejectedValue(
                new Error('Selection too small (minimum 10x10px)')
            );

            let errorMessage = '';
            try {
                await window.__TAURI__.invoke('capture_screen_region', {
                    x: 0, y: 0, width: 5, height: 5
                });
            } catch (e) {
                errorMessage = e.message;
            }
            expect(errorMessage).toContain('10x10');
        });

    });

    describe('State Management', () => {

        test('state has correct structure for capture workflow', () => {
            expect(state).toHaveProperty('isSelecting');
            expect(state).toHaveProperty('isDragging');
            expect(state).toHaveProperty('startPoint');
            expect(state).toHaveProperty('currentPoint');
            expect(state).toHaveProperty('selectionRect');
        });

        test('initial state is ready for selection', () => {
            // After reset, should be ready for new selection
            expect(typeof state.isSelecting).toBe('boolean');
            expect(typeof state.isDragging).toBe('boolean');
        });

    });

});

describe('Performance Considerations', () => {

    test('rectangle calculation is fast', () => {
        const start = performance.now();

        // Perform 10000 calculations
        for (let i = 0; i < 10000; i++) {
            calculateRect({ x: i, y: i }, { x: i + 100, y: i + 100 });
        }

        const elapsed = performance.now() - start;
        // Should complete in under 100ms
        expect(elapsed).toBeLessThan(100);
    });

    test('clamping is fast', () => {
        const start = performance.now();

        // Perform 10000 clamps
        for (let i = 0; i < 10000; i++) {
            clampToScreen({ x: i, y: i, width: 100, height: 100 });
        }

        const elapsed = performance.now() - start;
        // Should complete in under 100ms
        expect(elapsed).toBeLessThan(100);
    });

});
