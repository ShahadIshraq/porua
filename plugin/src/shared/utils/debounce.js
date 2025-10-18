/**
 * Debounces a function to delay its execution until after a specified time has
 * elapsed since the last time it was invoked. Useful for rate-limiting expensive
 * operations like API calls or DOM updates.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} delay - Time in milliseconds to wait before executing the function
 * @returns {Function} The debounced function that maintains the original function's context
 *
 * @example
 * const debouncedSearch = debounce((query) => {
 *   fetchSearchResults(query);
 * }, 300);
 * searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
 *
 * @example
 * const debouncedSave = debounce(() => {
 *   saveFormData();
 * }, 1000);
 * formFields.forEach(field => {
 *   field.addEventListener('change', debouncedSave);
 * });
 */
export function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}
