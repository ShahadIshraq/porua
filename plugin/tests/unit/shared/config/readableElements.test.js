import { describe, it, expect } from 'vitest';
import {
  READABLE_ELEMENTS_CONFIG,
  getReadableElementsSelector
} from '../../../../src/shared/config/readableElements.js';

describe('readableElements config', () => {
  describe('READABLE_ELEMENTS_CONFIG', () => {
    it('should contain expected tag types', () => {
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('P');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('H1');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('H2');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('H3');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('H4');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('H5');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('H6');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('LI');
      expect(READABLE_ELEMENTS_CONFIG.tags).toContain('BLOCKQUOTE');
    });

    it('should have a reasonable minTextLength', () => {
      expect(READABLE_ELEMENTS_CONFIG.minTextLength).toBeGreaterThan(0);
      expect(READABLE_ELEMENTS_CONFIG.minTextLength).toBeLessThan(100);
    });
  });

  describe('getReadableElementsSelector', () => {
    it('should return a valid CSS selector string', () => {
      const selector = getReadableElementsSelector();
      expect(selector).toBeTypeOf('string');
      expect(selector.length).toBeGreaterThan(0);
    });

    it('should include all readable tags in lowercase', () => {
      const selector = getReadableElementsSelector();
      expect(selector).toContain('p');
      expect(selector).toContain('h1');
      expect(selector).toContain('h2');
      expect(selector).toContain('h3');
      expect(selector).toContain('h4');
      expect(selector).toContain('h5');
      expect(selector).toContain('h6');
      expect(selector).toContain('li');
      expect(selector).toContain('blockquote');
    });

    it('should separate tags with commas', () => {
      const selector = getReadableElementsSelector();
      expect(selector).toContain(',');
    });

    it('should work with querySelectorAll', () => {
      // Create a test document
      const container = document.createElement('div');
      container.innerHTML = `
        <p>Paragraph</p>
        <h1>Heading 1</h1>
        <div>Not readable</div>
        <li>List item</li>
        <span>Not readable</span>
      `;

      const selector = getReadableElementsSelector();
      const elements = container.querySelectorAll(selector);

      expect(elements.length).toBe(3); // p, h1, li
      expect(elements[0].tagName).toBe('P');
      expect(elements[1].tagName).toBe('H1');
      expect(elements[2].tagName).toBe('LI');
    });
  });
});
