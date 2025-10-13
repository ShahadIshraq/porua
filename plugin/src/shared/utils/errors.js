export class APIError extends Error {
  constructor(status, message) {
    super(`API Error ${status}: ${message}`);
    this.name = 'APIError';
    this.status = status;
  }
}

export class StreamParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StreamParseError';
  }
}

export class AudioPlaybackError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AudioPlaybackError';
  }
}
