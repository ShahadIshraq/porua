import { describe, it, expect } from 'vitest';
import { APIError, StreamParseError, AudioPlaybackError } from '../../../../src/shared/utils/errors.js';

describe('APIError', () => {
  it('should create an APIError with correct message', () => {
    const error = new APIError(404, 'Not Found');
    expect(error.message).toBe('API Error 404: Not Found');
  });

  it('should have correct name property', () => {
    const error = new APIError(500, 'Server Error');
    expect(error.name).toBe('APIError');
  });

  it('should have correct status property', () => {
    const error = new APIError(403, 'Forbidden');
    expect(error.status).toBe(403);
  });

  it('should inherit from Error', () => {
    const error = new APIError(400, 'Bad Request');
    expect(error instanceof Error).toBe(true);
  });

  it('should format message correctly with different status codes', () => {
    const error1 = new APIError(200, 'OK');
    const error2 = new APIError(503, 'Service Unavailable');

    expect(error1.message).toBe('API Error 200: OK');
    expect(error2.message).toBe('API Error 503: Service Unavailable');
  });
});

describe('StreamParseError', () => {
  it('should create a StreamParseError with correct message', () => {
    const error = new StreamParseError('Invalid stream format');
    expect(error.message).toBe('Invalid stream format');
  });

  it('should have correct name property', () => {
    const error = new StreamParseError('Parse failed');
    expect(error.name).toBe('StreamParseError');
  });

  it('should inherit from Error', () => {
    const error = new StreamParseError('Boundary not found');
    expect(error instanceof Error).toBe(true);
  });
});

describe('AudioPlaybackError', () => {
  it('should create an AudioPlaybackError with correct message', () => {
    const error = new AudioPlaybackError('Failed to decode audio');
    expect(error.message).toBe('Failed to decode audio');
  });

  it('should have correct name property', () => {
    const error = new AudioPlaybackError('Playback interrupted');
    expect(error.name).toBe('AudioPlaybackError');
  });

  it('should inherit from Error', () => {
    const error = new AudioPlaybackError('Audio context closed');
    expect(error instanceof Error).toBe(true);
  });
});
