import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTSHandlers } from '../../../../../src/background/messages/handlers/TTSHandlers.js';

// Mock TTSService
vi.mock('../../../../../src/shared/services/TTSService.js', () => {
  const MockTTSService = vi.fn(() => ({
    checkHealth: vi.fn(),
    getVoices: vi.fn(),
    fetchVoiceSample: vi.fn(),
    synthesize: vi.fn(),
  }));

  return {
    TTSService: MockTTSService,
  };
});

describe('TTSHandlers', () => {
  let handlers;
  let mockTTSService;

  beforeEach(async () => {
    const { TTSService } = await import(
      '../../../../../src/shared/services/TTSService.js'
    );
    handlers = new TTSHandlers();
    mockTTSService = handlers.ttsService;
  });

  describe('handleCheckHealth', () => {
    it('should return health status from TTSService', async () => {
      const expectedHealth = { status: 'ok', version: '1.0' };
      mockTTSService.checkHealth.mockResolvedValue(expectedHealth);

      const result = await handlers.handleCheckHealth();

      expect(result).toEqual(expectedHealth);
      expect(mockTTSService.checkHealth).toHaveBeenCalled();
    });

    it('should propagate errors from TTSService', async () => {
      mockTTSService.checkHealth.mockRejectedValue(
        new Error('Connection failed')
      );

      await expect(handlers.handleCheckHealth()).rejects.toThrow(
        'Connection failed'
      );
    });
  });

  describe('handleGetVoices', () => {
    it('should return voices from TTSService', async () => {
      const expectedVoices = {
        voices: [
          { id: 'voice1', name: 'Voice 1' },
          { id: 'voice2', name: 'Voice 2' },
        ],
      };
      mockTTSService.getVoices.mockResolvedValue(expectedVoices);

      const result = await handlers.handleGetVoices();

      expect(result).toEqual(expectedVoices);
      expect(mockTTSService.getVoices).toHaveBeenCalled();
    });
  });

  describe('handleFetchVoiceSample', () => {
    it('should fetch voice sample and convert to ArrayBuffer', async () => {
      const mockArrayBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
      const mockBlob = {
        type: 'audio/wav',
        arrayBuffer: async () => mockArrayBuffer,
      };
      mockTTSService.fetchVoiceSample.mockResolvedValue(mockBlob);

      const result = await handlers.handleFetchVoiceSample({
        voiceId: 'voice1',
      });

      expect(mockTTSService.fetchVoiceSample).toHaveBeenCalledWith('voice1');
      expect(result.audioData).toBeInstanceOf(ArrayBuffer);
      expect(result.audioData.byteLength).toBe(4);
      expect(result.contentType).toBe('audio/wav');
    });

    it('should default to audio/wav if blob has no type', async () => {
      const mockArrayBuffer = new Uint8Array([1, 2]).buffer;
      const mockBlob = {
        type: '',
        arrayBuffer: async () => mockArrayBuffer,
      };
      mockTTSService.fetchVoiceSample.mockResolvedValue(mockBlob);

      const result = await handlers.handleFetchVoiceSample({
        voiceId: 'voice1',
      });

      expect(result.contentType).toBe('audio/wav');
    });

    it('should validate payload has voiceId', async () => {
      await expect(handlers.handleFetchVoiceSample({})).rejects.toThrow();
    });
  });

  describe('handleSynthesize', () => {
    it('should synthesize text and convert to ArrayBuffer', async () => {
      const mockArrayBuffer = new Uint8Array([5, 6, 7, 8]).buffer;
      const mockBlob = {
        type: 'audio/wav',
        arrayBuffer: async () => mockArrayBuffer,
      };
      const mockResponse = {
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        status: 200,
        blob: async () => mockBlob,
      };
      mockTTSService.synthesize.mockResolvedValue(mockResponse);

      const result = await handlers.handleSynthesize({
        text: 'Hello world',
        voice: 'voice1',
        speed: 1.2,
      });

      expect(mockTTSService.synthesize).toHaveBeenCalledWith('Hello world', {
        voice: 'voice1',
        speed: 1.2,
      });
      expect(result.audioData).toBeInstanceOf(ArrayBuffer);
      expect(result.audioData.byteLength).toBe(4);
      expect(result.contentType).toBe('audio/wav');
    });

    it('should validate payload has text', async () => {
      await expect(
        handlers.handleSynthesize({ voice: 'voice1' })
      ).rejects.toThrow();
    });

    it('should allow optional voice and speed', async () => {
      const mockArrayBuffer = new Uint8Array([1]).buffer;
      const mockBlob = {
        type: 'audio/wav',
        arrayBuffer: async () => mockArrayBuffer,
      };
      const mockResponse = {
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        status: 200,
        blob: async () => mockBlob,
      };
      mockTTSService.synthesize.mockResolvedValue(mockResponse);

      const result = await handlers.handleSynthesize({ text: 'test' });

      expect(mockTTSService.synthesize).toHaveBeenCalledWith('test', {
        voice: undefined,
        speed: undefined,
      });
      expect(result.audioData).toBeInstanceOf(ArrayBuffer);
    });
  });
});
