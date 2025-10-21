/**
 * Timeout utility for wrapping promises with time limits
 */

/**
 * Custom error class for timeout errors
 */
export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
    this.isTimeout = true;
  }
}

/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Error message for timeout
 * @returns {Promise} - Resolves with promise result or rejects with TimeoutError
 */
export function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(timeoutMessage));
      }, timeoutMs);
    })
  ]);
}
