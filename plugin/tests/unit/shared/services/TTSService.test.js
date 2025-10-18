import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTSService, ttsService } from '../../../../src/shared/services/TTSService.js';
import { TTSClient } from '../../../../src/shared/api/TTSClient.js';
import { SettingsStore } from '../../../../src/shared/storage/SettingsStore.js';

// Mock dependencies
vi.mock('../../../../src/shared/api/TTSClient.js');
vi.mock('../../../../src/shared/storage/SettingsStore.js');

describe('TTSService', () => {
  let service;
  let mockSettings;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TTSService();

    mockSettings = {
      apiUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      selectedVoiceId: 'bf_lily',
      selectedVoiceName: 'Lily',
      speed: 1.0
    };

    mockClient = {
      checkHealth: vi.fn(),
      getVoices: vi.fn(),
      fetchVoiceSample: vi.fn(),
      synthesizeStream: vi.fn(),
      synthesize: vi.fn()
    };

    SettingsStore.get = vi.fn().mockResolvedValue(mockSettings);
    TTSClient.mockImplementation(() => mockClient);
  });

  describe('getClient', () => {
    it('should create new client on first call', async () => {
      const client = await service.getClient();

      expect(TTSClient).toHaveBeenCalledWith('http://localhost:3000', 'test-key');
      expect(client).toBe(mockClient);
    });

    it('should reuse existing client if settings unchanged', async () => {
      await service.getClient();
      await service.getClient();

      expect(TTSClient).toHaveBeenCalledTimes(1);
    });

    it('should create new client if apiUrl changes', async () => {
      await service.getClient();

      mockSettings.apiUrl = 'http://localhost:4000';
      await service.getClient();

      expect(TTSClient).toHaveBeenCalledTimes(2);
      expect(TTSClient).toHaveBeenLastCalledWith('http://localhost:4000', 'test-key');
    });

    it('should create new client if apiKey changes', async () => {
      await service.getClient();

      mockSettings.apiKey = 'new-key';
      await service.getClient();

      expect(TTSClient).toHaveBeenCalledTimes(2);
      expect(TTSClient).toHaveBeenLastCalledWith('http://localhost:3000', 'new-key');
    });

    it('should handle empty apiKey', async () => {
      mockSettings.apiKey = '';

      const client = await service.getClient();

      expect(TTSClient).toHaveBeenCalledWith('http://localhost:3000', '');
      expect(client).toBe(mockClient);
    });
  });

  describe('checkHealth', () => {
    it('should call client checkHealth', async () => {
      const mockHealth = { status: 'ok' };
      const mockResponse = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(mockHealth)
      };
      mockClient.checkHealth.mockResolvedValue(mockResponse);

      const result = await service.checkHealth();

      expect(mockClient.checkHealth).toHaveBeenCalled();
      expect(result).toEqual(mockHealth);
    });

    it('should get client before calling checkHealth', async () => {
      const mockResponse = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ status: 'ok' })
      };
      mockClient.checkHealth.mockResolvedValue(mockResponse);

      await service.checkHealth();

      expect(SettingsStore.get).toHaveBeenCalled();
      expect(TTSClient).toHaveBeenCalled();
    });
  });

  describe('getVoices', () => {
    it('should call client getVoices', async () => {
      const mockVoices = { voices: [{ id: 'bf_lily', name: 'Lily' }] };
      const mockResponse = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(mockVoices)
      };
      mockClient.getVoices.mockResolvedValue(mockResponse);

      const result = await service.getVoices();

      expect(mockClient.getVoices).toHaveBeenCalled();
      expect(result).toEqual(mockVoices);
    });
  });

  describe('fetchVoiceSample', () => {
    it('should call client fetchVoiceSample with voiceId and handle audio/wav', async () => {
      const mockBlob = new Blob(['audio'], { type: 'audio/wav' });
      const mockResponse = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      mockClient.fetchVoiceSample.mockResolvedValue(mockResponse);

      const result = await service.fetchVoiceSample('af_nova');

      expect(mockClient.fetchVoiceSample).toHaveBeenCalledWith('af_nova');
      expect(result).toBe(mockBlob);
    });

    it('should handle application/octet-stream content type', async () => {
      const mockBlob = new Blob(['audio'], { type: 'application/octet-stream' });
      const mockResponse = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      mockClient.fetchVoiceSample.mockResolvedValue(mockResponse);

      const result = await service.fetchVoiceSample('bf_lily');

      expect(mockClient.fetchVoiceSample).toHaveBeenCalledWith('bf_lily');
      expect(result).toBe(mockBlob);
    });
  });

  describe('synthesizeStream', () => {
    it('should call client synthesizeStream with text', async () => {
      const mockResponse = { ok: true };
      mockClient.synthesizeStream.mockResolvedValue(mockResponse);

      const result = await service.synthesizeStream('Hello world');

      expect(mockClient.synthesizeStream).toHaveBeenCalledWith('Hello world', {
        voice: 'bf_lily',
        speed: 1.0,
        signal: undefined
      });
      expect(result).toBe(mockResponse);
    });

    it('should use default voice and speed from settings', async () => {
      mockClient.synthesizeStream.mockResolvedValue({ ok: true });

      await service.synthesizeStream('Test');

      expect(mockClient.synthesizeStream).toHaveBeenCalledWith('Test', {
        voice: 'bf_lily',
        speed: 1.0,
        signal: undefined
      });
    });

    it('should override voice and speed with options', async () => {
      mockClient.synthesizeStream.mockResolvedValue({ ok: true });

      await service.synthesizeStream('Test', {
        voice: 'af_nova',
        speed: 1.5
      });

      expect(mockClient.synthesizeStream).toHaveBeenCalledWith('Test', {
        voice: 'af_nova',
        speed: 1.5,
        signal: undefined
      });
    });

    it('should pass abort signal', async () => {
      mockClient.synthesizeStream.mockResolvedValue({ ok: true });
      const abortController = new AbortController();

      await service.synthesizeStream('Test', {
        signal: abortController.signal
      });

      expect(mockClient.synthesizeStream).toHaveBeenCalledWith('Test', {
        voice: 'bf_lily',
        speed: 1.0,
        signal: abortController.signal
      });
    });

    it('should default to speed 1.0 if not in settings', async () => {
      mockSettings.speed = undefined;
      mockClient.synthesizeStream.mockResolvedValue({ ok: true });

      await service.synthesizeStream('Test');

      expect(mockClient.synthesizeStream).toHaveBeenCalledWith('Test', {
        voice: 'bf_lily',
        speed: 1.0,
        signal: undefined
      });
    });
  });

  describe('synthesize', () => {
    it('should call client synthesize with text', async () => {
      const mockResponse = { ok: true };
      mockClient.synthesize.mockResolvedValue(mockResponse);

      const result = await service.synthesize('Hello world');

      expect(mockClient.synthesize).toHaveBeenCalledWith('Hello world', {
        voice: 'bf_lily',
        speed: 1.0,
        signal: undefined
      });
      expect(result).toBe(mockResponse);
    });

    it('should override voice and speed with options', async () => {
      mockClient.synthesize.mockResolvedValue({ ok: true });

      await service.synthesize('Test', {
        voice: 'am_eric',
        speed: 0.8
      });

      expect(mockClient.synthesize).toHaveBeenCalledWith('Test', {
        voice: 'am_eric',
        speed: 0.8,
        signal: undefined
      });
    });
  });

  describe('reset', () => {
    it('should clear client and settings cache', async () => {
      // Create client
      await service.getClient();
      expect(TTSClient).toHaveBeenCalledTimes(1);

      // Reset
      service.reset();

      // Next call should create new client
      await service.getClient();
      expect(TTSClient).toHaveBeenCalledTimes(2);
    });

    it('should allow service to pick up new settings after reset', async () => {
      await service.getClient();

      // Change settings and reset
      mockSettings.apiUrl = 'http://localhost:5000';
      service.reset();

      await service.getClient();
      expect(TTSClient).toHaveBeenLastCalledWith('http://localhost:5000', 'test-key');
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(ttsService).toBeInstanceOf(TTSService);
    });

    it('should share state across imports', async () => {
      await ttsService.getClient();
      expect(TTSClient).toHaveBeenCalledTimes(1);

      // Calling again should reuse client
      await ttsService.getClient();
      expect(TTSClient).toHaveBeenCalledTimes(1);
    });
  });
});
