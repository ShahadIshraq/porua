import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../../../src/shared/utils/debounce.js';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should debounce function calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect the delay timing', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();

    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should only execute once after multiple rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(100);

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

    obj.debouncedMethod = debounce(fn, 100);
    obj.debouncedMethod();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments correctly', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2', 'arg3');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
  });

  it('should reset timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);

    debounced();
    vi.advanceTimersByTime(50);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use latest arguments when called multiple times', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    debounced('third');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('third');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
