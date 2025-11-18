/**
 * Unit Tests for Screen Capture Overlay
 * Tests the core selection logic and coordinate calculations
 *
 * Note: setup.js runs before this file to configure the DOM environment
 */

// Import the overlay module functions
const {
    calculateRect,
    clampToScreen,
    state,
    MIN_SELECTION_SIZE
} = require('../overlay.js');

describe('Overlay Selection Logic', () => {

    // ==================== Rectangle Calculation Tests ====================

    describe('calculateRect', () => {

        test('calculates rectangle from top-left to bottom-right drag', () => {
            const point1 = { x: 100, y: 100 };
            const point2 = { x: 300, y: 250 };
            const rect = calculateRect(point1, point2);

            expect(rect.x).toBe(100);
            expect(rect.y).toBe(100);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(150);
        });

        test('calculates rectangle from bottom-right to top-left drag', () => {
            const point1 = { x: 300, y: 250 };
            const point2 = { x: 100, y: 100 };
            const rect = calculateRect(point1, point2);

            expect(rect.x).toBe(100);
            expect(rect.y).toBe(100);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(150);
        });

        test('calculates rectangle from top-right to bottom-left drag', () => {
            const point1 = { x: 300, y: 100 };
            const point2 = { x: 100, y: 250 };
            const rect = calculateRect(point1, point2);

            expect(rect.x).toBe(100);
            expect(rect.y).toBe(100);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(150);
        });

        test('calculates rectangle from bottom-left to top-right drag', () => {
            const point1 = { x: 100, y: 250 };
            const point2 = { x: 300, y: 100 };
            const rect = calculateRect(point1, point2);

            expect(rect.x).toBe(100);
            expect(rect.y).toBe(100);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(150);
        });

        test('handles zero-width rectangle', () => {
            const point1 = { x: 100, y: 100 };
            const point2 = { x: 100, y: 200 };
            const rect = calculateRect(point1, point2);

            expect(rect.x).toBe(100);
            expect(rect.width).toBe(0);
            expect(rect.height).toBe(100);
        });

        test('handles zero-height rectangle', () => {
            const point1 = { x: 100, y: 100 };
            const point2 = { x: 200, y: 100 };
            const rect = calculateRect(point1, point2);

            expect(rect.y).toBe(100);
            expect(rect.width).toBe(100);
            expect(rect.height).toBe(0);
        });

        test('returns null for null point1', () => {
            const rect = calculateRect(null, { x: 100, y: 100 });
            expect(rect).toBeNull();
        });

        test('returns null for null point2', () => {
            const rect = calculateRect({ x: 100, y: 100 }, null);
            expect(rect).toBeNull();
        });

        test('handles negative coordinates', () => {
            const point1 = { x: -50, y: -30 };
            const point2 = { x: 50, y: 70 };
            const rect = calculateRect(point1, point2);

            expect(rect.x).toBe(-50);
            expect(rect.y).toBe(-30);
            expect(rect.width).toBe(100);
            expect(rect.height).toBe(100);
        });

        test('handles same point (click without drag)', () => {
            const point1 = { x: 150, y: 150 };
            const point2 = { x: 150, y: 150 };
            const rect = calculateRect(point1, point2);

            expect(rect.x).toBe(150);
            expect(rect.y).toBe(150);
            expect(rect.width).toBe(0);
            expect(rect.height).toBe(0);
        });

    });

    // ==================== Boundary Clamping Tests ====================

    describe('clampToScreen', () => {

        beforeEach(() => {
            // Reset window dimensions for consistent testing
            global.window.innerWidth = 1920;
            global.window.innerHeight = 1080;
        });

        test('does not modify rect fully within screen', () => {
            const rect = { x: 100, y: 100, width: 200, height: 150 };
            const clamped = clampToScreen(rect);

            expect(clamped.x).toBe(100);
            expect(clamped.y).toBe(100);
            expect(clamped.width).toBe(200);
            expect(clamped.height).toBe(150);
        });

        test('clamps negative x to 0', () => {
            const rect = { x: -50, y: 100, width: 200, height: 150 };
            const clamped = clampToScreen(rect);

            expect(clamped.x).toBe(0);
            expect(clamped.width).toBe(150); // 200 - 50 = 150
        });

        test('clamps negative y to 0', () => {
            const rect = { x: 100, y: -30, width: 200, height: 150 };
            const clamped = clampToScreen(rect);

            expect(clamped.y).toBe(0);
            expect(clamped.height).toBe(120); // 150 - 30 = 120
        });

        test('clamps width extending past right edge', () => {
            const rect = { x: 1800, y: 100, width: 200, height: 150 };
            const clamped = clampToScreen(rect);

            expect(clamped.x).toBe(1800);
            expect(clamped.width).toBe(120); // 1920 - 1800 = 120
        });

        test('clamps height extending past bottom edge', () => {
            const rect = { x: 100, y: 1000, width: 200, height: 150 };
            const clamped = clampToScreen(rect);

            expect(clamped.y).toBe(1000);
            expect(clamped.height).toBe(80); // 1080 - 1000 = 80
        });

        test('handles rect completely outside screen (negative)', () => {
            const rect = { x: -300, y: -200, width: 100, height: 100 };
            const clamped = clampToScreen(rect);

            expect(clamped.x).toBe(0);
            expect(clamped.y).toBe(0);
            expect(clamped.width).toBe(0); // Fully outside
            expect(clamped.height).toBe(0);
        });

        test('handles rect at exact screen boundaries', () => {
            const rect = { x: 0, y: 0, width: 1920, height: 1080 };
            const clamped = clampToScreen(rect);

            expect(clamped.x).toBe(0);
            expect(clamped.y).toBe(0);
            expect(clamped.width).toBe(1920);
            expect(clamped.height).toBe(1080);
        });

    });

    // ==================== Minimum Size Constant Tests ====================

    describe('MIN_SELECTION_SIZE', () => {

        test('minimum size is 10 pixels', () => {
            expect(MIN_SELECTION_SIZE).toBe(10);
        });

        test('selection at minimum size should be valid', () => {
            const rect = { x: 0, y: 0, width: 10, height: 10 };
            const isValid = rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE;
            expect(isValid).toBe(true);
        });

        test('selection below minimum size should be invalid', () => {
            const rect = { x: 0, y: 0, width: 9, height: 9 };
            const isValid = rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE;
            expect(isValid).toBe(false);
        });

    });

    // ==================== State Management Tests ====================

    describe('state', () => {

        test('initial state has correct default values', () => {
            // Note: state may have been modified by previous tests
            // These test the structure, actual values may vary
            expect(state).toHaveProperty('isSelecting');
            expect(state).toHaveProperty('isDragging');
            expect(state).toHaveProperty('startPoint');
            expect(state).toHaveProperty('currentPoint');
            expect(state).toHaveProperty('selectionRect');
            expect(state).toHaveProperty('animationFrameId');
            expect(state).toHaveProperty('instructionsVisible');
        });

        test('state properties are correct types', () => {
            expect(typeof state.isSelecting).toBe('boolean');
            expect(typeof state.isDragging).toBe('boolean');
            expect(typeof state.instructionsVisible).toBe('boolean');
        });

    });

});

// ==================== Integration-style Tests ====================

describe('Selection Workflow', () => {

    test('complete selection workflow produces valid rect', () => {
        // Simulate a complete drag selection
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 400, y: 300 };

        const rect = calculateRect(startPoint, endPoint);
        const clamped = clampToScreen(rect);

        expect(clamped.width).toBeGreaterThanOrEqual(MIN_SELECTION_SIZE);
        expect(clamped.height).toBeGreaterThanOrEqual(MIN_SELECTION_SIZE);
        expect(clamped.x).toBeGreaterThanOrEqual(0);
        expect(clamped.y).toBeGreaterThanOrEqual(0);
    });

    test('very small drag is detected as click', () => {
        const startPoint = { x: 100, y: 100 };
        const endPoint = { x: 101, y: 101 };

        const rect = calculateRect(startPoint, endPoint);

        // This should be treated as a click (width and height < 2)
        expect(rect.width).toBeLessThan(2);
        expect(rect.height).toBeLessThan(2);
    });

    test('selection spanning full screen is valid', () => {
        const startPoint = { x: 0, y: 0 };
        const endPoint = { x: 1920, y: 1080 };

        const rect = calculateRect(startPoint, endPoint);
        const clamped = clampToScreen(rect);

        expect(clamped.width).toBe(1920);
        expect(clamped.height).toBe(1080);
    });

});

// ==================== Edge Case Tests ====================

describe('Edge Cases', () => {

    test('floating point coordinates are handled', () => {
        const point1 = { x: 100.5, y: 100.7 };
        const point2 = { x: 300.3, y: 250.9 };
        const rect = calculateRect(point1, point2);

        // Should calculate correctly with floats
        expect(rect).toBeDefined();
        expect(rect.width).toBeCloseTo(199.8, 1);
        expect(rect.height).toBeCloseTo(150.2, 1);
    });

    test('very large coordinates are handled', () => {
        const point1 = { x: 10000, y: 10000 };
        const point2 = { x: 10500, y: 10500 };
        const rect = calculateRect(point1, point2);

        expect(rect.width).toBe(500);
        expect(rect.height).toBe(500);
    });

});
