/**
 * Custom error class for cache operations
 */
export class CacheError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'CacheError';
    this.code = code;
    this.originalError = originalError;
  }
}
