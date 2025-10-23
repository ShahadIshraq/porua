import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleStreamRequest } from '../../../../src/background/api/StreamHandler.js';

// Mock all dependencies
vi.mock('../../../../src/background/messages/protocol.js', () => ({
  validateSynthesizePayload: vi.fn(),
  ERROR_TYPES: {
    STREAM_ERROR: 'STREAM_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    API_ERROR: 'API_ERROR',
  },
}));

vi.mock('../../../../src/shared/services/TTSService.js', () => ({
  TTSService: vi.fn(),
}));

vi.mock('../../../../src/content/audio/StreamParser.js', () => ({
  StreamParser: {
    parseMultipartStream: vi.fn(),
  },
}));

vi.mock('../../../../src/shared/api/ResponseHandler.js', () => ({
  validateMultipartResponse: vi.fn(),
  extractMultipartBoundary: vi.fn(),
}));

vi.mock('../../../../src/background/cache/CacheService.js', () => ({
  CacheService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../../../../src/shared/storage/SettingsStore.js', () => ({
  SettingsStore: {
    get: vi.fn(),
  },
}));

describe('StreamHandler', () => {
  let mockPort;
  let mockCache;
  let mockTTSService;
  let validateSynthesizePayload;
  let CacheService;
  let SettingsStore;
  let TTSService;
  let StreamParser;
  let validateMultipartResponse;
  let extractMultipartBoundary;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get mocked modules
    const protocol = await import('../../../../src/background/messages/protocol.js');
    validateSynthesizePayload = protocol.validateSynthesizePayload;

    const cacheModule = await import('../../../../src/background/cache/CacheService.js');
    CacheService = cacheModule.CacheService;

    const settingsModule = await import('../../../../src/shared/storage/SettingsStore.js');
    SettingsStore = settingsModule.SettingsStore;

    const ttsModule = await import('../../../../src/shared/services/TTSService.js');
    TTSService = ttsModule.TTSService;

    const parserModule = await import('../../../../src/content/audio/StreamParser.js');
    StreamParser = parserModule.StreamParser;

    const responseModule = await import('../../../../src/shared/api/ResponseHandler.js');
    validateMultipartResponse = responseModule.validateMultipartResponse;
    extractMultipartBoundary = responseModule.extractMultipartBoundary;

    // Mock port
    mockPort = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    };

    // Mock cache service
    mockCache = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    };

    // Mock TTS service
    mockTTSService = {
      synthesizeStream: vi.fn(),
    };

    // Setup default mocks
    CacheService.getInstance.mockResolvedValue(mockCache);
    SettingsStore.get.mockResolvedValue({
      selectedVoiceId: 'default-voice',
      speed: 1.0,
    });
    TTSService.mockImplementation(() => mockTTSService);
    validateSynthesizePayload.mockImplementation(() => true);
  });

  describe('settings defaults', () => {
    it('should apply default voice and speed from settings when not in payload', async () => {
      mockCache.get.mockResolvedValue(null); // Cache miss to trigger TTS call

      // Mock successful TTS response
      const mockResponse = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'Content-Type') return 'multipart/mixed; boundary=test-boundary';
            return null;
          }),
        },
        body: {
          getReader: vi.fn(() => ({
            read: vi.fn().mockResolvedValue({ done: true }),
          })),
        },
      };

      mockTTSService.synthesizeStream.mockResolvedValue(mockResponse);
      extractMultipartBoundary.mockReturnValue('test-boundary');
      StreamParser.parseMultipartStream.mockResolvedValue([]);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test text' }, // No voice or speed specified
        },
        mockPort
      );

      // Verify TTS service was called with default values from settings
      expect(mockTTSService.synthesizeStream).toHaveBeenCalledWith('Test text', {
        voice: 'default-voice',
        speed: 1.0,
      });
    });

    it('should override defaults when voice and speed are provided in payload', async () => {
      mockCache.get.mockResolvedValue(null);

      const mockResponse = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'Content-Type') return 'multipart/mixed; boundary=boundary';
            return null;
          }),
        },
        body: {
          getReader: vi.fn(() => ({ read: vi.fn().mockResolvedValue({ done: true }) })),
        },
      };

      mockTTSService.synthesizeStream.mockResolvedValue(mockResponse);
      extractMultipartBoundary.mockReturnValue('boundary');
      StreamParser.parseMultipartStream.mockResolvedValue([]);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'custom-voice', speed: 1.8 },
        },
        mockPort
      );

      expect(mockTTSService.synthesizeStream).toHaveBeenCalledWith('Test', {
        voice: 'custom-voice',
        speed: 1.8,
      });
    });
  });

  describe('streaming from TTS server', () => {
    it('should process and forward stream parts from server', async () => {
      mockCache.get.mockResolvedValue(null); // Cache miss

      // Mock TTS response
      const mockResponse = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'Content-Type') return 'multipart/mixed; boundary=test-boundary';
            return null;
          }),
        },
        body: {
          getReader: vi.fn(() => ({
            read: vi.fn().mockResolvedValue({ done: true }),
          })),
        },
      };

      mockTTSService.synthesizeStream.mockResolvedValue(mockResponse);
      extractMultipartBoundary.mockReturnValue('test-boundary');

      // Mock parsed stream parts
      const mockParts = [
        {
          type: 'metadata',
          metadata: {
            chunk_index: 0,
            phrases: [{ text: 'Hello', start_ms: 0, duration_ms: 500 }],
            start_offset_ms: 0,
            duration_ms: 500,
          },
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3, 4]),
        },
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Hello', voice: 'voice1', speed: 1.5 },
        },
        mockPort
      );

      // Verify response validation
      expect(validateMultipartResponse).toHaveBeenCalledWith(mockResponse);
      expect(extractMultipartBoundary).toHaveBeenCalledWith(mockResponse);

      // Verify parts were processed
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_START',
        data: {
          chunkCount: 1, // 1 audio part
          contentType: 'multipart/mixed; boundary=test-boundary',
        },
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_METADATA',
        data: {
          metadata: mockParts[0].metadata,
        },
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_AUDIO',
        data: {
          audioData: [1, 2, 3, 4],
          contentType: 'audio/wav',
        },
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_COMPLETE',
      });
    });

    it('should handle multiple audio and metadata chunks', async () => {
      mockCache.get.mockResolvedValue(null);

      const mockResponse = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'Content-Type') return 'multipart/mixed; boundary=boundary';
            return null;
          }),
        },
        body: {
          getReader: vi.fn(() => ({ read: vi.fn().mockResolvedValue({ done: true }) })),
        },
      };

      mockTTSService.synthesizeStream.mockResolvedValue(mockResponse);
      extractMultipartBoundary.mockReturnValue('boundary');

      const mockParts = [
        { type: 'metadata', metadata: { chunk_index: 0, phrases: [], start_offset_ms: 0, duration_ms: 100 } },
        { type: 'audio', audioData: new Uint8Array([1, 2]) },
        { type: 'metadata', metadata: { chunk_index: 1, phrases: [], start_offset_ms: 100, duration_ms: 100 } },
        { type: 'audio', audioData: new Uint8Array([3, 4]) },
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      // Verify 2 audio chunks reported
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_START',
        data: {
          chunkCount: 2,
          contentType: 'multipart/mixed; boundary=boundary',
        },
      });

      // Verify both metadata and audio sent
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'STREAM_METADATA' })
      );
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'STREAM_AUDIO' })
      );
    });
  });

  describe('error handling', () => {
    it('should send error message when validation fails', async () => {
      validateSynthesizePayload.mockImplementation(() => {
        throw new Error('Invalid payload');
      });

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: '' },
        },
        mockPort
      );

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_ERROR',
        error: {
          type: 'STREAM_ERROR',
          message: 'Invalid payload',
          status: undefined,
        },
      });

      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it('should detect network error from fetch failure', async () => {
      mockCache.get.mockResolvedValue(null);

      const fetchError = new Error('fetch failed to connect');
      mockTTSService.synthesizeStream.mockRejectedValue(fetchError);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_ERROR',
        error: {
          type: 'NETWORK_ERROR',
          message: 'fetch failed to connect',
          status: undefined,
        },
      });

      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it('should detect API error from status property', async () => {
      mockCache.get.mockResolvedValue(null);

      const apiError = new Error('API request failed');
      apiError.status = 500;
      mockTTSService.synthesizeStream.mockRejectedValue(apiError);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_ERROR',
        error: {
          type: 'API_ERROR',
          message: 'API request failed',
          status: 500,
        },
      });

      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it('should handle AbortError by disconnecting without error message', async () => {
      mockCache.get.mockResolvedValue(null);

      const abortError = new Error('Request aborted');
      abortError.name = 'AbortError';
      mockTTSService.synthesizeStream.mockRejectedValue(abortError);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      // Should disconnect without sending error
      expect(mockPort.disconnect).toHaveBeenCalled();
      expect(mockPort.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'STREAM_ERROR' })
      );
    });

    it('should continue without cache if cache initialization fails', async () => {
      // Mock cache initialization failure
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      CacheService.getInstance.mockRejectedValue(new Error('Cache init failed'));

      mockCache.get.mockResolvedValue(null);

      const mockResponse = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'Content-Type') return 'multipart/mixed; boundary=boundary';
            return null;
          }),
        },
        body: {
          getReader: vi.fn(() => ({ read: vi.fn().mockResolvedValue({ done: true }) })),
        },
      };

      mockTTSService.synthesizeStream.mockResolvedValue(mockResponse);
      extractMultipartBoundary.mockReturnValue('boundary');
      StreamParser.parseMultipartStream.mockResolvedValue([]);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      // Should still proceed with TTS request
      expect(mockTTSService.synthesizeStream).toHaveBeenCalled();
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'STREAM_COMPLETE' })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle cache storage failure gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockRejectedValue(new Error('Storage quota exceeded'));

      const mockResponse = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'Content-Type') return 'multipart/mixed; boundary=boundary';
            return null;
          }),
        },
        body: {
          getReader: vi.fn(() => ({ read: vi.fn().mockResolvedValue({ done: true }) })),
        },
      };

      mockTTSService.synthesizeStream.mockResolvedValue(mockResponse);
      extractMultipartBoundary.mockReturnValue('boundary');
      StreamParser.parseMultipartStream.mockResolvedValue([
        { type: 'metadata', metadata: { chunk_index: 0, phrases: [], start_offset_ms: 0, duration_ms: 100 } },
        { type: 'audio', audioData: new Uint8Array([1, 2]) },
      ]);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      // Should complete successfully despite cache failure
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_COMPLETE',
      });

      // Give the async cache.set promise time to reject
      await new Promise(resolve => setTimeout(resolve, 10));

      consoleWarnSpy.mockRestore();
    });
  });

  describe('message validation', () => {
    it('should validate payload before processing', async () => {
      mockCache.get.mockResolvedValue(null);

      const mockResponse = {
        headers: {
          get: vi.fn((key) => {
            if (key === 'Content-Type') return 'multipart/mixed; boundary=boundary';
            return null;
          }),
        },
        body: {
          getReader: vi.fn(() => ({ read: vi.fn().mockResolvedValue({ done: true }) })),
        },
      };

      mockTTSService.synthesizeStream.mockResolvedValue(mockResponse);
      extractMultipartBoundary.mockReturnValue('boundary');
      StreamParser.parseMultipartStream.mockResolvedValue([]);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Valid text', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      expect(validateSynthesizePayload).toHaveBeenCalledWith({
        text: 'Valid text',
        voice: 'v1',
        speed: 1.0,
      });
    });
  });
});
