import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTSClient } from '../../../../src/shared/api/TTSClient.js';
import { APIError } from '../../../../src/shared/utils/errors.js';

// Mock global fetch
global.fetch = vi.fn();

describe('TTSClient', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new TTSClient('http://localhost:3000', 'test-api-key');
  });

  describe('constructor', () => {
    it('should set baseUrl and apiKey', () => {
      expect(client.baseUrl).toBe('http://localhost:3000');
      expect(client.apiKey).toBe('test-api-key');
    });

    it('should set empty apiKey when not provided', () => {
      const clientWithoutKey = new TTSClient('http://localhost:3000');
      expect(clientWithoutKey.apiKey).toBe('');
    });

    it('should accept different base URLs', () => {
      const client1 = new TTSClient('https://api.example.com');
      const client2 = new TTSClient('http://192.168.1.100:8080');

      expect(client1.baseUrl).toBe('https://api.example.com');
      expect(client2.baseUrl).toBe('http://192.168.1.100:8080');
    });
  });

  describe('checkHealth', () => {
    it('should call /health endpoint', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'healthy' })
      };
      global.fetch.mockResolvedValue(mockResponse);

      await client.checkHealth();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should return Response object', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'healthy', version: '1.0.0' })
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.checkHealth();

      expect(result).toBe(mockResponse);
    });

    it('should throw APIError on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('Service Unavailable')
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(client.checkHealth()).rejects.toThrow(APIError);
    });
  });

  describe('getVoices', () => {
    it('should call /voices endpoint', async () => {
      const mockVoices = {
        voices: [
          { id: 'af_nova', name: 'Nova', gender: 'Female', language: 'AmericanEnglish' },
          { id: 'bf_lily', name: 'Lily', gender: 'Female', language: 'BritishEnglish' }
        ]
      };
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockVoices)
      };
      global.fetch.mockResolvedValue(mockResponse);

      await client.getVoices();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/voices',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should return Response object', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          voices: [
            { id: 'af_nova', name: 'Nova', gender: 'Female', language: 'AmericanEnglish' },
            { id: 'bf_lily', name: 'Lily', gender: 'Female', language: 'BritishEnglish' }
          ]
        })
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.getVoices();

      expect(result).toBe(mockResponse);
    });

    it('should throw APIError on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Failed to load voices')
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(client.getVoices()).rejects.toThrow(APIError);
    });
  });

  describe('getVoiceSampleUrl', () => {
    it('should construct correct sample URL', () => {
      const url = client.getVoiceSampleUrl('af_nova');
      expect(url).toBe('http://localhost:3000/samples/af_nova.wav');
    });

    it('should work with different voice IDs', () => {
      const url1 = client.getVoiceSampleUrl('bf_lily');
      const url2 = client.getVoiceSampleUrl('am_eric');
      const url3 = client.getVoiceSampleUrl('bm_george');

      expect(url1).toBe('http://localhost:3000/samples/bf_lily.wav');
      expect(url2).toBe('http://localhost:3000/samples/am_eric.wav');
      expect(url3).toBe('http://localhost:3000/samples/bm_george.wav');
    });

    it('should use client baseUrl', () => {
      const customClient = new TTSClient('https://api.example.com:8080');
      const url = customClient.getVoiceSampleUrl('af_nova');

      expect(url).toBe('https://api.example.com:8080/samples/af_nova.wav');
    });
  });

  describe('fetchVoiceSample', () => {
    it('should call /samples endpoint with voice ID', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
      const mockResponse = {
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetchVoiceSample('af_nova');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/samples/af_nova.wav',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key'
          })
        })
      );
    });

    it('should return Response object', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
      const mockResponse = {
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.fetchVoiceSample('af_nova');

      expect(result).toBe(mockResponse);
    });

    it('should work with different voice IDs', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
      const mockResponse = {
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetchVoiceSample('bf_lily');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/samples/bf_lily.wav',
        expect.any(Object)
      );
    });

    it('should include API key in request', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
      const mockResponse = {
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob)
      };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetchVoiceSample('af_nova');

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].headers['X-API-Key']).toBe('test-api-key');
    });

    it('should throw APIError on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue('Sample not found')
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(client.fetchVoiceSample('unknown_voice')).rejects.toThrow(APIError);
    });
  });

  describe('synthesizeStream', () => {
    it('should call /tts/stream endpoint with POST', async () => {
      const mockResponse = { ok: true, body: {} };
      global.fetch.mockResolvedValue(mockResponse);

      await client.synthesizeStream('Hello World');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/tts/stream',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should send correct payload with text', async () => {
      const mockResponse = { ok: true, body: {} };
      global.fetch.mockResolvedValue(mockResponse);

      await client.synthesizeStream('Test text');

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.text).toBe('Test text');
    });

    it('should use default voice and speed when not provided', async () => {
      const mockResponse = { ok: true, body: {} };
      global.fetch.mockResolvedValue(mockResponse);

      await client.synthesizeStream('Test');

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.voice).toBe('bf_lily');
      expect(body.speed).toBe(1.0);
    });

    it('should use provided voice and speed options', async () => {
      const mockResponse = { ok: true, body: {} };
      global.fetch.mockResolvedValue(mockResponse);

      await client.synthesizeStream('Test', {
        voice: 'af_sarah',
        speed: 1.5
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.voice).toBe('af_sarah');
      expect(body.speed).toBe(1.5);
    });

    it('should return response on success', async () => {
      const mockResponse = { ok: true, body: 'stream-data' };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.synthesizeStream('Test');

      expect(result).toBe(mockResponse);
    });

    it('should throw APIError on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request')
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(client.synthesizeStream('Test')).rejects.toThrow(APIError);
    });
  });

  describe('fetch', () => {
    it('should add Content-Type header', async () => {
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetch('/test');

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('should add API key header when apiKey is set', async () => {
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetch('/test');

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].headers['X-API-Key']).toBe('test-api-key');
    });

    it('should not add API key header when apiKey is empty', async () => {
      const clientWithoutKey = new TTSClient('http://localhost:3000');
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      await clientWithoutKey.fetch('/test');

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].headers['X-API-Key']).toBeUndefined();
    });

    it('should merge custom headers', async () => {
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetch('/test', {
        headers: { 'Custom-Header': 'custom-value' }
      });

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].headers['Custom-Header']).toBe('custom-value');
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('should construct correct URL', async () => {
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetch('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.any(Object)
      );
    });

    it('should throw APIError with status code on failure', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue('Not Found')
      };
      global.fetch.mockResolvedValue(mockResponse);

      try {
        await client.fetch('/test');
        expect.fail('Should have thrown APIError');
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect(error.status).toBe(404);
        expect(error.message).toContain('404');
        expect(error.message).toContain('Not Found');
      }
    });

    it('should include error message in APIError', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error')
      };
      global.fetch.mockResolvedValue(mockResponse);

      try {
        await client.fetch('/test');
        expect.fail('Should have thrown APIError');
      } catch (error) {
        expect(error.message).toContain('Internal Server Error');
      }
    });

    it('should return response on success', async () => {
      const mockResponse = { ok: true, json: vi.fn() };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.fetch('/test');

      expect(result).toBe(mockResponse);
    });

    it('should pass through fetch options', async () => {
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetch('/test', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' })
      });

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].body).toBe('{"data":"test"}');
    });

    it('should handle different HTTP methods', async () => {
      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      await client.fetch('/test', { method: 'PUT' });

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].method).toBe('PUT');
    });

    it('should handle different status codes', async () => {
      const testCases = [
        { status: 400, text: 'Bad Request' },
        { status: 401, text: 'Unauthorized' },
        { status: 403, text: 'Forbidden' },
        { status: 500, text: 'Internal Server Error' }
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          ok: false,
          status: testCase.status,
          text: vi.fn().mockResolvedValue(testCase.text)
        };
        global.fetch.mockResolvedValue(mockResponse);

        try {
          await client.fetch('/test');
          expect.fail(`Should have thrown APIError for status ${testCase.status}`);
        } catch (error) {
          expect(error.status).toBe(testCase.status);
        }
      }
    });
  });
});
