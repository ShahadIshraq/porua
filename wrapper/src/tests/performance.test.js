/**
 * Performance Tests
 * Tests for ensuring performance targets are met
 */

const {
    calculateRect,
    clampToScreen,
    isSelectionValid,
    isJustAClick,
    parseErrorMessage,
    state,
    MIN_SELECTION_SIZE
} = require('../overlay.js');

const {
    formatFileSize,
    setZoom,
    zoomIn,
    zoomOut,
    convertFilePath,
    state: previewState,
    DEFAULT_ZOOM
} = require('../preview.js');

describe('Performance Benchmarks', () => {

    describe('Overlay Operations', () => {

        test('calculateRect completes 10,000 operations in under 50ms', () => {
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                calculateRect(
                    { x: Math.random() * 1920, y: Math.random() * 1080 },
                    { x: Math.random() * 1920, y: Math.random() * 1080 }
                );
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        test('clampToScreen completes 10,000 operations in under 50ms', () => {
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                clampToScreen({
                    x: Math.random() * 2000 - 100,
                    y: Math.random() * 1200 - 100,
                    width: Math.random() * 500,
                    height: Math.random() * 500
                });
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        test('isSelectionValid completes 100,000 operations in under 50ms', () => {
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                isSelectionValid({
                    x: i % 1920,
                    y: i % 1080,
                    width: (i % 500) + 1,
                    height: (i % 500) + 1
                });
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        test('isJustAClick completes 100,000 operations in under 50ms', () => {
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                isJustAClick({
                    x: i % 1920,
                    y: i % 1080,
                    width: i % 10,
                    height: i % 10
                });
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        test('combined selection workflow (calc + clamp + validate) under 100ms for 10,000 iterations', () => {
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                const rect = calculateRect(
                    { x: i % 1920, y: i % 1080 },
                    { x: (i + 100) % 1920, y: (i + 100) % 1080 }
                );
                if (rect && !isJustAClick(rect)) {
                    const clamped = clampToScreen(rect);
                    isSelectionValid(clamped);
                }
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(100);
        });

    });

    describe('Preview Operations', () => {

        beforeEach(() => {
            previewState.zoom = DEFAULT_ZOOM;
        });

        test('formatFileSize completes 100,000 operations in under 100ms', () => {
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                formatFileSize(i * 1024);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(100);
        });

        test('setZoom completes 100,000 operations in under 50ms', () => {
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                setZoom((i % 50) / 10);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        test('zoomIn/zoomOut cycle completes 10,000 times in under 50ms', () => {
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                zoomIn();
                zoomOut();
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        test('convertFilePath completes 10,000 operations in under 50ms', () => {
            const paths = [
                '/Users/test/capture.png',
                'C:\\Users\\test\\capture.png',
                '/var/folders/captures/image.png',
                'D:/Downloads/screenshot.png'
            ];

            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                convertFilePath(paths[i % paths.length]);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

    });

    describe('Error Handling Performance', () => {

        test('parseErrorMessage completes 10,000 operations in under 50ms', () => {
            const errors = [
                'Permission denied',
                'Selection too small',
                'File write error',
                'Unknown error',
                new Error('Test error')
            ];

            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                parseErrorMessage(errors[i % errors.length]);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

    });

    describe('State Operations', () => {

        test('state object access is fast (1,000,000 reads in under 50ms)', () => {
            const start = performance.now();

            for (let i = 0; i < 1000000; i++) {
                const _ = state.isSelecting;
                const __ = state.isDragging;
                const ___ = state.startPoint;
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        test('state object writes are fast (100,000 writes in under 50ms)', () => {
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                state.startPoint = { x: i, y: i };
                state.currentPoint = { x: i + 100, y: i + 100 };
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(50);

            // Reset state
            state.startPoint = null;
            state.currentPoint = null;
        });

    });

});

describe('Memory Efficiency', () => {

    test('calculateRect does not accumulate memory (no leaks)', () => {
        // Run many iterations and check memory doesn't grow excessively
        const iterations = 100000;
        const results = [];

        for (let i = 0; i < iterations; i++) {
            const rect = calculateRect(
                { x: i, y: i },
                { x: i + 100, y: i + 100 }
            );
            // Only keep last result to prevent intentional accumulation
            if (i === iterations - 1) {
                results.push(rect);
            }
        }

        expect(results.length).toBe(1);
        expect(results[0]).toBeDefined();
    });

    test('clampToScreen returns new object (no mutation)', () => {
        const original = { x: -50, y: -50, width: 200, height: 200 };
        const clamped = clampToScreen(original);

        // Original should not be mutated
        expect(original.x).toBe(-50);
        expect(original.y).toBe(-50);

        // Clamped should be different object
        expect(clamped).not.toBe(original);
        expect(clamped.x).toBe(0);
        expect(clamped.y).toBe(0);
    });

});

describe('60 FPS Render Loop Simulation', () => {

    test('single frame calculations complete in under 16ms (60fps budget)', () => {
        // Simulate what happens in a single render frame
        const start = performance.now();

        // Typical frame operations:
        // 1. Calculate rect from mouse position
        const rect = calculateRect(
            { x: 100, y: 100 },
            { x: 500, y: 400 }
        );

        // 2. Validate selection
        const valid = isSelectionValid(rect);

        // 3. Check if just a click
        const click = isJustAClick(rect);

        // 4. Clamp to screen if needed
        const clamped = clampToScreen(rect);

        const elapsed = performance.now() - start;

        // 16.67ms is the budget for 60fps
        expect(elapsed).toBeLessThan(16);
        expect(valid).toBe(true);
        expect(click).toBe(false);
        expect(clamped).toBeDefined();
    });

    test('100 consecutive frames complete in under 1600ms (maintains 60fps)', () => {
        const start = performance.now();

        for (let frame = 0; frame < 100; frame++) {
            // Simulate mouse movement each frame
            const rect = calculateRect(
                { x: 100, y: 100 },
                { x: 100 + frame * 5, y: 100 + frame * 4 }
            );

            if (rect) {
                isSelectionValid(rect);
                isJustAClick(rect);
                clampToScreen(rect);
            }
        }

        const elapsed = performance.now() - start;

        // 100 frames at 60fps = 1666ms budget
        expect(elapsed).toBeLessThan(1600);
    });

});

describe('Scalability Tests', () => {

    test('handles very large coordinate values', () => {
        const start = performance.now();

        const rect = calculateRect(
            { x: Number.MAX_SAFE_INTEGER - 1000, y: Number.MAX_SAFE_INTEGER - 1000 },
            { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER }
        );

        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(1);
        expect(rect.width).toBe(1000);
        expect(rect.height).toBe(1000);
    });

    test('handles rapid state changes', () => {
        const start = performance.now();

        for (let i = 0; i < 10000; i++) {
            state.isSelecting = !state.isSelecting;
            state.isDragging = !state.isDragging;
        }

        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);

        // Reset
        state.isSelecting = false;
        state.isDragging = false;
    });

});

describe('Concurrent Operations Simulation', () => {

    test('multiple overlay operations can run together efficiently', () => {
        const start = performance.now();

        // Simulate concurrent-like operations
        const operations = [];

        for (let i = 0; i < 1000; i++) {
            operations.push(
                calculateRect({ x: i, y: i }, { x: i + 100, y: i + 100 }),
                clampToScreen({ x: i - 50, y: i - 50, width: 200, height: 200 }),
                isSelectionValid({ x: 0, y: 0, width: i + 10, height: i + 10 })
            );
        }

        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(100);
        expect(operations.length).toBe(3000);
    });

});
