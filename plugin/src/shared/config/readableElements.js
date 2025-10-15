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
 * Generate a CSS selector string for all readable elements
 * @returns {string} CSS selector string (e.g., "p, h1, h2, h3")
 */
export function getReadableElementsSelector() {
  return READABLE_ELEMENTS_CONFIG.tags
    .map(tag => tag.toLowerCase())
    .join(', ');
}
