import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMultipartStream } from '../../../../src/shared/api/MultipartStreamHandler.js';
import { StreamParser } from '../../../../src/content/audio/StreamParser.js';
import { APIError } from '../../../../src/shared/utils/errors.js';

// Mock StreamParser at module level
vi.mock('../../../../src/content/audio/StreamParser.js', () => ({
  StreamParser: {
    parseMultipartStream: vi.fn()
  }
}));

describe('MultipartStreamHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseMultipartStream', () => {
    it('should parse multipart stream successfully', async () => {
      const mockParts = [
        {
          type: 'metadata',
          metadata: {
            duration_ms: 1500,
            phrases: [
              { text: 'Hello', start_ms: 0, duration_ms: 500 },
              { text: 'world', start_ms: 500, duration_ms: 500 }
            ]
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3, 4])
        },
        {
          type: 'metadata',
          metadata: {
            duration_ms: 1000,
            phrases: [
              { text: 'test', start_ms: 0, duration_ms: 500 }
            ]
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([5, 6, 7, 8])
        }
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test-boundary' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      const result = await parseMultipartStream(response);

      expect(result).toHaveProperty('audioBlobs');
      expect(result).toHaveProperty('metadataArray');
      expect(result).toHaveProperty('phraseTimeline');

      expect(result.audioBlobs).toHaveLength(2);
      expect(result.metadataArray).toHaveLength(2);
      expect(result.phraseTimeline).toHaveLength(3);

      // Verify audio blobs
      expect(result.audioBlobs[0]).toBeInstanceOf(Blob);
      expect(result.audioBlobs[0].type).toBe('audio/wav');
      expect(result.audioBlobs[1]).toBeInstanceOf(Blob);

      // Verify metadata
      expect(result.metadataArray[0].duration_ms).toBe(1500);
      expect(result.metadataArray[1].duration_ms).toBe(1000);

      // Verify phrase timeline
      expect(result.phraseTimeline[0]).toEqual({
        text: 'Hello',
        startTime: 0,
        endTime: 500,
        chunkIndex: 0
      });
      expect(result.phraseTimeline[1]).toEqual({
        text: 'world',
        startTime: 500,
        endTime: 1000,
        chunkIndex: 1
      });
      expect(result.phraseTimeline[2]).toEqual({
        text: 'test',
        startTime: 1500, // Accumulated from previous chunk
        endTime: 2000,
        chunkIndex: 2
      });
    });

    it('should throw APIError when content type is missing', async () => {
      const response = {
        status: 200,
        headers: new Headers()
      };

      await expect(parseMultipartStream(response)).rejects.toThrow(APIError);

      try {
        await parseMultipartStream(response);
      } catch (error) {
        expect(error.message).toContain('Missing Content-Type header');
      }
    });

    it('should throw APIError when content type is not multipart', async () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      };

      await expect(parseMultipartStream(response)).rejects.toThrow(APIError);

      try {
        await parseMultipartStream(response);
      } catch (error) {
        expect(error.message).toContain('Invalid Content-Type');
      }
    });

    it('should throw APIError when boundary is missing', async () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data' })
      };

      await expect(parseMultipartStream(response)).rejects.toThrow(APIError);

      try {
        await parseMultipartStream(response);
      } catch (error) {
        expect(error.message).toContain('No boundary found');
      }
    });

    it('should throw APIError when body reader cannot be obtained', async () => {
      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockImplementation(() => {
            throw new Error('Cannot get reader');
          })
        }
      };

      await expect(parseMultipartStream(response)).rejects.toThrow(APIError);

      try {
        await parseMultipartStream(response);
      } catch (error) {
        expect(error.message).toContain('Failed to get response body reader');
        expect(error.message).toContain('Cannot get reader');
      }
    });

    it('should throw APIError when stream parsing fails', async () => {
      StreamParser.parseMultipartStream.mockRejectedValue(new Error('Parse error'));

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      await expect(parseMultipartStream(response)).rejects.toThrow(APIError);

      try {
        await parseMultipartStream(response);
      } catch (error) {
        expect(error.message).toContain('Failed to parse multipart stream');
        expect(error.message).toContain('Parse error');
      }
    });

    it('should handle metadata without phrases', async () => {
      const mockParts = [
        {
          type: 'metadata',
          metadata: {
            duration: 1.0
            // No phrases array
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3, 4])
        }
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      const result = await parseMultipartStream(response);

      expect(result.phraseTimeline).toHaveLength(0);
      expect(result.metadataArray).toHaveLength(1);
      expect(result.audioBlobs).toHaveLength(1);
    });

    it('should handle metadata with empty phrases array', async () => {
      const mockParts = [
        {
          type: 'metadata',
          metadata: {
            duration: 1.0,
            phrases: []
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3, 4])
        }
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      const result = await parseMultipartStream(response);

      expect(result.phraseTimeline).toHaveLength(0);
    });

    it('should handle metadata without duration', async () => {
      const mockParts = [
        {
          type: 'metadata',
          metadata: {
            phrases: [
              { text: 'Hello', start_time: 0.0, end_time: 0.5 }
            ]
            // No duration
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3])
        },
        {
          type: 'metadata',
          metadata: {
            phrases: [
              { text: 'world', start_time: 0.0, end_time: 0.5 }
            ]
            // No duration
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([4, 5, 6])
        }
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      const result = await parseMultipartStream(response);

      // Without duration, accumulated duration should not increase
      expect(result.phraseTimeline[0].startTime).toBe(0.0);
      expect(result.phraseTimeline[1].startTime).toBe(0.0);
    });

    it('should filter and separate metadata and audio parts correctly', async () => {
      const mockParts = [
        { type: 'metadata', metadata: { id: 1 } },
        { type: 'audio', audioData: new Uint8Array([1]) },
        { type: 'metadata', metadata: { id: 2 } },
        { type: 'metadata', metadata: { id: 3 } },
        { type: 'audio', audioData: new Uint8Array([2]) },
        { type: 'audio', audioData: new Uint8Array([3]) }
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      const result = await parseMultipartStream(response);

      expect(result.metadataArray).toHaveLength(3);
      expect(result.audioBlobs).toHaveLength(3);
      expect(result.metadataArray[0].id).toBe(1);
      expect(result.metadataArray[1].id).toBe(2);
      expect(result.metadataArray[2].id).toBe(3);
    });

    it('should handle phrases with missing timing info', async () => {
      const mockParts = [
        {
          type: 'metadata',
          metadata: {
            duration_ms: 1000,
            phrases: [
              { text: 'Hello' },  // Missing start_ms and duration_ms
              { text: 'world', start_ms: 500 }  // Missing duration_ms
            ]
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3])
        }
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      const result = await parseMultipartStream(response);

      expect(result.phraseTimeline).toHaveLength(2);
      expect(result.phraseTimeline[0].startTime).toBe(0);
      expect(result.phraseTimeline[0].endTime).toBe(0);
      expect(result.phraseTimeline[1].startTime).toBe(500);
      expect(result.phraseTimeline[1].endTime).toBe(500);
    });

    it('should handle single combined metadata without accumulation', async () => {
      // Test the special case where chunk_index=0, start_offset_ms=0
      // and phrases are already in absolute time (from background script)
      const mockParts = [
        {
          type: 'metadata',
          metadata: {
            chunk_index: 0,
            start_offset_ms: 0,
            duration_ms: 5000,
            phrases: [
              { text: 'Hello', start_ms: 0, duration_ms: 1000 },
              { text: 'world', start_ms: 1000, duration_ms: 1000 },
              { text: 'test', start_ms: 2000, duration_ms: 1000 }
            ]
          }
        },
        {
          type: 'audio',
          audioData: new Uint8Array([1, 2, 3, 4])
        }
      ];

      StreamParser.parseMultipartStream.mockResolvedValue(mockParts);

      const mockReader = {
        read: vi.fn()
      };

      const response = {
        status: 200,
        headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=test' }),
        body: {
          getReader: vi.fn().mockReturnValue(mockReader)
        }
      };

      const result = await parseMultipartStream(response);

      // Verify phrases use absolute times without accumulation
      expect(result.phraseTimeline).toHaveLength(3);
      expect(result.phraseTimeline[0]).toEqual({
        text: 'Hello',
        startTime: 0,
        endTime: 1000,
        chunkIndex: 0
      });
      expect(result.phraseTimeline[1]).toEqual({
        text: 'world',
        startTime: 1000,
        endTime: 2000,
        chunkIndex: 1
      });
      expect(result.phraseTimeline[2]).toEqual({
        text: 'test',
        startTime: 2000,
        endTime: 3000,
        chunkIndex: 2
      });
    });

    it('should handle BackgroundTTSClient response format', async () => {
      // Test the special case where response comes from BackgroundTTSClient
      const audioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' });
      const metadata = {
        chunk_index: 0,
        start_offset_ms: 0,
        duration_ms: 2000,
        phrases: [
          { text: 'Hello', start_ms: 0, duration_ms: 1000 },
          { text: 'world', start_ms: 1000, duration_ms: 1000 }
        ]
      };

      const response = {
        __backgroundClientData: {
          audioBlobs: [audioBlob],
          metadataArray: [metadata]
        }
      };

      const result = await parseMultipartStream(response);

      expect(result.audioBlobs).toHaveLength(1);
      expect(result.audioBlobs[0]).toBe(audioBlob);
      expect(result.metadataArray).toHaveLength(1);
      expect(result.metadataArray[0]).toBe(metadata);
      expect(result.phraseTimeline).toHaveLength(2);
      expect(result.phraseTimeline[0].startTime).toBe(0);
      expect(result.phraseTimeline[1].startTime).toBe(1000);
    });
  });
});
