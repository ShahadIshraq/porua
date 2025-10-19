import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTSService } from '../../src/shared/services/TTSService.js';
import { SettingsStore } from '../../src/shared/storage/SettingsStore.js';
import { AudioCacheManager } from '../../src/shared/cache/AudioCacheManager.js';

/**
 * Integration tests for TTSService + TTSClient
 * These tests verify that the service and client layers work together correctly,
 * particularly ensuring Response objects are properly passed and converted.
 */

// Mock dependencies
vi.mock('../../src/shared/storage/SettingsStore.js');
vi.mock('../../src/shared/cache/AudioCacheManager.js');

// Mock global fetch
global.fetch = vi.fn();

describe('TTSService + TTSClient Integration', () => {
  let service;
  let mockSettings;
  let mockCacheManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettings = {
      apiUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      selectedVoiceId: 'bf_lily',
      selectedVoiceName: 'Lily',
      speed: 1.0
    };

    // Mock AudioCacheManager
    mockCacheManager = {
      get: vi.fn().mockResolvedValue(null), // Cache miss by default
      set: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockResolvedValue(false),
      clearAll: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockReturnValue({
        hitRate: '0%',
        totalSize: '0 B',
        bytesSaved: '0 B'
      }),
      shutdown: vi.fn().mockResolvedValue(undefined)
    };

    AudioCacheManager.mockImplementation(() => mockCacheManager);

    SettingsStore.get = vi.fn().mockResolvedValue(mockSettings);
    SettingsStore.getSelectedVoice = vi.fn().mockResolvedValue({
      id: 'bf_lily',
      name: 'Lily'
    });

    service = new TTSService();
  });

  describe('checkHealth integration', () => {
    it('should successfully call client and convert response to JSON', async () => {
      const healthData = { status: 'healthy', version: '1.0.0' };
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(healthData)
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.checkHealth();

      expect(result).toEqual(healthData);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.any(Object)
      );
    });

    it('should handle invalid content type', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
        json: vi.fn()
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(service.checkHealth()).rejects.toThrow(/Invalid Content-Type/);
    });
  });

  describe('getVoices integration', () => {
    it('should successfully call client and convert response to JSON', async () => {
      const voicesData = {
        voices: [
          { id: 'af_nova', name: 'Nova', gender: 'Female', language: 'AmericanEnglish' },
          { id: 'bf_lily', name: 'Lily', gender: 'Female', language: 'BritishEnglish' }
        ]
      };
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(voicesData)
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.getVoices();

      expect(result).toEqual(voicesData);
      expect(result.voices).toHaveLength(2);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/voices',
        expect.any(Object)
      );
    });

    it('should handle invalid content type', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        json: vi.fn()
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(service.getVoices()).rejects.toThrow(/Invalid Content-Type/);
    });
  });

  describe('fetchVoiceSample integration', () => {
    it('should successfully call client and convert response to Blob with audio/wav', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.fetchVoiceSample('af_nova');

      expect(result).toBe(mockBlob);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/samples/af_nova.wav',
        expect.any(Object)
      );
    });

    it('should successfully handle application/octet-stream content type', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'application/octet-stream' });
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.fetchVoiceSample('af_nova');

      expect(result).toBe(mockBlob);
    });

    it('should handle invalid content type', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        blob: vi.fn()
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(service.fetchVoiceSample('af_nova')).rejects.toThrow(/Invalid Content-Type/);
    });

    it('should handle different voice IDs', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      await service.fetchVoiceSample('bf_lily');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/samples/bf_lily.wav',
        expect.any(Object)
      );
    });
  });

  describe('synthesizeStream integration', () => {
    it('should successfully call client and return Response', async () => {
      const boundary = 'test-boundary-123';
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });

      // Create multipart response body
      const encoder = new TextEncoder();
      const parts = [
        `--${boundary}\r\n`,
        `Content-Type: audio/wav\r\n\r\n`,
        'audio data',
        `\r\n--${boundary}\r\n`,
        `Content-Type: application/json\r\n\r\n`,
        JSON.stringify({ duration: 1.5 }),
        `\r\n--${boundary}--\r\n`
      ];
      const bodyData = parts.join('');

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['Content-Type', `multipart/form-data; boundary=${boundary}`]]),
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: encoder.encode(bodyData) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.synthesizeStream('Hello world');

      expect(result).toHaveProperty('audioBlobs');
      expect(result).toHaveProperty('metadataArray');
      expect(result).toHaveProperty('phraseTimeline');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/tts/stream',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello world')
        })
      );
    });

    it('should use settings for voice and speed', async () => {
      const boundary = 'test-boundary';
      const encoder = new TextEncoder();
      const bodyData = `--${boundary}\r\nContent-Type: audio/wav\r\n\r\naudio\r\n--${boundary}--\r\n`;

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['Content-Type', `multipart/form-data; boundary=${boundary}`]]),
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: encoder.encode(bodyData) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      };
      global.fetch.mockResolvedValue(mockResponse);

      await service.synthesizeStream('Test');

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.voice).toBe('bf_lily');
      expect(body.speed).toBe(1.0);
    });
  });

  describe('synthesize integration', () => {
    it('should successfully call client and return Response', async () => {
      const mockBlob = new Blob(['audio-data'], { type: 'audio/wav' });
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['Content-Type', 'audio/wav']]),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.synthesize('Hello world');

      expect(result).toBe(mockBlob);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/tts',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello world')
        })
      );
    });
  });

  describe('client reuse', () => {
    it('should reuse client when settings unchanged', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ status: 'ok' })
      };
      global.fetch.mockResolvedValue(mockResponse);

      await service.checkHealth();
      await service.checkHealth();

      expect(SettingsStore.get).toHaveBeenCalledTimes(2);
    });

    it('should create new client when API URL changes', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ status: 'ok' })
      };
      global.fetch.mockResolvedValue(mockResponse);

      await service.checkHealth();

      mockSettings.apiUrl = 'http://localhost:4000';
      await service.checkHealth();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/health',
        expect.any(Object)
      );
    });
  });
});
