import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateContentType,
  toJSON,
  toBlob,
  extractMultipartBoundary,
  validateMultipartResponse
} from '../../../../src/shared/api/ResponseHandler.js';
import { APIError } from '../../../../src/shared/utils/errors.js';

describe('ResponseHandler', () => {
  describe('validateContentType', () => {
    it('should pass when content type matches', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      };

      expect(() => validateContentType(response, 'application/json')).not.toThrow();
    });

    it('should pass when content type includes expected type', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json; charset=utf-8' })
      };

      expect(() => validateContentType(response, 'application/json')).not.toThrow();
    });

    it('should throw APIError when Content-Type header is missing', () => {
      const response = {
        status: 200,
        headers: new Headers()
      };

      expect(() => validateContentType(response, 'application/json'))
        .toThrow(APIError);

      try {
        validateContentType(response, 'application/json');
      } catch (error) {
        expect(error.status).toBe(200);
        expect(error.message).toContain('Missing Content-Type header');
        expect(error.message).toContain('application/json');
      }
    });

    it('should throw APIError when content type does not match', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/plain' })
      };

      expect(() => validateContentType(response, 'application/json'))
        .toThrow(APIError);

      try {
        validateContentType(response, 'application/json');
      } catch (error) {
        expect(error.status).toBe(200);
        expect(error.message).toContain('Invalid Content-Type');
        expect(error.message).toContain('application/json');
        expect(error.message).toContain('text/plain');
      }
    });

    it('should preserve response status in error', () => {
      const response = {
        status: 500,
        headers: new Headers({ 'Content-Type': 'text/html' })
      };

      try {
        validateContentType(response, 'application/json');
      } catch (error) {
        expect(error.status).toBe(500);
      }
    });
  });

  describe('toJSON', () => {
    it('should convert response to JSON successfully', async () => {
      const mockData = { message: 'success', data: [1, 2, 3] };
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(mockData)
      };

      const result = await toJSON(response);

      expect(result).toEqual(mockData);
      expect(response.json).toHaveBeenCalledTimes(1);
    });

    it('should handle JSON with charset parameter', async () => {
      const mockData = { key: 'value' };
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json; charset=utf-8' }),
        json: vi.fn().mockResolvedValue(mockData)
      };

      const result = await toJSON(response);

      expect(result).toEqual(mockData);
    });

    it('should throw APIError when content type is not JSON', async () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        json: vi.fn()
      };

      await expect(toJSON(response)).rejects.toThrow(APIError);
      expect(response.json).not.toHaveBeenCalled();
    });

    it('should throw APIError when JSON parsing fails', async () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
      };

      await expect(toJSON(response)).rejects.toThrow(APIError);

      try {
        await toJSON(response);
      } catch (error) {
        expect(error.status).toBe(200);
        expect(error.message).toContain('Failed to parse JSON response');
        expect(error.message).toContain('Invalid JSON');
      }
    });

    it('should throw APIError when content type header is missing', async () => {
      const response = {
        status: 200,
        headers: new Headers(),
        json: vi.fn()
      };

      await expect(toJSON(response)).rejects.toThrow(APIError);
      expect(response.json).not.toHaveBeenCalled();
    });
  });

  describe('toBlob', () => {
    it('should convert response to Blob successfully', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/wav' });
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };

      const result = await toBlob(response);

      expect(result).toBe(mockBlob);
      expect(response.blob).toHaveBeenCalledTimes(1);
    });

    it('should use default audio/wav type when not specified', async () => {
      const mockBlob = new Blob(['audio data']);
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };

      const result = await toBlob(response);

      expect(result).toBe(mockBlob);
    });

    it('should accept custom expected type', async () => {
      const mockBlob = new Blob(['image data']);
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'image/png' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };

      const result = await toBlob(response, 'image/png');

      expect(result).toBe(mockBlob);
    });

    it('should handle content type with additional parameters', async () => {
      const mockBlob = new Blob(['audio data']);
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav; rate=44100' }),
        blob: vi.fn().mockResolvedValue(mockBlob)
      };

      const result = await toBlob(response, 'audio/wav');

      expect(result).toBe(mockBlob);
    });

    it('should throw APIError when content type does not match', async () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        blob: vi.fn()
      };

      await expect(toBlob(response, 'audio/wav')).rejects.toThrow(APIError);
      expect(response.blob).not.toHaveBeenCalled();
    });

    it('should throw APIError when blob conversion fails', async () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        blob: vi.fn().mockRejectedValue(new Error('Conversion failed'))
      };

      await expect(toBlob(response)).rejects.toThrow(APIError);

      try {
        await toBlob(response);
      } catch (error) {
        expect(error.status).toBe(200);
        expect(error.message).toContain('Failed to convert response to Blob');
        expect(error.message).toContain('Conversion failed');
      }
    });

    it('should throw APIError when content type header is missing', async () => {
      const response = {
        status: 200,
        headers: new Headers(),
        blob: vi.fn()
      };

      await expect(toBlob(response)).rejects.toThrow(APIError);
      expect(response.blob).not.toHaveBeenCalled();
    });
  });

  describe('extractMultipartBoundary', () => {
    it('should extract boundary from multipart content type', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' })
      };

      const boundary = extractMultipartBoundary(response);

      expect(boundary).toBe('----WebKitFormBoundary7MA4YWxkTrZu0gW');
    });

    it('should extract boundary with spaces', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=  my-boundary  ' })
      };

      const boundary = extractMultipartBoundary(response);

      expect(boundary).toBe('my-boundary');
    });

    it('should extract boundary from complex content type', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/mixed; charset=utf-8; boundary=abc123; version=1.0' })
      };

      const boundary = extractMultipartBoundary(response);

      expect(boundary).toBe('abc123');
    });

    it('should throw APIError when Content-Type header is missing', () => {
      const response = {
        status: 200,
        headers: new Headers()
      };

      expect(() => extractMultipartBoundary(response)).toThrow(APIError);

      try {
        extractMultipartBoundary(response);
      } catch (error) {
        expect(error.status).toBe(200);
        expect(error.message).toContain('Missing Content-Type header');
      }
    });

    it('should throw APIError when boundary is missing', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data' })
      };

      expect(() => extractMultipartBoundary(response)).toThrow(APIError);

      try {
        extractMultipartBoundary(response);
      } catch (error) {
        expect(error.status).toBe(200);
        expect(error.message).toContain('No boundary found');
        expect(error.message).toContain('multipart/form-data');
      }
    });

    it('should throw APIError when boundary parameter is empty', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=' })
      };

      expect(() => extractMultipartBoundary(response)).toThrow(APIError);
    });
  });

  describe('validateMultipartResponse', () => {
    it('should pass for valid multipart response', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test123' })
      };

      expect(() => validateMultipartResponse(response)).not.toThrow();
    });

    it('should pass for multipart/mixed', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/mixed; boundary=abc' })
      };

      expect(() => validateMultipartResponse(response)).not.toThrow();
    });

    it('should throw when content type is not multipart', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      };

      expect(() => validateMultipartResponse(response)).toThrow(APIError);
    });

    it('should throw when boundary is missing', () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data' })
      };

      expect(() => validateMultipartResponse(response)).toThrow(APIError);
    });

    it('should throw when Content-Type header is missing', () => {
      const response = {
        status: 200,
        headers: new Headers()
      };

      expect(() => validateMultipartResponse(response)).toThrow(APIError);
    });
  });
});
