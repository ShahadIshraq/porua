import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRouter } from '../../../../src/background/messages/MessageRouter.js';
import { MESSAGE_TYPES, ERROR_TYPES } from '../../../../src/background/messages/protocol.js';

describe('MessageRouter', () => {
  let router;

  beforeEach(() => {
    router = new MessageRouter();
  });

  describe('registerHandler', () => {
    it('should register handler for valid message type', () => {
      const handler = vi.fn();
      expect(() => {
        router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, handler);
      }).not.toThrow();
      expect(router.getHandlerCount()).toBe(1);
    });

    it('should register multiple handlers for different message types', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, handler1);
      router.registerHandler(MESSAGE_TYPES.TTS_GET_VOICES, handler2);
      router.registerHandler(MESSAGE_TYPES.TTS_SYNTHESIZE, handler3);

      expect(router.getHandlerCount()).toBe(3);
    });

    it('should allow overwriting existing handler for same message type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, handler1);
      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, handler2);

      expect(router.getHandlerCount()).toBe(1);
    });

    it('should throw on invalid message type', () => {
      expect(() => {
        router.registerHandler('INVALID_TYPE', vi.fn());
      }).toThrow('Invalid message type: INVALID_TYPE');
    });

    it('should throw on non-function handler', () => {
      expect(() => {
        router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, 'not a function');
      }).toThrow('Handler must be a function');
    });

    it('should throw on null handler', () => {
      expect(() => {
        router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, null);
      }).toThrow('Handler must be a function');
    });

    it('should throw on undefined handler', () => {
      expect(() => {
        router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, undefined);
      }).toThrow('Handler must be a function');
    });

    it('should accept handler for all valid message types', () => {
      const handler = vi.fn();

      Object.values(MESSAGE_TYPES).forEach(messageType => {
        expect(() => {
          router.registerHandler(messageType, handler);
        }).not.toThrow();
      });

      expect(router.getHandlerCount()).toBe(Object.values(MESSAGE_TYPES).length);
    });
  });

  describe('handleMessage - success cases', () => {
    it('should call registered handler and return success response', async () => {
      const mockData = { result: 'test data' };
      const mockHandler = vi.fn().mockResolvedValue(mockData);

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: { test: 'payload' },
      }, { id: 'sender-123' });

      expect(mockHandler).toHaveBeenCalledWith({ test: 'payload' }, { id: 'sender-123' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
    });

    it('should call handler with undefined sender if not provided', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(mockHandler).toHaveBeenCalledWith({}, undefined);
    });

    it('should handle message with no payload', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'ok' });

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ status: 'ok' });
    });

    it('should handle handler returning null', async () => {
      const mockHandler = vi.fn().mockResolvedValue(null);

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
    });

    it('should handle handler returning undefined', async () => {
      const mockHandler = vi.fn().mockResolvedValue(undefined);

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(undefined);
    });

    it('should handle handler returning array', async () => {
      const mockData = [1, 2, 3];
      const mockHandler = vi.fn().mockResolvedValue(mockData);

      router.registerHandler(MESSAGE_TYPES.TTS_GET_VOICES, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_GET_VOICES,
        payload: {},
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
    });
  });

  describe('handleMessage - error cases', () => {
    it('should return error for unregistered message type', async () => {
      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.UNKNOWN_ERROR);
      expect(result.error.message).toContain('No handler registered');
      expect(result.error.message).toContain(MESSAGE_TYPES.TTS_CHECK_HEALTH);
    });

    it('should return error for invalid message structure (null)', async () => {
      const result = await router.handleMessage(null);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.UNKNOWN_ERROR);
      expect(result.error.message).toContain('Message must be an object');
    });

    it('should return error for invalid message structure (missing type)', async () => {
      const result = await router.handleMessage({
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.UNKNOWN_ERROR);
      expect(result.error.message).toContain('Message must have a type string');
    });

    it('should return error for unknown message type', async () => {
      const result = await router.handleMessage({
        type: 'UNKNOWN_MESSAGE_TYPE',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.UNKNOWN_ERROR);
      expect(result.error.message).toContain('Unknown message type');
    });

    it('should return error when handler throws', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.UNKNOWN_ERROR);
      expect(result.error.message).toBe('Handler failed');
      expect(result.error.details.stack).toBeDefined();
    });

    it('should include error stack in response', async () => {
      const testError = new Error('Test error');
      const mockHandler = vi.fn().mockRejectedValue(testError);

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result.error.details.stack).toBe(testError.stack);
    });
  });

  describe('handleMessage - error type detection', () => {
    it('should detect ValidationError by error name', async () => {
      const validationError = new Error('Invalid payload');
      validationError.name = 'ValidationError';

      const mockHandler = vi.fn().mockRejectedValue(validationError);
      router.registerHandler(MESSAGE_TYPES.TTS_SYNTHESIZE, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_SYNTHESIZE,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.VALIDATION_ERROR);
    });

    it('should detect ValidationError by message containing "payload"', async () => {
      const error = new Error('Invalid payload structure');

      const mockHandler = vi.fn().mockRejectedValue(error);
      router.registerHandler(MESSAGE_TYPES.TTS_SYNTHESIZE, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_SYNTHESIZE,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.VALIDATION_ERROR);
    });

    it('should detect NetworkError from TypeError with "fetch"', async () => {
      const networkError = new TypeError('fetch failed');

      const mockHandler = vi.fn().mockRejectedValue(networkError);
      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.NETWORK_ERROR);
    });

    it('should detect API error from error with status property', async () => {
      const apiError = new Error('API request failed');
      apiError.status = 500;

      const mockHandler = vi.fn().mockRejectedValue(apiError);
      router.registerHandler(MESSAGE_TYPES.TTS_SYNTHESIZE, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_SYNTHESIZE,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.API_ERROR);
      expect(result.error.status).toBe(500);
    });

    it('should detect API error with 404 status', async () => {
      const apiError = new Error('Not found');
      apiError.status = 404;

      const mockHandler = vi.fn().mockRejectedValue(apiError);
      router.registerHandler(MESSAGE_TYPES.TTS_GET_VOICES, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_GET_VOICES,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.API_ERROR);
      expect(result.error.status).toBe(404);
    });

    it('should default to UNKNOWN_ERROR for unrecognized errors', async () => {
      const unknownError = new Error('Something went wrong');

      const mockHandler = vi.fn().mockRejectedValue(unknownError);
      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, mockHandler);

      const result = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPES.UNKNOWN_ERROR);
    });
  });

  describe('getHandlerCount', () => {
    it('should return 0 for new router', () => {
      expect(router.getHandlerCount()).toBe(0);
    });

    it('should return correct count after registering handlers', () => {
      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, vi.fn());
      expect(router.getHandlerCount()).toBe(1);

      router.registerHandler(MESSAGE_TYPES.TTS_GET_VOICES, vi.fn());
      expect(router.getHandlerCount()).toBe(2);

      router.registerHandler(MESSAGE_TYPES.TTS_SYNTHESIZE, vi.fn());
      expect(router.getHandlerCount()).toBe(3);
    });

    it('should not change count when overwriting handler', () => {
      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, vi.fn());
      expect(router.getHandlerCount()).toBe(1);

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, vi.fn());
      expect(router.getHandlerCount()).toBe(1);
    });
  });

  describe('integration tests', () => {
    it('should handle multiple messages to different handlers', async () => {
      const handler1 = vi.fn().mockResolvedValue({ health: 'ok' });
      const handler2 = vi.fn().mockResolvedValue({ voices: [] });

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, handler1);
      router.registerHandler(MESSAGE_TYPES.TTS_GET_VOICES, handler2);

      const result1 = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      const result2 = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_GET_VOICES,
        payload: {},
      });

      expect(result1.success).toBe(true);
      expect(result1.data).toEqual({ health: 'ok' });
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual({ voices: [] });
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle sequential messages to same handler', async () => {
      const handler = vi.fn()
        .mockResolvedValueOnce({ attempt: 1 })
        .mockResolvedValueOnce({ attempt: 2 });

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, handler);

      const result1 = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      const result2 = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result1.data).toEqual({ attempt: 1 });
      expect(result2.data).toEqual({ attempt: 2 });
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should isolate errors between messages', async () => {
      const handler = vi.fn()
        .mockRejectedValueOnce(new Error('First call failed'))
        .mockResolvedValueOnce({ success: true });

      router.registerHandler(MESSAGE_TYPES.TTS_CHECK_HEALTH, handler);

      const result1 = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      const result2 = await router.handleMessage({
        type: MESSAGE_TYPES.TTS_CHECK_HEALTH,
        payload: {},
      });

      expect(result1.success).toBe(false);
      expect(result1.error.message).toBe('First call failed');
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual({ success: true });
    });
  });
});
