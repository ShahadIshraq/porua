/**
 * Jest Setup File
 * Configures the test environment before tests run
 */

// Set window dimensions for tests
Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true, configurable: true });

// Mock Tauri API
window.__TAURI__ = {
    invoke: jest.fn().mockResolvedValue({})
};

// Mock requestAnimationFrame
window.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
window.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));
