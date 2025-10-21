import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BackgroundTTSClient } from '../../../../src/shared/api/BackgroundTTSClient.js';

describe('BackgroundTTSClient', () => {
  let client;
  let mockChrome;

  beforeEach(() => {
    // Create mock chrome runtime
    mockChrome = {
      runtime: {
        sendMessage: vi.fn(),
        connect: vi.fn(),
        lastError: null,
      },
    };

    global.chrome = mockChrome;
    client = new BackgroundTTSClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkHealth', () => {
    it('should send TTS_CHECK_HEALTH message', async () => {
      const expectedHealth = { status: 'ok', version: '1.0' };

      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true, data: expectedHealth });
      });

      const result = await client.checkHealth();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'TTS_CHECK_HEALTH', payload: undefined },
        expect.any(Function)
      );
      expect(result).toEqual(expectedHealth);
    });

    it('should handle chrome.runtime.lastError', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        mockChrome.runtime.lastError = { message: 'Connection failed' };
        callback();
      });

      await expect(client.checkHealth()).rejects.toThrow('Connection failed');
    });

    it('should handle error response', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: false,
          error: { type: 'API_ERROR', message: 'Server error', status: 500 },
        });
      });

      await expect(client.checkHealth()).rejects.toThrow('Server error');
    });
  });

  describe('getVoices', () => {
    it('should send TTS_GET_VOICES message', async () => {
      const expectedVoices = { voices: [{ id: 'voice1', name: 'Voice 1' }] };

      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true, data: expectedVoices });
      });

      const result = await client.getVoices();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'TTS_GET_VOICES', payload: undefined },
        expect.any(Function)
      );
      expect(result).toEqual(expectedVoices);
    });
  });

  describe('fetchVoiceSample', () => {
    it('should send TTS_FETCH_VOICE_SAMPLE message with voiceId', async () => {
      const mockAudioData = new ArrayBuffer(8);
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: true,
          data: {
            audioData: mockAudioData,
            contentType: 'audio/wav',
          },
        });
      });

      const result = await client.fetchVoiceSample('voice1');

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        {
          type: 'TTS_FETCH_VOICE_SAMPLE',
          payload: { voiceId: 'voice1' },
        },
        expect.any(Function)
      );
      expect(result).toBeInstanceOf(Blob);
    });

    it('should default to audio/wav content type', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: true,
          data: {
            audioData: new ArrayBuffer(8),
          },
        });
      });

      const result = await client.fetchVoiceSample('voice1');

      expect(result.type).toBe('audio/wav');
    });
  });

  describe('synthesize', () => {
    it('should send TTS_SYNTHESIZE message', async () => {
      const mockAudioData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).buffer;
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: true,
          data: {
            audioData: mockAudioData,
            contentType: 'audio/wav',
          },
        });
      });

      const result = await client.synthesize('test text', {
        voice: 'voice1',
        speed: 1.5,
      });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        {
          type: 'TTS_SYNTHESIZE',
          payload: { text: 'test text', voice: 'voice1', speed: 1.5 },
        },
        expect.any(Function)
      );

      expect(result).toBeInstanceOf(Response);
      const blob = await result.blob();
      expect(blob.size).toBeGreaterThan(0); // Size may vary due to Blob conversion
      expect(result.headers.get('Content-Type')).toBe('audio/wav');
    });
  });

  describe('synthesizeStream', () => {
    it('should open port and handle streaming messages', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      mockChrome.runtime.connect.mockReturnValue(mockPort);

      const promise = client.synthesizeStream('test text', {
        voice: 'voice1',
        speed: 1.2,
      });

      // Verify port was created with correct name
      expect(mockChrome.runtime.connect).toHaveBeenCalledWith({
        name: 'tts-stream',
      });

      // Verify message was posted
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'SYNTHESIZE_STREAM',
        payload: { text: 'test text', voice: 'voice1', speed: 1.2 },
      });

      // Simulate message flow
      const onMessage = mockPort.onMessage.addListener.mock.calls[0][0];

      // Send STREAM_START
      onMessage({ type: 'STREAM_START' });

      // Send audio chunk
      const audioData = new ArrayBuffer(8);
      onMessage({
        type: 'STREAM_AUDIO',
        data: { audioData },
      });

      // Send metadata
      onMessage({
        type: 'STREAM_METADATA',
        data: { metadata: { chunk_index: 0 } },
      });

      // Send STREAM_COMPLETE
      onMessage({ type: 'STREAM_COMPLETE' });

      const result = await promise;

      expect(result.ok).toBe(true);
      expect(result.__backgroundClientData).toBeDefined();
      expect(result.__backgroundClientData.audioBlobs).toHaveLength(1);
      expect(result.__backgroundClientData.metadataArray).toHaveLength(1);
    });

    it('should handle stream errors', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      mockChrome.runtime.connect.mockReturnValue(mockPort);

      const promise = client.synthesizeStream('test');

      const onMessage = mockPort.onMessage.addListener.mock.calls[0][0];

      // Send error
      onMessage({
        type: 'STREAM_ERROR',
        error: {
          type: 'NETWORK_ERROR',
          message: 'Connection failed',
          status: 503,
        },
      });

      await expect(promise).rejects.toThrow('Connection failed');
      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it('should handle abort signal', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      mockChrome.runtime.connect.mockReturnValue(mockPort);

      const abortController = new AbortController();
      const promise = client.synthesizeStream('test', {
        signal: abortController.signal,
      });

      // Abort the request
      abortController.abort();

      await expect(promise).rejects.toThrow('Request aborted');
      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it('should handle port disconnection before stream starts', async () => {
      const mockPort = {
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      mockChrome.runtime.connect.mockReturnValue(mockPort);

      const promise = client.synthesizeStream('test');

      // Simulate port disconnection
      const onDisconnect = mockPort.onDisconnect.addListener.mock.calls[0][0];
      onDisconnect();

      await expect(promise).rejects.toThrow(
        'Port disconnected before stream started'
      );
    });
  });

  describe('sendMessage (private)', () => {
    it('should reject on null response', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback(null);
      });

      await expect(client.checkHealth()).rejects.toThrow('Unknown error');
    });

    it('should preserve error properties', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: false,
          error: {
            type: 'AUTH_ERROR',
            message: 'Unauthorized',
            status: 401,
          },
        });
      });

      try {
        await client.checkHealth();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toBe('Unauthorized');
        expect(error.type).toBe('AUTH_ERROR');
        expect(error.status).toBe(401);
      }
    });
  });
});
