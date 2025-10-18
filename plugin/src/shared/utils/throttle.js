/**
 * Throttles a function to execute at most once per specified time interval.
 * The function will execute immediately on the first call, then ignore subsequent
 * calls until the time limit has passed.
 *
 * @param {Function} fn - The function to throttle
 * @param {number} limit - Minimum time in milliseconds between function executions
 * @returns {Function} The throttled function that maintains the original function's context
 *
 * @example
 * const throttledScroll = throttle(handleScroll, 100);
 * window.addEventListener('scroll', throttledScroll);
 *
 * @example
 * const throttledResize = throttle(() => {
 *   console.log('Window resized');
 * }, 200);
 * window.addEventListener('resize', throttledResize);
 */
export function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
