/**
 * Tests for Preview Window Logic
 */

const {
    state,
    formatFileSize,
    setZoom,
    zoomIn,
    zoomOut,
    convertFilePath,
    MIN_ZOOM,
    MAX_ZOOM,
    ZOOM_STEP,
    DEFAULT_ZOOM
} = require('../preview.js');

describe('Preview Window Logic', () => {

    beforeEach(() => {
        // Reset state before each test
        state.imagePath = null;
        state.imageWidth = 0;
        state.imageHeight = 0;
        state.fileSize = 0;
        state.zoom = DEFAULT_ZOOM;
        state.isPanning = false;
        state.panStart = { x: 0, y: 0 };
        state.scrollStart = { x: 0, y: 0 };
    });

    describe('formatFileSize', () => {

        test('formats 0 bytes', () => {
            expect(formatFileSize(0)).toBe('0 B');
        });

        test('formats bytes', () => {
            expect(formatFileSize(500)).toBe('500 B');
        });

        test('formats kilobytes', () => {
            expect(formatFileSize(1024)).toBe('1 KB');
            expect(formatFileSize(1536)).toBe('1.5 KB');
        });

        test('formats megabytes', () => {
            expect(formatFileSize(1048576)).toBe('1 MB');
            expect(formatFileSize(2621440)).toBe('2.5 MB');
        });

        test('formats gigabytes', () => {
            expect(formatFileSize(1073741824)).toBe('1 GB');
        });

        test('handles decimal precision', () => {
            expect(formatFileSize(1234)).toBe('1.2 KB');
            expect(formatFileSize(1567890)).toBe('1.5 MB');
        });

    });

    describe('Zoom Constants', () => {

        test('MIN_ZOOM is reasonable value', () => {
            expect(MIN_ZOOM).toBeGreaterThan(0);
            expect(MIN_ZOOM).toBeLessThan(1);
        });

        test('MAX_ZOOM is reasonable value', () => {
            expect(MAX_ZOOM).toBeGreaterThan(1);
            expect(MAX_ZOOM).toBeLessThanOrEqual(10);
        });

        test('ZOOM_STEP is reasonable value', () => {
            expect(ZOOM_STEP).toBeGreaterThan(0);
            expect(ZOOM_STEP).toBeLessThan(1);
        });

        test('DEFAULT_ZOOM is 100%', () => {
            expect(DEFAULT_ZOOM).toBe(1.0);
        });

    });

    describe('setZoom', () => {

        test('sets zoom to valid value', () => {
            setZoom(1.5);
            expect(state.zoom).toBe(1.5);
        });

        test('clamps zoom to minimum', () => {
            setZoom(0.01);
            expect(state.zoom).toBe(MIN_ZOOM);
        });

        test('clamps zoom to maximum', () => {
            setZoom(10);
            expect(state.zoom).toBe(MAX_ZOOM);
        });

        test('handles exact boundary values', () => {
            setZoom(MIN_ZOOM);
            expect(state.zoom).toBe(MIN_ZOOM);

            setZoom(MAX_ZOOM);
            expect(state.zoom).toBe(MAX_ZOOM);
        });

        test('handles negative values', () => {
            setZoom(-1);
            expect(state.zoom).toBe(MIN_ZOOM);
        });

    });

    describe('zoomIn', () => {

        test('increases zoom by ZOOM_STEP', () => {
            state.zoom = 1.0;
            zoomIn();
            expect(state.zoom).toBe(1.0 + ZOOM_STEP);
        });

        test('does not exceed MAX_ZOOM', () => {
            state.zoom = MAX_ZOOM - 0.1;
            zoomIn();
            expect(state.zoom).toBe(MAX_ZOOM);
        });

        test('multiple zooms increase correctly', () => {
            state.zoom = 1.0;
            zoomIn();
            zoomIn();
            zoomIn();
            expect(state.zoom).toBeCloseTo(1.0 + (ZOOM_STEP * 3), 5);
        });

    });

    describe('zoomOut', () => {

        test('decreases zoom by ZOOM_STEP', () => {
            state.zoom = 1.0;
            zoomOut();
            expect(state.zoom).toBe(1.0 - ZOOM_STEP);
        });

        test('does not go below MIN_ZOOM', () => {
            state.zoom = MIN_ZOOM + 0.05;
            zoomOut();
            expect(state.zoom).toBe(MIN_ZOOM);
        });

        test('multiple zooms decrease correctly', () => {
            state.zoom = 1.0;
            zoomOut();
            zoomOut();
            expect(state.zoom).toBeCloseTo(1.0 - (ZOOM_STEP * 2), 5);
        });

    });

    describe('convertFilePath', () => {

        test('converts Unix absolute path', () => {
            const result = convertFilePath('/tmp/capture.png');
            expect(result).toBe('file:///tmp/capture.png');
        });

        test('converts Windows path with drive letter', () => {
            const result = convertFilePath('C:\\Users\\test\\capture.png');
            expect(result).toBe('file:///C:/Users/test/capture.png');
        });

        test('converts Windows path with forward slashes', () => {
            const result = convertFilePath('D:/Downloads/image.png');
            expect(result).toBe('file:///D:/Downloads/image.png');
        });

        test('returns already formatted URL unchanged', () => {
            const result = convertFilePath('file:///path/to/file.png');
            expect(result).toBe('file:///path/to/file.png');
        });

        test('handles paths with spaces', () => {
            const result = convertFilePath('/Users/test/My Documents/capture.png');
            expect(result).toBe('file:///Users/test/My Documents/capture.png');
        });

        test('handles lowercase drive letter', () => {
            const result = convertFilePath('c:\\test\\file.png');
            expect(result).toBe('file:///c:/test/file.png');
        });

    });

    describe('State Management', () => {

        test('initial state has correct structure', () => {
            expect(state).toHaveProperty('imagePath');
            expect(state).toHaveProperty('imageWidth');
            expect(state).toHaveProperty('imageHeight');
            expect(state).toHaveProperty('fileSize');
            expect(state).toHaveProperty('zoom');
            expect(state).toHaveProperty('isPanning');
            expect(state).toHaveProperty('panStart');
            expect(state).toHaveProperty('scrollStart');
        });

        test('state has correct initial values', () => {
            expect(state.imagePath).toBeNull();
            expect(state.imageWidth).toBe(0);
            expect(state.imageHeight).toBe(0);
            expect(state.zoom).toBe(DEFAULT_ZOOM);
            expect(state.isPanning).toBe(false);
        });

        test('panStart and scrollStart have x and y', () => {
            expect(state.panStart).toHaveProperty('x');
            expect(state.panStart).toHaveProperty('y');
            expect(state.scrollStart).toHaveProperty('x');
            expect(state.scrollStart).toHaveProperty('y');
        });

    });

    describe('Zoom Boundaries', () => {

        test('cannot zoom below 10%', () => {
            for (let i = 0; i < 20; i++) {
                zoomOut();
            }
            expect(state.zoom).toBe(MIN_ZOOM);
            expect(state.zoom).toBeGreaterThanOrEqual(0.1);
        });

        test('cannot zoom above 500%', () => {
            for (let i = 0; i < 30; i++) {
                zoomIn();
            }
            expect(state.zoom).toBe(MAX_ZOOM);
            expect(state.zoom).toBeLessThanOrEqual(5.0);
        });

        test('zoom operations are reversible', () => {
            const initialZoom = state.zoom;
            zoomIn();
            zoomIn();
            zoomOut();
            zoomOut();
            expect(state.zoom).toBeCloseTo(initialZoom, 5);
        });

    });

});

describe('Preview Window Integration', () => {

    describe('File Path Handling', () => {

        test('handles macOS typical capture path', () => {
            const path = '/var/folders/xx/captures/capture_20231118_120000.png';
            const url = convertFilePath(path);
            expect(url).toMatch(/^file:\/\//);
            expect(url).toContain('captures');
        });

        test('handles Windows typical capture path', () => {
            const path = 'C:\\Users\\User\\AppData\\Local\\Porua\\captures\\capture.png';
            const url = convertFilePath(path);
            expect(url).toMatch(/^file:\/\/\//);
            expect(url).not.toContain('\\');
        });

        test('handles special characters in path', () => {
            const path = '/Users/café/captures/screenshot (1).png';
            const url = convertFilePath(path);
            expect(url).toBe('file:///Users/café/captures/screenshot (1).png');
        });

    });

    describe('Zoom Workflow', () => {

        test('zoom to fit then actual size workflow', () => {
            // Simulate zoom fit
            setZoom(0.5);
            expect(state.zoom).toBe(0.5);

            // Then actual size
            setZoom(DEFAULT_ZOOM);
            expect(state.zoom).toBe(1.0);
        });

        test('precise zoom levels', () => {
            setZoom(0.25);
            expect(state.zoom).toBe(0.25);

            setZoom(0.5);
            expect(state.zoom).toBe(0.5);

            setZoom(0.75);
            expect(state.zoom).toBe(0.75);

            setZoom(1.5);
            expect(state.zoom).toBe(1.5);

            setZoom(2.0);
            expect(state.zoom).toBe(2.0);
        });

    });

    describe('File Size Display Formatting', () => {

        test('typical screenshot sizes format correctly', () => {
            // Small screenshot ~100KB
            expect(formatFileSize(102400)).toBe('100 KB');

            // Medium screenshot ~500KB
            expect(formatFileSize(512000)).toBe('500 KB');

            // Large screenshot ~2MB
            expect(formatFileSize(2097152)).toBe('2 MB');

            // 4K screenshot ~5MB
            expect(formatFileSize(5242880)).toBe('5 MB');
        });

    });

});

describe('Edge Cases', () => {

    test('rapid zoom in/out maintains bounds', () => {
        // Rapidly zoom in
        for (let i = 0; i < 100; i++) {
            zoomIn();
        }
        expect(state.zoom).toBeLessThanOrEqual(MAX_ZOOM);

        // Rapidly zoom out
        for (let i = 0; i < 100; i++) {
            zoomOut();
        }
        expect(state.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    });

    test('formatFileSize handles edge cases', () => {
        expect(formatFileSize(1)).toBe('1 B');
        expect(formatFileSize(1023)).toBe('1023 B');
        expect(formatFileSize(1025)).toBe('1 KB');
    });

    test('state properties are mutable', () => {
        state.imagePath = '/test/path.png';
        expect(state.imagePath).toBe('/test/path.png');

        state.imageWidth = 1920;
        state.imageHeight = 1080;
        expect(state.imageWidth).toBe(1920);
        expect(state.imageHeight).toBe(1080);
    });

});
