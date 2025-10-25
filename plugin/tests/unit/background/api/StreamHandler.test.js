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

// Mock Blob with arrayBuffer() method for tests
global.Blob = class Blob {
  constructor(parts, options) {
    this.parts = parts || [];
    this.type = options?.type || '';
  }

  async arrayBuffer() {
    // Concatenate all parts into a single ArrayBuffer
    // Handle both Uint8Array and ArrayBuffer parts
    let totalLength = 0;
    const normalizedParts = [];

    for (const part of this.parts) {
      if (part instanceof Uint8Array) {
        normalizedParts.push(part);
        totalLength += part.length;
      } else if (part instanceof ArrayBuffer) {
        const uint8 = new Uint8Array(part);
        normalizedParts.push(uint8);
        totalLength += uint8.length;
      } else if (part instanceof Blob) {
        // Handle nested Blob
        const buffer = await part.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        normalizedParts.push(uint8);
        totalLength += uint8.length;
      } else if (typeof part === 'object' && part.buffer) {
        // Handle TypedArray-like objects
        const uint8 = new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
        normalizedParts.push(uint8);
        totalLength += uint8.length;
      }
    }

    const buffer = new ArrayBuffer(totalLength);
    const view = new Uint8Array(buffer);
    let offset = 0;
    for (const part of normalizedParts) {
      view.set(part, offset);
      offset += part.length;
    }
    return buffer;
  }
};

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

      // Verify parts were processed and combined
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_START',
        data: {
          chunkCount: 1, // Combined into single chunk
          contentType: 'audio/wav',
        },
      });

      // Should send combined metadata (not individual chunk metadata)
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_METADATA',
        data: {
          metadata: {
            chunk_index: 0,
            phrases: [{ text: 'Hello', start_ms: 0, duration_ms: 500 }],
            start_offset_ms: 0,
            duration_ms: 500,
          },
        },
      });

      // Should send combined audio
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

      // Verify chunks combined into single chunk
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_START',
        data: {
          chunkCount: 1, // Chunks combined into one
          contentType: 'audio/wav',
        },
      });

      // Verify combined metadata sent (all phrases merged)
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_METADATA',
        data: {
          metadata: {
            chunk_index: 0,
            phrases: [], // Empty from both chunks
            start_offset_ms: 0,
            duration_ms: 200, // 100 + 100
          },
        },
      });

      // Verify combined audio sent (all audio concatenated)
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_AUDIO',
        data: {
          audioData: [1, 2, 3, 4], // Concatenated from [1,2] and [3,4]
          contentType: 'audio/wav',
        },
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_COMPLETE',
      });
    });

    it('should handle out-of-order chunks and fix phrase timings', async () => {
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

      // Simulate chunks arriving OUT OF ORDER: 2, 0, 1
      const mockParts = [
        // Chunk 2 arrives first
        {
          type: 'metadata',
          metadata: {
            chunk_index: 2,
            phrases: [
              { text: 'third', start_ms: 0, duration_ms: 100 }
            ],
            start_offset_ms: 200,
            duration_ms: 100
          }
        },
        { type: 'audio', audioData: new Uint8Array([5, 6]) },

        // Chunk 0 arrives second
        {
          type: 'metadata',
          metadata: {
            chunk_index: 0,
            phrases: [
              { text: 'first', start_ms: 0, duration_ms: 100 }
            ],
            start_offset_ms: 0,
            duration_ms: 100
          }
        },
        { type: 'audio', audioData: new Uint8Array([1, 2]) },

        // Chunk 1 arrives third
        {
          type: 'metadata',
          metadata: {
            chunk_index: 1,
            phrases: [
              { text: 'second', start_ms: 0, duration_ms: 100 }
            ],
            start_offset_ms: 100,
            duration_ms: 100
          }
        },
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

      // Verify combined metadata has phrases in correct order with adjusted timings
      const metadataCall = mockPort.postMessage.mock.calls.find(
        call => call[0].type === 'STREAM_METADATA'
      );

      expect(metadataCall[0].data.metadata.phrases).toHaveLength(3);

      // First phrase should start at 0
      expect(metadataCall[0].data.metadata.phrases[0].text).toBe('first');
      expect(metadataCall[0].data.metadata.phrases[0].start_ms).toBe(0);

      // Second phrase should start at 100 (after first chunk)
      expect(metadataCall[0].data.metadata.phrases[1].text).toBe('second');
      expect(metadataCall[0].data.metadata.phrases[1].start_ms).toBe(100);

      // Third phrase should start at 200 (after first two chunks)
      expect(metadataCall[0].data.metadata.phrases[2].text).toBe('third');
      expect(metadataCall[0].data.metadata.phrases[2].start_ms).toBe(200);
    });

    it('should handle WAV files with non-standard header sizes', async () => {
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

      // Create a WAV file with 68-byte header (non-standard)
      // RIFF header (12 bytes) + fmt chunk (24 bytes) + extra chunk (24 bytes) + data chunk header (8 bytes)
      const wavHeader = new Uint8Array(68);

      // RIFF header
      wavHeader.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
      wavHeader.set([0x00, 0x00, 0x00, 0x00], 4); // file size (will be updated)
      wavHeader.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

      // fmt chunk (24 bytes total: 8 header + 16 data)
      wavHeader.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
      new DataView(wavHeader.buffer).setUint32(16, 16, true); // chunk size = 16

      // Extra chunk (24 bytes total: 8 header + 16 data)
      wavHeader.set([0x65, 0x78, 0x74, 0x72], 36); // "extr"
      new DataView(wavHeader.buffer).setUint32(40, 16, true); // chunk size = 16

      // data chunk header (8 bytes)
      wavHeader.set([0x64, 0x61, 0x74, 0x61], 60); // "data"
      new DataView(wavHeader.buffer).setUint32(64, 4, true); // data size = 4

      // PCM data (4 bytes)
      const pcmData = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

      // Combine header and data
      const chunk1 = new Uint8Array(72);
      chunk1.set(wavHeader, 0);
      chunk1.set(pcmData, 68);

      // Second chunk with same header structure
      const chunk2 = new Uint8Array(72);
      chunk2.set(wavHeader, 0);
      chunk2.set([0x05, 0x06, 0x07, 0x08], 68);

      const mockParts = [
        { type: 'metadata', metadata: { chunk_index: 0, phrases: [], start_offset_ms: 0, duration_ms: 100 } },
        { type: 'audio', audioData: chunk1 },
        { type: 'metadata', metadata: { chunk_index: 1, phrases: [], start_offset_ms: 100, duration_ms: 100 } },
        { type: 'audio', audioData: chunk2 },
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      // Verify audio was properly concatenated (header from first chunk + PCM from both)
      const audioCall = mockPort.postMessage.mock.calls.find(
        call => call[0].type === 'STREAM_AUDIO'
      );

      // Should be: 68 bytes (header) + 4 bytes (chunk1 PCM) + 4 bytes (chunk2 PCM) = 76 bytes
      expect(audioCall[0].data.audioData).toHaveLength(76);

      // Verify header is preserved from first chunk
      expect(audioCall[0].data.audioData.slice(0, 4)).toEqual([0x52, 0x49, 0x46, 0x46]); // "RIFF"

      // Verify PCM data from both chunks is concatenated after header
      expect(audioCall[0].data.audioData.slice(68, 72)).toEqual([0x01, 0x02, 0x03, 0x04]); // chunk1 PCM
      expect(audioCall[0].data.audioData.slice(72, 76)).toEqual([0x05, 0x06, 0x07, 0x08]); // chunk2 PCM
    });

    it('should handle empty audio chunks gracefully', async () => {
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

      // No audio chunks
      const mockParts = [];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      await handleStreamRequest(
        {
          type: 'TTS_SYNTHESIZE_STREAM',
          payload: { text: 'Test', voice: 'v1', speed: 1.0 },
        },
        mockPort
      );

      // Should send empty stream
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_START',
        data: {
          chunkCount: 0,
          contentType: 'audio/wav',
        },
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'STREAM_COMPLETE',
      });
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
