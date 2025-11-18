/**
 * Edge Case Tests
 * Tests for validation, error handling, and boundary conditions
 */

const {
    calculateRect,
    clampToScreen,
    isSelectionValid,
    isJustAClick,
    parseErrorMessage,
    state,
    MIN_SELECTION_SIZE,
    ErrorType
} = require('../overlay.js');

const { resetOverlayState } = require('./test-helpers.js');

describe('Selection Validation', () => {

    describe('isSelectionValid', () => {

        test('returns false for null rect', () => {
            expect(isSelectionValid(null)).toBe(false);
        });

        test('returns false for undefined rect', () => {
            expect(isSelectionValid(undefined)).toBe(false);
        });

        test('returns false for rect smaller than minimum', () => {
            expect(isSelectionValid({ x: 0, y: 0, width: 5, height: 5 })).toBe(false);
            expect(isSelectionValid({ x: 0, y: 0, width: 9, height: 9 })).toBe(false);
        });

        test('returns false when only width is too small', () => {
            expect(isSelectionValid({ x: 0, y: 0, width: 5, height: 100 })).toBe(false);
        });

        test('returns false when only height is too small', () => {
            expect(isSelectionValid({ x: 0, y: 0, width: 100, height: 5 })).toBe(false);
        });

        test('returns true for rect at exact minimum size', () => {
            expect(isSelectionValid({
                x: 0, y: 0,
                width: MIN_SELECTION_SIZE,
                height: MIN_SELECTION_SIZE
            })).toBe(true);
        });

        test('returns true for rect larger than minimum', () => {
            expect(isSelectionValid({ x: 0, y: 0, width: 100, height: 100 })).toBe(true);
            expect(isSelectionValid({ x: 0, y: 0, width: 1000, height: 500 })).toBe(true);
        });

        test('returns false for zero dimensions', () => {
            expect(isSelectionValid({ x: 0, y: 0, width: 0, height: 0 })).toBe(false);
            expect(isSelectionValid({ x: 0, y: 0, width: 0, height: 100 })).toBe(false);
            expect(isSelectionValid({ x: 0, y: 0, width: 100, height: 0 })).toBe(false);
        });

    });

    describe('isJustAClick', () => {

        test('returns true for null rect', () => {
            expect(isJustAClick(null)).toBe(true);
        });

        test('returns true for undefined rect', () => {
            expect(isJustAClick(undefined)).toBe(true);
        });

        test('returns true for very small movement (less than 2px)', () => {
            expect(isJustAClick({ x: 0, y: 0, width: 0, height: 0 })).toBe(true);
            expect(isJustAClick({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
        });

        test('returns false for movement of 2px or more', () => {
            expect(isJustAClick({ x: 0, y: 0, width: 2, height: 2 })).toBe(false);
            expect(isJustAClick({ x: 0, y: 0, width: 5, height: 5 })).toBe(false);
        });

        test('detects click even with large position', () => {
            expect(isJustAClick({ x: 1000, y: 1000, width: 1, height: 1 })).toBe(true);
        });

    });

});

describe('Error Message Parsing', () => {

    describe('parseErrorMessage', () => {

        test('identifies permission denied errors', () => {
            const result = parseErrorMessage('Permission denied');
            expect(result.type).toBe(ErrorType.PERMISSION_DENIED);
            expect(result.message).toContain('permission');
        });

        test('identifies permission errors with different casing', () => {
            const result = parseErrorMessage('PERMISSION DENIED: Access not granted');
            expect(result.type).toBe(ErrorType.PERMISSION_DENIED);
        });

        test('identifies selection too small errors', () => {
            const result = parseErrorMessage('Selection too small');
            expect(result.type).toBe(ErrorType.SELECTION_TOO_SMALL);
            expect(result.message).toContain(MIN_SELECTION_SIZE.toString());
        });

        test('identifies minimum size errors', () => {
            const result = parseErrorMessage('Minimum size not met');
            expect(result.type).toBe(ErrorType.SELECTION_TOO_SMALL);
        });

        test('identifies save/file errors', () => {
            const result1 = parseErrorMessage('Failed to save file');
            expect(result1.type).toBe(ErrorType.SAVE_FAILED);

            const result2 = parseErrorMessage('File write error');
            expect(result2.type).toBe(ErrorType.SAVE_FAILED);
        });

        test('returns capture failed for unknown errors', () => {
            const result = parseErrorMessage('Unknown error occurred');
            expect(result.type).toBe(ErrorType.CAPTURE_FAILED);
            expect(result.message).toContain('try again');
        });

        test('handles Error objects', () => {
            const result = parseErrorMessage(new Error('Permission denied'));
            expect(result.type).toBe(ErrorType.PERMISSION_DENIED);
        });

        test('provides user-friendly messages', () => {
            const result = parseErrorMessage('permission');
            expect(result.message.length).toBeGreaterThan(10);
            expect(result.message).not.toContain('undefined');
        });

    });

});

describe('ErrorType Constants', () => {

    test('has all required error types', () => {
        expect(ErrorType.SELECTION_TOO_SMALL).toBeDefined();
        expect(ErrorType.PERMISSION_DENIED).toBeDefined();
        expect(ErrorType.CAPTURE_FAILED).toBeDefined();
        expect(ErrorType.SAVE_FAILED).toBeDefined();
        expect(ErrorType.UNKNOWN).toBeDefined();
    });

    test('error types are unique strings', () => {
        const types = Object.values(ErrorType);
        const uniqueTypes = new Set(types);
        expect(uniqueTypes.size).toBe(types.length);
    });

});

describe('Screen Boundary Handling', () => {

    describe('clampToScreen edge cases', () => {

        test('clamps rect completely outside screen (far negative)', () => {
            const rect = { x: -500, y: -500, width: 100, height: 100 };
            const clamped = clampToScreen(rect);
            expect(clamped.x).toBe(0);
            expect(clamped.y).toBe(0);
            expect(clamped.width).toBe(0);
            expect(clamped.height).toBe(0);
        });

        test('handles rect at exact screen boundaries', () => {
            const rect = { x: 0, y: 0, width: 1920, height: 1080 };
            const clamped = clampToScreen(rect);
            expect(clamped.x).toBe(0);
            expect(clamped.y).toBe(0);
        });

        test('handles very large selections', () => {
            const rect = { x: 0, y: 0, width: 10000, height: 10000 };
            const clamped = clampToScreen(rect);
            expect(clamped.width).toBeLessThanOrEqual(window.innerWidth);
            expect(clamped.height).toBeLessThanOrEqual(window.innerHeight);
        });

        test('maintains position when only size exceeds bounds', () => {
            const rect = { x: 100, y: 100, width: 5000, height: 5000 };
            const clamped = clampToScreen(rect);
            expect(clamped.x).toBe(100);
            expect(clamped.y).toBe(100);
        });

    });

});

describe('Selection Calculation Edge Cases', () => {

    describe('calculateRect edge cases', () => {

        test('handles floating point coordinates', () => {
            const rect = calculateRect(
                { x: 100.7, y: 200.3 },
                { x: 300.9, y: 450.1 }
            );
            expect(rect.x).toBeCloseTo(100.7, 1);
            expect(rect.y).toBeCloseTo(200.3, 1);
        });

        test('handles very large coordinates', () => {
            const rect = calculateRect(
                { x: 10000, y: 10000 },
                { x: 20000, y: 20000 }
            );
            expect(rect.width).toBe(10000);
            expect(rect.height).toBe(10000);
        });

        test('handles negative coordinates', () => {
            const rect = calculateRect(
                { x: -100, y: -100 },
                { x: 100, y: 100 }
            );
            expect(rect.x).toBe(-100);
            expect(rect.y).toBe(-100);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(200);
        });

        test('handles diagonal drag from any corner', () => {
            // All four corners should produce same size rect
            const corners = [
                [{ x: 0, y: 0 }, { x: 100, y: 100 }],
                [{ x: 100, y: 0 }, { x: 0, y: 100 }],
                [{ x: 0, y: 100 }, { x: 100, y: 0 }],
                [{ x: 100, y: 100 }, { x: 0, y: 0 }]
            ];

            corners.forEach(([p1, p2]) => {
                const rect = calculateRect(p1, p2);
                expect(rect.width).toBe(100);
                expect(rect.height).toBe(100);
            });
        });

    });

});

describe('State Management Edge Cases', () => {

    beforeEach(() => {
        resetOverlayState();
    });

    test('state has permission tracking properties', () => {
        expect(state).toHaveProperty('permissionChecked');
        expect(state).toHaveProperty('hasPermission');
    });

    test('initial permission state is true (optimistic)', () => {
        expect(state.hasPermission).toBe(true);
    });

    test('permission can be set to false', () => {
        state.hasPermission = false;
        expect(state.hasPermission).toBe(false);
    });

    test('permissionChecked can be toggled', () => {
        expect(state.permissionChecked).toBe(false);
        state.permissionChecked = true;
        expect(state.permissionChecked).toBe(true);
    });

});

describe('Multi-Monitor Considerations', () => {

    test('selection on secondary monitor coordinates', () => {
        // Simulate secondary monitor starting at x=1920
        const rect = calculateRect(
            { x: 2000, y: 100 },
            { x: 2400, y: 400 }
        );
        expect(rect.x).toBe(2000);
        expect(rect.width).toBe(400);
        expect(rect.height).toBe(300);
    });

    test('selection spanning monitor boundary', () => {
        // Selection from primary (ending at 1920) to secondary
        const rect = calculateRect(
            { x: 1800, y: 500 },
            { x: 2100, y: 700 }
        );
        expect(rect.x).toBe(1800);
        expect(rect.width).toBe(300);
        // Would span from x=1800 to x=2100
    });

    test('selection on monitor with negative coordinates', () => {
        // Some multi-monitor setups have negative coordinates
        const rect = calculateRect(
            { x: -1920, y: 0 },
            { x: -1720, y: 200 }
        );
        expect(rect.x).toBe(-1920);
        expect(rect.width).toBe(200);
    });

});

describe('Input Sanitization', () => {

    test('calculateRect handles object with extra properties', () => {
        const rect = calculateRect(
            { x: 100, y: 100, z: 999, extra: 'ignored' },
            { x: 200, y: 200, other: true }
        );
        expect(rect.x).toBe(100);
        expect(rect.width).toBe(100);
    });

    test('isSelectionValid handles rect with extra properties', () => {
        const valid = isSelectionValid({
            x: 0, y: 0,
            width: 100, height: 100,
            extra: 'data'
        });
        expect(valid).toBe(true);
    });

});
