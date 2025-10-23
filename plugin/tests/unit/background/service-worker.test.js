import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Tests for service-worker.js
 *
 * Note: This file is challenging to test comprehensively due to:
 * - Chrome extension APIs that are difficult to mock
 * - Top-level event listener registration (MV3 requirement)
 * - Dynamic imports
 * - Service worker lifecycle
 *
 * These tests focus on the testable parts:
 * - Event listener registration verification
 * - Handler behavior when invoked
 */

// Store original handlers
let onMessageHandler;
let onConnectHandler;

// Mock chrome runtime API BEFORE any imports
global.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn((handler) => {
        onMessageHandler = handler;
      }),
    },
    onConnect: {
      addListener: vi.fn((handler) => {
        onConnectHandler = handler;
      }),
    },
  },
};

// Mock MessageRouter
const mockHandleMessage = vi.fn();
const mockGetHandlerCount = vi.fn(() => 5);

vi.mock('../../../src/background/messages/MessageRouter.js', () => ({
  MessageRouter: vi.fn().mockImplementation(() => ({
    handleMessage: mockHandleMessage,
    getHandlerCount: mockGetHandlerCount,
  })),
}));

// Mock handlers
const mockRegisterTTSHandlers = vi.fn();
const mockRegisterCacheHandlers = vi.fn();

vi.mock('../../../src/background/messages/handlers/index.js', () => ({
  registerTTSHandlers: mockRegisterTTSHandlers,
  registerCacheHandlers: mockRegisterCacheHandlers,
}));

// Mock StreamHandler
const mockHandleStreamRequest = vi.fn();

vi.mock('../../../src/background/api/StreamHandler.js', () => ({
  handleStreamRequest: mockHandleStreamRequest,
}));

// Mock console.log to suppress output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('service-worker', () => {
  beforeAll(async () => {
    // Import service worker once for all tests
    await import('../../../src/background/service-worker.js');
  });

  describe('initialization', () => {
    it('should register onMessage listener on import', () => {
      // Verify onMessage listener was registered
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(onMessageHandler).toBeDefined();
      expect(typeof onMessageHandler).toBe('function');
    });

    it('should register onConnect listener on import', () => {
      // Verify onConnect listener was registered
      // Note: onConnect may not be called in test environment, but we can verify the handler exists
      expect(onConnectHandler).toBeDefined();
      expect(typeof onConnectHandler).toBe('function');
    });
  });

  describe('onMessage handler behavior', () => {
    it('should handle successful message and send response', async () => {
      const mockSendResponse = vi.fn();
      const mockMessage = { type: 'TEST_MESSAGE', payload: {} };
      const mockSender = { id: 'test-sender' };
      const mockResponse = { success: true, data: 'test-data' };

      mockHandleMessage.mockResolvedValueOnce(mockResponse);

      // Call the handler
      const result = onMessageHandler(mockMessage, mockSender, mockSendResponse);

      // Wait for async promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify handler returned true (to keep channel open)
      expect(result).toBe(true);

      // Verify router.handleMessage was called
      expect(mockHandleMessage).toHaveBeenCalledWith(mockMessage, mockSender);

      // Verify sendResponse was called with the response
      expect(mockSendResponse).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle error in message handler and send error response', async () => {
      const mockSendResponse = vi.fn();
      const mockMessage = { type: 'TEST_MESSAGE', payload: {} };
      const mockSender = { id: 'test-sender' };
      const mockError = new Error('Handler failed');

      mockHandleMessage.mockRejectedValueOnce(mockError);

      const result = onMessageHandler(mockMessage, mockSender, mockSendResponse);

      // Wait for async promise to reject
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify handler returned true
      expect(result).toBe(true);

      // Verify sendResponse was called with error
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: {
          type: 'UNKNOWN_ERROR',
          message: 'Handler failed',
        },
      });
    });

    it('should always return true to keep message channel open', () => {
      const mockSendResponse = vi.fn();
      const mockMessage = { type: 'TEST_MESSAGE', payload: {} };
      const mockSender = { id: 'test-sender' };

      // Mock a successful response for this test
      mockHandleMessage.mockResolvedValueOnce({ success: true });

      const result = onMessageHandler(mockMessage, mockSender, mockSendResponse);

      // Should return true immediately (before async resolution)
      expect(result).toBe(true);
    });
  });

  describe('onConnect handler behavior', () => {
    it('should handle TTS_STREAM port connection', async () => {
      const mockPort = {
        name: 'tts-stream',
        onMessage: {
          addListener: vi.fn(),
        },
        onDisconnect: {
          addListener: vi.fn(),
        },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      // Call the handler
      await onConnectHandler(mockPort);

      // Wait for dynamic import
      await new Promise(resolve => setTimeout(resolve, 20));

      // Verify port listeners were set up
      expect(mockPort.onMessage.addListener).toHaveBeenCalled();
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalled();
    });

    it('should ignore non-TTS_STREAM port connections', async () => {
      const mockPort = {
        name: 'other-port',
        onMessage: {
          addListener: vi.fn(),
        },
        onDisconnect: {
          addListener: vi.fn(),
        },
      };

      await onConnectHandler(mockPort);

      // Should not set up listeners for non-TTS_STREAM ports
      expect(mockPort.onMessage.addListener).not.toHaveBeenCalled();
      expect(mockPort.onDisconnect.addListener).not.toHaveBeenCalled();
    });
  });

  describe('handleStreamConnection behavior', () => {
    it('should handle stream message successfully', async () => {
      mockHandleStreamRequest.mockResolvedValueOnce(undefined);

      const mockPort = {
        name: 'tts-stream',
        onMessage: {
          addListener: vi.fn(),
        },
        onDisconnect: {
          addListener: vi.fn(),
        },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      await onConnectHandler(mockPort);

      // Wait for dynamic import
      await new Promise(resolve => setTimeout(resolve, 20));

      // Get the onMessage handler
      const portMessageHandler = mockPort.onMessage.addListener.mock.calls[0][0];

      // Call with a test message
      const testMessage = { type: 'TTS_SYNTHESIZE_STREAM', payload: { text: 'test' } };
      await portMessageHandler(testMessage);

      // Verify handleStreamRequest was called
      expect(mockHandleStreamRequest).toHaveBeenCalledWith(testMessage, mockPort);

      // Verify no error was sent
      expect(mockPort.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ERROR' })
      );
      expect(mockPort.disconnect).not.toHaveBeenCalled();
    });

    it('should handle stream error and disconnect port', async () => {
      const testError = new Error('Stream failed');
      mockHandleStreamRequest.mockRejectedValueOnce(testError);

      const mockPort = {
        name: 'tts-stream',
        onMessage: {
          addListener: vi.fn(),
        },
        onDisconnect: {
          addListener: vi.fn(),
        },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      await onConnectHandler(mockPort);

      await new Promise(resolve => setTimeout(resolve, 20));

      const portMessageHandler = mockPort.onMessage.addListener.mock.calls[0][0];

      const testMessage = { type: 'TTS_SYNTHESIZE_STREAM', payload: { text: 'test' } };
      await portMessageHandler(testMessage);

      // Verify error was sent to client
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'ERROR',
        error: {
          type: 'STREAM_ERROR',
          message: 'Stream failed',
        },
      });

      // Verify port was disconnected
      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it('should set up disconnect listener', async () => {
      const mockPort = {
        name: 'tts-stream',
        onMessage: {
          addListener: vi.fn(),
        },
        onDisconnect: {
          addListener: vi.fn(),
        },
      };

      await onConnectHandler(mockPort);

      await new Promise(resolve => setTimeout(resolve, 20));

      // Verify onDisconnect listener was registered
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalled();
    });
  });
});
