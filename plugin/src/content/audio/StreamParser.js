import { StreamParseError } from '../../shared/utils/errors.js';

export class StreamParser {
  static async parseMultipartStream(reader, boundary) {
    const parts = [];
    let buffer = new Uint8Array(0);
    const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
    const endBoundaryBytes = new TextEncoder().encode(`--${boundary}--`);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = this.appendBuffer(buffer, value);

      while (true) {
        const part = this.extractNextPart(buffer, boundaryBytes, endBoundaryBytes);
        if (!part) break;
        if (part.isEnd) return parts;

        parts.push(part.data);
        buffer = part.remaining;
      }
    }

    return parts;
  }

  static appendBuffer(buffer, value) {
    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    return newBuffer;
  }

  static extractNextPart(buffer, boundaryBytes, endBoundaryBytes) {
    const boundaryIndex = this.findBytesInArray(buffer, boundaryBytes);
    if (boundaryIndex === -1) return null;

    const isEndBoundary = this.arrayStartsWith(
      buffer.slice(boundaryIndex),
      endBoundaryBytes
    );
    if (isEndBoundary) return { isEnd: true };

    const headersEnd = this.findBytesInArray(
      buffer.slice(boundaryIndex),
      new Uint8Array([13, 10, 13, 10])
    );
    if (headersEnd === -1) return null;

    const headersStart = boundaryIndex + boundaryBytes.length;
    const contentStart = boundaryIndex + headersEnd + 4;

    const headersBytes = buffer.slice(headersStart, boundaryIndex + headersEnd);
    const headers = new TextDecoder().decode(headersBytes);
    const contentType = this.extractContentType(headers);

    const nextBoundaryIndex = this.findBytesInArray(
      buffer.slice(contentStart),
      new Uint8Array([13, 10, 45, 45])
    );
    if (nextBoundaryIndex === -1) return null;

    const contentEnd = contentStart + nextBoundaryIndex;
    const contentBytes = buffer.slice(contentStart, contentEnd);

    let data;
    if (contentType.includes('application/json')) {
      const jsonText = new TextDecoder().decode(contentBytes);
      try {
        data = { type: 'metadata', metadata: JSON.parse(jsonText) };
      } catch {
        return null;
      }
    } else if (contentType.includes('audio/wav')) {
      data = { type: 'audio', audioData: contentBytes };
    } else {
      data = { type: 'unknown' };
    }

    return {
      data,
      remaining: buffer.slice(contentEnd),
      isEnd: false
    };
  }

  static findBytesInArray(array, sequence) {
    for (let i = 0; i <= array.length - sequence.length; i++) {
      let found = true;
      for (let j = 0; j < sequence.length; j++) {
        if (array[i + j] !== sequence[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }

  static arrayStartsWith(array, sequence) {
    if (array.length < sequence.length) return false;
    for (let i = 0; i < sequence.length; i++) {
      if (array[i] !== sequence[i]) return false;
    }
    return true;
  }

  static extractContentType(headers) {
    const match = headers.match(/Content-Type:\s*([^\r\n]+)/i);
    return match ? match[1].trim() : '';
  }

  static buildPhraseTimeline(metadataArray) {
    const timeline = [];

    for (const metadata of metadataArray) {
      const { chunk_index, phrases, start_offset_ms } = metadata;
      if (!phrases || phrases.length === 0) continue;

      for (const phrase of phrases) {
        timeline.push({
          phrase: phrase.text,
          startTime: start_offset_ms + phrase.start_ms,
          endTime: start_offset_ms + phrase.start_ms + phrase.duration_ms,
          chunkIndex: chunk_index
        });
      }
    }

    return timeline;
  }
}
