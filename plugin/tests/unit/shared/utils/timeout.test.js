import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout, TimeoutError } from '../../../../src/shared/utils/timeout.js';

describe('timeout utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TimeoutError', () => {
    it('should create a timeout error with correct properties', () => {
      const error = new TimeoutError('Test timeout');

      expect(error.message).toBe('Test timeout');
      expect(error.name).toBe('TimeoutError');
      expect(error.isTimeout).toBe(true);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('withTimeout', () => {
    it('should resolve with promise result if it completes before timeout', async () => {
      const promise = Promise.resolve('success');

      const result = await withTimeout(promise, 5000, 'Timeout');

      expect(result).toBe('success');
    });

    it('should reject with TimeoutError if promise takes too long', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 10000);
      });

      const timeoutPromise = withTimeout(promise, 5000, 'Operation timed out');

      // Fast-forward time past the timeout
      vi.advanceTimersByTime(5000);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow('Operation timed out');
    });

    it('should use default timeout message if not provided', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 10000);
      });

      const timeoutPromise = withTimeout(promise, 5000);

      vi.advanceTimersByTime(5000);

      await expect(timeoutPromise).rejects.toThrow('Operation timed out');
    });

    it('should preserve original rejection if promise rejects before timeout', async () => {
      const originalError = new Error('Original error');
      const promise = Promise.reject(originalError);

      await expect(withTimeout(promise, 5000, 'Timeout')).rejects.toThrow('Original error');
      await expect(withTimeout(promise, 5000, 'Timeout')).rejects.not.toBeInstanceOf(TimeoutError);
    });

    it('should handle promise that resolves just before timeout', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('just in time'), 4999);
      });

      const resultPromise = withTimeout(promise, 5000, 'Timeout');

      // Advance to just before timeout
      vi.advanceTimersByTime(4999);

      const result = await resultPromise;
      expect(result).toBe('just in time');
    });

    it('should timeout exactly at the specified time', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 10000);
      });

      const timeoutPromise = withTimeout(promise, 3000, 'Custom timeout');

      // Advance to exactly the timeout
      vi.advanceTimersByTime(3000);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow('Custom timeout');
    });

    it('should handle promise that rejects with custom error', async () => {
      class CustomError extends Error {
        constructor(message) {
          super(message);
          this.name = 'CustomError';
          this.status = 404;
        }
      }

      const customError = new CustomError('Not found');
      const promise = Promise.reject(customError);

      try {
        await withTimeout(promise, 5000, 'Timeout');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CustomError);
        expect(error.status).toBe(404);
        expect(error.message).toBe('Not found');
      }
    });

    it('should work with async functions', async () => {
      const asyncFunc = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return 'async result';
      };

      const resultPromise = withTimeout(asyncFunc(), 2000, 'Timeout');

      vi.advanceTimersByTime(1000);

      const result = await resultPromise;
      expect(result).toBe('async result');
    });

    it('should timeout async functions that take too long', async () => {
      const slowAsyncFunc = async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return 'too slow';
      };

      const timeoutPromise = withTimeout(slowAsyncFunc(), 2000, 'Async timeout');

      vi.advanceTimersByTime(2000);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow('Async timeout');
    });
  });
});
