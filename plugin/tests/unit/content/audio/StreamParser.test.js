import { describe, it, expect } from 'vitest';
import { StreamParser } from '../../../../src/content/audio/StreamParser.js';
import {
  createCompleteMultipartStream,
  createMockReader,
  sampleMetadata,
  multipleMetadataChunks,
  emptyPhrasesMetadata,
  missingPhrasesMetadata,
  createMultipartChunk,
  createEndBoundary
} from '../../../fixtures/stream-data.js';

describe('StreamParser', () => {
  describe('parseMultipartStream', () => {
    it('should parse complete multipart stream', async () => {
      const streamData = createCompleteMultipartStream('boundary123');
      const reader = createMockReader(streamData);

      const parts = await StreamParser.parseMultipartStream(reader, 'boundary123');

      expect(parts).toHaveLength(2);
      expect(parts[0].type).toBe('metadata');
      expect(parts[1].type).toBe('audio');
    });

    it('should parse metadata correctly', async () => {
      const streamData = createCompleteMultipartStream('test-boundary');
      const reader = createMockReader(streamData);

      const parts = await StreamParser.parseMultipartStream(reader, 'test-boundary');

      const metadataPart = parts.find(p => p.type === 'metadata');
      expect(metadataPart).toBeDefined();
      expect(metadataPart.metadata).toEqual(sampleMetadata);
    });

    it('should parse audio data correctly', async () => {
      const streamData = createCompleteMultipartStream('test-boundary');
      const reader = createMockReader(streamData);

      const parts = await StreamParser.parseMultipartStream(reader, 'test-boundary');

      const audioPart = parts.find(p => p.type === 'audio');
      expect(audioPart).toBeDefined();
      expect(audioPart.audioData).toBeInstanceOf(Uint8Array);
      expect(audioPart.audioData.length).toBeGreaterThan(0);
    });

    it('should handle empty stream', async () => {
      const reader = createMockReader(new Uint8Array(0));

      const parts = await StreamParser.parseMultipartStream(reader, 'boundary');

      expect(parts).toEqual([]);
    });

    it('should stop at end boundary', async () => {
      const streamData = createCompleteMultipartStream('boundary');
      const reader = createMockReader(streamData);

      const parts = await StreamParser.parseMultipartStream(reader, 'boundary');

      // Should not continue reading after end boundary
      expect(parts).toHaveLength(2);
    });
  });

  describe('appendBuffer', () => {
    it('should concatenate two buffers', () => {
      const buffer1 = new Uint8Array([1, 2, 3]);
      const buffer2 = new Uint8Array([4, 5, 6]);

      const result = StreamParser.appendBuffer(buffer1, buffer2);

      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    it('should handle empty first buffer', () => {
      const buffer1 = new Uint8Array(0);
      const buffer2 = new Uint8Array([1, 2, 3]);

      const result = StreamParser.appendBuffer(buffer1, buffer2);

      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should handle empty second buffer', () => {
      const buffer1 = new Uint8Array([1, 2, 3]);
      const buffer2 = new Uint8Array(0);

      const result = StreamParser.appendBuffer(buffer1, buffer2);

      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should handle both empty buffers', () => {
      const buffer1 = new Uint8Array(0);
      const buffer2 = new Uint8Array(0);

      const result = StreamParser.appendBuffer(buffer1, buffer2);

      expect(result).toEqual(new Uint8Array(0));
    });
  });

  describe('findBytesInArray', () => {
    it('should find sequence at beginning', () => {
      const array = new Uint8Array([1, 2, 3, 4, 5]);
      const sequence = new Uint8Array([1, 2, 3]);

      const index = StreamParser.findBytesInArray(array, sequence);

      expect(index).toBe(0);
    });

    it('should find sequence in middle', () => {
      const array = new Uint8Array([1, 2, 3, 4, 5]);
      const sequence = new Uint8Array([3, 4]);

      const index = StreamParser.findBytesInArray(array, sequence);

      expect(index).toBe(2);
    });

    it('should find sequence at end', () => {
      const array = new Uint8Array([1, 2, 3, 4, 5]);
      const sequence = new Uint8Array([4, 5]);

      const index = StreamParser.findBytesInArray(array, sequence);

      expect(index).toBe(3);
    });

    it('should return -1 when sequence not found', () => {
      const array = new Uint8Array([1, 2, 3, 4, 5]);
      const sequence = new Uint8Array([6, 7]);

      const index = StreamParser.findBytesInArray(array, sequence);

      expect(index).toBe(-1);
    });

    it('should return -1 when sequence longer than array', () => {
      const array = new Uint8Array([1, 2, 3]);
      const sequence = new Uint8Array([1, 2, 3, 4, 5]);

      const index = StreamParser.findBytesInArray(array, sequence);

      expect(index).toBe(-1);
    });

    it('should handle empty sequence', () => {
      const array = new Uint8Array([1, 2, 3]);
      const sequence = new Uint8Array(0);

      const index = StreamParser.findBytesInArray(array, sequence);

      expect(index).toBe(0);
    });
  });

  describe('arrayStartsWith', () => {
    it('should return true when array starts with sequence', () => {
      const array = new Uint8Array([1, 2, 3, 4, 5]);
      const sequence = new Uint8Array([1, 2, 3]);

      const result = StreamParser.arrayStartsWith(array, sequence);

      expect(result).toBe(true);
    });

    it('should return false when array does not start with sequence', () => {
      const array = new Uint8Array([1, 2, 3, 4, 5]);
      const sequence = new Uint8Array([2, 3]);

      const result = StreamParser.arrayStartsWith(array, sequence);

      expect(result).toBe(false);
    });

    it('should return false when sequence longer than array', () => {
      const array = new Uint8Array([1, 2, 3]);
      const sequence = new Uint8Array([1, 2, 3, 4, 5]);

      const result = StreamParser.arrayStartsWith(array, sequence);

      expect(result).toBe(false);
    });

    it('should return true for empty sequence', () => {
      const array = new Uint8Array([1, 2, 3]);
      const sequence = new Uint8Array(0);

      const result = StreamParser.arrayStartsWith(array, sequence);

      expect(result).toBe(true);
    });

    it('should return true when array equals sequence', () => {
      const array = new Uint8Array([1, 2, 3]);
      const sequence = new Uint8Array([1, 2, 3]);

      const result = StreamParser.arrayStartsWith(array, sequence);

      expect(result).toBe(true);
    });
  });

  describe('extractContentType', () => {
    it('should extract Content-Type header', () => {
      const headers = 'Content-Type: application/json\r\nContent-Length: 123\r\n';

      const contentType = StreamParser.extractContentType(headers);

      expect(contentType).toBe('application/json');
    });

    it('should extract Content-Type with charset', () => {
      const headers = 'Content-Type: text/html; charset=utf-8\r\n';

      const contentType = StreamParser.extractContentType(headers);

      expect(contentType).toBe('text/html; charset=utf-8');
    });

    it('should handle case-insensitive header name', () => {
      const headers = 'content-type: audio/wav\r\n';

      const contentType = StreamParser.extractContentType(headers);

      expect(contentType).toBe('audio/wav');
    });

    it('should return empty string when Content-Type not found', () => {
      const headers = 'Content-Length: 123\r\nContent-Encoding: gzip\r\n';

      const contentType = StreamParser.extractContentType(headers);

      expect(contentType).toBe('');
    });

    it('should trim whitespace', () => {
      const headers = 'Content-Type:   application/json   \r\n';

      const contentType = StreamParser.extractContentType(headers);

      expect(contentType).toBe('application/json');
    });
  });

  describe('buildPhraseTimeline', () => {
    it('should build timeline from single metadata', () => {
      const timeline = StreamParser.buildPhraseTimeline([sampleMetadata]);

      expect(timeline).toHaveLength(2);
      expect(timeline[0]).toEqual({
        phrase: 'Hello',
        startTime: 0,
        endTime: 500,
        chunkIndex: 0
      });
      expect(timeline[1]).toEqual({
        phrase: 'World',
        startTime: 500,
        endTime: 1100,
        chunkIndex: 0
      });
    });

    it('should build timeline from multiple metadata chunks', () => {
      const timeline = StreamParser.buildPhraseTimeline(multipleMetadataChunks);

      expect(timeline).toHaveLength(5);

      expect(timeline[0].phrase).toBe('First');
      expect(timeline[0].startTime).toBe(0);
      expect(timeline[0].chunkIndex).toBe(0);

      expect(timeline[2].phrase).toBe('Second');
      expect(timeline[2].startTime).toBe(1000);
      expect(timeline[2].chunkIndex).toBe(1);

      expect(timeline[4].phrase).toBe('Third');
      expect(timeline[4].startTime).toBe(2000);
      expect(timeline[4].chunkIndex).toBe(2);
    });

    it('should calculate correct offsets', () => {
      const timeline = StreamParser.buildPhraseTimeline(multipleMetadataChunks);

      // First chunk, second phrase
      expect(timeline[1].startTime).toBe(500);
      expect(timeline[1].endTime).toBe(900);

      // Second chunk, first phrase
      expect(timeline[2].startTime).toBe(1000);
      expect(timeline[2].endTime).toBe(1600);
    });

    it('should handle empty phrases array', () => {
      const timeline = StreamParser.buildPhraseTimeline([emptyPhrasesMetadata]);

      expect(timeline).toEqual([]);
    });

    it('should handle missing phrases field', () => {
      const timeline = StreamParser.buildPhraseTimeline([missingPhrasesMetadata]);

      expect(timeline).toEqual([]);
    });

    it('should handle empty metadata array', () => {
      const timeline = StreamParser.buildPhraseTimeline([]);

      expect(timeline).toEqual([]);
    });

    it('should skip metadata with no phrases', () => {
      const mixedMetadata = [
        sampleMetadata,
        emptyPhrasesMetadata,
        multipleMetadataChunks[0]
      ];

      const timeline = StreamParser.buildPhraseTimeline(mixedMetadata);

      // Should only include phrases from sampleMetadata and multipleMetadataChunks[0]
      expect(timeline).toHaveLength(4);
    });
  });

  describe('extractNextPart', () => {
    it('should return null when boundary not found', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5]);
      const boundary = new TextEncoder().encode('--boundary');
      const endBoundary = new TextEncoder().encode('--boundary--');

      const result = StreamParser.extractNextPart(buffer, boundary, endBoundary);

      expect(result).toBeNull();
    });

    it('should detect end boundary', () => {
      const endBoundary = createEndBoundary('test');
      const boundary = new TextEncoder().encode('--test');
      const endBoundaryBytes = new TextEncoder().encode('--test--');

      const result = StreamParser.extractNextPart(endBoundary, boundary, endBoundaryBytes);

      expect(result).toEqual({ isEnd: true });
    });

    it('should return null when headers incomplete', () => {
      const boundary = 'test';
      const chunk = createMultipartChunk(boundary, 'application/json', '{}');
      // Truncate to remove complete headers
      const incomplete = chunk.slice(0, 20);
      const boundaryBytes = new TextEncoder().encode('--test');
      const endBoundaryBytes = new TextEncoder().encode('--test--');

      const result = StreamParser.extractNextPart(incomplete, boundaryBytes, endBoundaryBytes);

      expect(result).toBeNull();
    });
  });
});
