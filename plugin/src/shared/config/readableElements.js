/**
 * Configuration for readable HTML elements that can be read aloud by TTS
 *
 * This module provides a centralized configuration for determining which HTML elements
 * should be considered "readable" and eligible for text-to-speech playback.
 */

/**
 * Configuration object for readable elements
 * @type {Object}
 * @property {string[]} tags - Array of HTML tag names that should be readable
 * @property {number} minTextLength - Minimum text content length to show play button
 */
export const READABLE_ELEMENTS_CONFIG = {
  // Supported HTML tags (in uppercase for consistency with DOM tagName property)
  tags: [
    'P',          // Paragraphs
    'H1',         // Heading level 1
    'H2',         // Heading level 2
    'H3',         // Heading level 3
    'H4',         // Heading level 4
    'H5',         // Heading level 5
    'H6',         // Heading level 6
    'LI',         // List items
    'BLOCKQUOTE'  // Block quotes
  ],

  // Minimum number of characters required for an element to be readable
  minTextLength: 10
};

/**
 * Check if an element's tag is in the list of readable tags
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the element's tag is readable
 */
export function isReadableTag(element) {
  if (!element || !element.tagName) {
    return false;
  }

  return READABLE_ELEMENTS_CONFIG.tags.includes(element.tagName);
}

/**
 * Check if an element has sufficient text content
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the element has enough text content
 */
export function hasMinimumTextContent(element) {
  if (!element || !element.textContent) {
    return false;
  }

  const trimmedText = element.textContent.trim();
  return trimmedText.length >= READABLE_ELEMENTS_CONFIG.minTextLength;
}

/**
 * Check if an element is visible (not hidden by CSS)
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the element is visible
 */
export function isElementVisible(element) {
  if (!element) {
    return false;
  }

  // Check if element has display: none or visibility: hidden
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // Check aria-hidden attribute
  if (element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  return true;
}

/**
 * Comprehensive check if an element should show the play button
 * Combines all validation rules
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the play button should be shown for this element
 */
export function shouldShowPlayButton(element) {
  return (
    isReadableTag(element) &&
    hasMinimumTextContent(element) &&
    isElementVisible(element)
  );
}

/**
 * Check if an element is a readable element (tag check only, no visibility/length checks)
 * Useful for querySelectorAll operations where we filter separately
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the element is a readable element type
 */
export function isReadableElement(element) {
  return isReadableTag(element);
}

/**
 * Generate a CSS selector string for all readable elements
 * @returns {string} CSS selector string (e.g., "p, h1, h2, h3")
 */
export function getReadableElementsSelector() {
  return READABLE_ELEMENTS_CONFIG.tags
    .map(tag => tag.toLowerCase())
    .join(', ');
}

/**
 * Filter an array of elements to only include readable ones with sufficient content
 * @param {HTMLElement[]} elements - Array of DOM elements to filter
 * @returns {HTMLElement[]} Filtered array of readable elements
 */
export function filterReadableElements(elements) {
  return elements.filter(element =>
    isReadableElement(element) && hasMinimumTextContent(element)
  );
}
