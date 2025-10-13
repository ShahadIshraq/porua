/**
 * Test fixtures for multipart stream data
 */

// Simple metadata fixture
export const sampleMetadata = {
  chunk_index: 0,
  start_offset_ms: 0,
  phrases: [
    { text: 'Hello', start_ms: 0, duration_ms: 500 },
    { text: 'World', start_ms: 500, duration_ms: 600 }
  ]
};

// Sample audio data (minimal WAV header + data)
export const sampleAudioData = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x00, 0x00, 0x00, // File size
  0x57, 0x41, 0x56, 0x45, // "WAVE"
  0x66, 0x6D, 0x74, 0x20, // "fmt "
  0x10, 0x00, 0x00, 0x00, // fmt chunk size
  0x01, 0x00, // Audio format (PCM)
  0x01, 0x00, // Number of channels
  0x44, 0xAC, 0x00, 0x00, // Sample rate (44100)
  0x88, 0x58, 0x01, 0x00, // Byte rate
  0x02, 0x00, // Block align
  0x10, 0x00, // Bits per sample
  0x64, 0x61, 0x74, 0x61, // "data"
  0x00, 0x00, 0x00, 0x00  // Data size
]);

// Helper to create a multipart stream chunk
export function createMultipartChunk(boundary, contentType, data) {
  const encoder = new TextEncoder();
  const boundaryLine = encoder.encode(`--${boundary}\r\n`);
  const headers = encoder.encode(`Content-Type: ${contentType}\r\n\r\n`);

  let contentBytes;
  if (typeof data === 'string') {
    contentBytes = encoder.encode(data);
  } else if (data instanceof Uint8Array) {
    contentBytes = data;
  } else {
    contentBytes = encoder.encode(JSON.stringify(data));
  }

  const crlf = encoder.encode('\r\n');

  const total = boundaryLine.length + headers.length + contentBytes.length + crlf.length;
  const result = new Uint8Array(total);

  let offset = 0;
  result.set(boundaryLine, offset);
  offset += boundaryLine.length;
  result.set(headers, offset);
  offset += headers.length;
  result.set(contentBytes, offset);
  offset += contentBytes.length;
  result.set(crlf, offset);

  return result;
}

// Helper to create end boundary
export function createEndBoundary(boundary) {
  const encoder = new TextEncoder();
  return encoder.encode(`--${boundary}--\r\n`);
}

// Complete multipart stream with metadata and audio
export function createCompleteMultipartStream(boundary = 'boundary123') {
  const chunks = [];

  // Add metadata chunk
  const metadataChunk = createMultipartChunk(
    boundary,
    'application/json',
    sampleMetadata
  );
  chunks.push(metadataChunk);

  // Add audio chunk
  const audioChunk = createMultipartChunk(
    boundary,
    'audio/wav',
    sampleAudioData
  );
  chunks.push(audioChunk);

  // Add end boundary
  const endBoundary = createEndBoundary(boundary);
  chunks.push(endBoundary);

  // Combine all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Mock ReadableStream reader
export function createMockReader(data) {
  let position = 0;
  const chunkSize = 1024;

  return {
    read: async () => {
      if (position >= data.length) {
        return { done: true, value: undefined };
      }

      const end = Math.min(position + chunkSize, data.length);
      const chunk = data.slice(position, end);
      position = end;

      return { done: false, value: chunk };
    }
  };
}

// Multiple metadata chunks for timeline testing
export const multipleMetadataChunks = [
  {
    chunk_index: 0,
    start_offset_ms: 0,
    phrases: [
      { text: 'First', start_ms: 0, duration_ms: 500 },
      { text: 'phrase', start_ms: 500, duration_ms: 400 }
    ]
  },
  {
    chunk_index: 1,
    start_offset_ms: 1000,
    phrases: [
      { text: 'Second', start_ms: 0, duration_ms: 600 },
      { text: 'chunk', start_ms: 600, duration_ms: 300 }
    ]
  },
  {
    chunk_index: 2,
    start_offset_ms: 2000,
    phrases: [
      { text: 'Third', start_ms: 0, duration_ms: 700 }
    ]
  }
];

// Edge case: Empty phrases
export const emptyPhrasesMetadata = {
  chunk_index: 0,
  start_offset_ms: 0,
  phrases: []
};

// Edge case: Missing phrases field
export const missingPhrasesMetadata = {
  chunk_index: 0,
  start_offset_ms: 0
};
