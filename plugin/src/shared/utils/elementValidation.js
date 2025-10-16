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

  // Check if element is an actual Element node (not text node, comment, etc.)
  if (element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  // Check if element has the necessary DOM methods
  if (typeof element.getAttribute !== 'function') {
    return false;
  }

  // Check if element has display: none or visibility: hidden
  try {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  } catch (e) {
    // If getComputedStyle fails, consider the element invalid
    return false;
  }

  // Check aria-hidden attribute
  if (element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  return true;
}

/**
 * Check if an element is an interactive element (button, link, input, etc.)
 * or is contained within one (excluding links which can contain readable text)
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the element is interactive or inside an interactive element
 */
export function isInteractiveElement(element) {
  if (!element || !element.tagName) {
    return false;
  }

  // Interactive tags that should not show play buttons
  const interactiveTags = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'LABEL'];

  // Links are treated separately - the link itself shouldn't show play button,
  // but elements inside links can (e.g., <a><p>text</p></a>)
  if (element.tagName === 'A') {
    return true;
  }

  // Check if the element itself is interactive
  if (interactiveTags.includes(element.tagName)) {
    return true;
  }

  // Check if the element is inside an interactive element (except links)
  if (element.closest) {
    try {
      const interactiveSelector = interactiveTags.map(tag => tag.toLowerCase()).join(', ');
      return element.closest(interactiveSelector) !== null;
    } catch (e) {
      return false;
    }
  }

  return false;
}

/**
 * Check if an element contains interactive child elements (excluding links)
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the element contains interactive children
 */
export function containsInteractiveElements(element) {
  if (!element || !element.querySelectorAll) {
    return false;
  }

  // Check for interactive elements but exclude links (articles can contain links)
  const interactiveSelectors = ['button', 'input', 'textarea', 'select', 'label'];
  const selector = interactiveSelectors.join(', ');

  try {
    return element.querySelectorAll(selector).length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * Comprehensive check if an element should show the play button
 * Combines all validation rules
 * @param {HTMLElement} element - The DOM element to check
 * @returns {boolean} True if the play button should be shown for this element
 */
export function shouldShowPlayButton(element) {
  if (!element) {
    return false;
  }

  return (
    isReadableTag(element) &&
    hasMinimumTextContent(element) &&
    isElementVisible(element) &&
    !isInteractiveElement(element) &&
    !containsInteractiveElements(element)
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
