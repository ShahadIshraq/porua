/**
 * Utility functions for validating HTML elements for TTS readability
 *
 * This module provides validation and filtering logic for determining which
 * HTML elements should be eligible for text-to-speech playback.
 */

import { READABLE_ELEMENTS_CONFIG } from '../config/readableElements.js';

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
 * Filter an array of elements to only include readable ones with sufficient content
 * @param {HTMLElement[]} elements - Array of DOM elements to filter
 * @returns {HTMLElement[]} Filtered array of readable elements
 */
export function filterReadableElements(elements) {
  return elements.filter(element =>
    isReadableElement(element) && hasMinimumTextContent(element)
  );
}
