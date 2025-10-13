import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from '../../../../src/shared/utils/throttle.js';

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throttle function calls', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect the limit timing', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 200);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);

    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should execute immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should prevent rapid calls during throttle period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should preserve this context', () => {
    const obj = {
      value: 42,
      method: function() {
        return this.value;
      }
    };

    const fn = vi.fn(function() {
      return this.value;
    });

    obj.throttledMethod = throttle(fn, 100);
    obj.throttledMethod();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments correctly', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('arg1', 'arg2', 'arg3');

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
  });

  it('should allow execution after throttle period expires', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use first arguments during throttle period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    throttled('second');
    throttled('third');

    expect(fn).toHaveBeenCalledWith('first');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple throttle periods correctly', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('call1');
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    throttled('call2');
    expect(fn).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(100);
    throttled('call3');
    expect(fn).toHaveBeenCalledTimes(3);

    expect(fn).toHaveBeenNthCalledWith(1, 'call1');
    expect(fn).toHaveBeenNthCalledWith(2, 'call2');
    expect(fn).toHaveBeenNthCalledWith(3, 'call3');
  });
});
