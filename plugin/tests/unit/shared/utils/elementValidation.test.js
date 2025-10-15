import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isReadableTag,
  hasMinimumTextContent,
  isElementVisible,
  shouldShowPlayButton,
  isReadableElement,
  filterReadableElements
} from '../../../../src/shared/utils/elementValidation.js';

describe('elementValidation', () => {
  describe('isReadableTag', () => {
    it('should return true for paragraph elements', () => {
      const p = document.createElement('p');
      expect(isReadableTag(p)).toBe(true);
    });

    it('should return true for all heading elements', () => {
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
        const heading = document.createElement(tag);
        expect(isReadableTag(heading)).toBe(true);
      });
    });

    it('should return true for list items', () => {
      const li = document.createElement('li');
      expect(isReadableTag(li)).toBe(true);
    });

    it('should return true for blockquotes', () => {
      const blockquote = document.createElement('blockquote');
      expect(isReadableTag(blockquote)).toBe(true);
    });

    it('should return false for non-readable tags', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      const button = document.createElement('button');

      expect(isReadableTag(div)).toBe(false);
      expect(isReadableTag(span)).toBe(false);
      expect(isReadableTag(button)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isReadableTag(null)).toBe(false);
      expect(isReadableTag(undefined)).toBe(false);
    });

    it('should return false for elements without tagName', () => {
      const fakeElement = {};
      expect(isReadableTag(fakeElement)).toBe(false);
    });
  });

  describe('hasMinimumTextContent', () => {
    it('should return true for elements with sufficient text', () => {
      const p = document.createElement('p');
      p.textContent = 'This is enough text content for reading.';
      expect(hasMinimumTextContent(p)).toBe(true);
    });

    it('should return false for elements with too little text', () => {
      const p = document.createElement('p');
      p.textContent = 'Short';
      expect(hasMinimumTextContent(p)).toBe(false);
    });

    it('should return false for empty elements', () => {
      const p = document.createElement('p');
      p.textContent = '';
      expect(hasMinimumTextContent(p)).toBe(false);
    });

    it('should trim whitespace before checking length', () => {
      const p = document.createElement('p');
      p.textContent = '   Short   ';
      expect(hasMinimumTextContent(p)).toBe(false);
    });

    it('should handle elements with only whitespace', () => {
      const p = document.createElement('p');
      p.textContent = '     ';
      expect(hasMinimumTextContent(p)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(hasMinimumTextContent(null)).toBe(false);
      expect(hasMinimumTextContent(undefined)).toBe(false);
    });

    it('should return false for elements without textContent', () => {
      const fakeElement = {};
      expect(hasMinimumTextContent(fakeElement)).toBe(false);
    });
  });

  describe('isElementVisible', () => {
    beforeEach(() => {
      // Mock getComputedStyle for tests
      global.window = {
        getComputedStyle: vi.fn()
      };
    });

    it('should return true for visible elements', () => {
      const p = document.createElement('p');
      window.getComputedStyle.mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      expect(isElementVisible(p)).toBe(true);
    });

    it('should return false for elements with display:none', () => {
      const p = document.createElement('p');
      window.getComputedStyle.mockReturnValue({
        display: 'none',
        visibility: 'visible'
      });

      expect(isElementVisible(p)).toBe(false);
    });

    it('should return false for elements with visibility:hidden', () => {
      const p = document.createElement('p');
      window.getComputedStyle.mockReturnValue({
        display: 'block',
        visibility: 'hidden'
      });

      expect(isElementVisible(p)).toBe(false);
    });

    it('should return false for elements with aria-hidden=true', () => {
      const p = document.createElement('p');
      p.setAttribute('aria-hidden', 'true');
      window.getComputedStyle.mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      expect(isElementVisible(p)).toBe(false);
    });

    it('should return true for elements with aria-hidden=false', () => {
      const p = document.createElement('p');
      p.setAttribute('aria-hidden', 'false');
      window.getComputedStyle.mockReturnValue({
        display: 'block',
        visibility: 'visible'
      });

      expect(isElementVisible(p)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isElementVisible(null)).toBe(false);
      expect(isElementVisible(undefined)).toBe(false);
    });
  });

  describe('shouldShowPlayButton', () => {
    beforeEach(() => {
      global.window = {
        getComputedStyle: vi.fn().mockReturnValue({
          display: 'block',
          visibility: 'visible'
        })
      };
    });

    it('should return true for readable elements with sufficient visible text', () => {
      const p = document.createElement('p');
      p.textContent = 'This is a paragraph with enough text to be readable.';

      expect(shouldShowPlayButton(p)).toBe(true);
    });

    it('should return false for readable elements with insufficient text', () => {
      const p = document.createElement('p');
      p.textContent = 'Short';

      expect(shouldShowPlayButton(p)).toBe(false);
    });

    it('should return false for non-readable elements even with text', () => {
      const div = document.createElement('div');
      div.textContent = 'This is a div with enough text to be readable.';

      expect(shouldShowPlayButton(div)).toBe(false);
    });

    it('should return false for hidden readable elements', () => {
      const p = document.createElement('p');
      p.textContent = 'This is a paragraph with enough text to be readable.';
      window.getComputedStyle.mockReturnValue({
        display: 'none',
        visibility: 'visible'
      });

      expect(shouldShowPlayButton(p)).toBe(false);
    });

    it('should work with headings', () => {
      const h1 = document.createElement('h1');
      h1.textContent = 'This is a heading with enough text';

      expect(shouldShowPlayButton(h1)).toBe(true);
    });

    it('should work with list items', () => {
      const li = document.createElement('li');
      li.textContent = 'This is a list item with enough text';

      expect(shouldShowPlayButton(li)).toBe(true);
    });

    it('should work with blockquotes', () => {
      const blockquote = document.createElement('blockquote');
      blockquote.textContent = 'This is a quote with enough text to be readable.';

      expect(shouldShowPlayButton(blockquote)).toBe(true);
    });
  });

  describe('isReadableElement', () => {
    it('should return true for readable tag types', () => {
      const p = document.createElement('p');
      expect(isReadableElement(p)).toBe(true);
    });

    it('should return false for non-readable tag types', () => {
      const div = document.createElement('div');
      expect(isReadableElement(div)).toBe(false);
    });

    it('should be an alias for isReadableTag', () => {
      const p = document.createElement('p');
      expect(isReadableElement(p)).toBe(isReadableTag(p));
    });
  });

  describe('filterReadableElements', () => {
    it('should filter out non-readable elements', () => {
      const p = document.createElement('p');
      p.textContent = 'This is readable paragraph text content here.';

      const div = document.createElement('div');
      div.textContent = 'This is not a readable element type.';

      const elements = [p, div];
      const filtered = filterReadableElements(elements);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(p);
    });

    it('should filter out elements with insufficient text', () => {
      const p1 = document.createElement('p');
      p1.textContent = 'This has enough text to be readable.';

      const p2 = document.createElement('p');
      p2.textContent = 'Short';

      const elements = [p1, p2];
      const filtered = filterReadableElements(elements);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(p1);
    });

    it('should keep all valid readable elements', () => {
      const p = document.createElement('p');
      p.textContent = 'This is a paragraph with enough text.';

      const h1 = document.createElement('h1');
      h1.textContent = 'This is a heading with enough text.';

      const li = document.createElement('li');
      li.textContent = 'This is a list item with enough text.';

      const elements = [p, h1, li];
      const filtered = filterReadableElements(elements);

      expect(filtered).toHaveLength(3);
    });

    it('should return empty array for empty input', () => {
      const filtered = filterReadableElements([]);
      expect(filtered).toHaveLength(0);
    });

    it('should handle mixed valid and invalid elements', () => {
      const p = document.createElement('p');
      p.textContent = 'Valid paragraph with enough text content.';

      const div = document.createElement('div');
      div.textContent = 'Invalid tag type with enough text.';

      const h1 = document.createElement('h1');
      h1.textContent = 'Short';

      const li = document.createElement('li');
      li.textContent = 'Valid list item with enough text content.';

      const elements = [p, div, h1, li];
      const filtered = filterReadableElements(elements);

      expect(filtered).toHaveLength(2);
      expect(filtered[0]).toBe(p);
      expect(filtered[1]).toBe(li);
    });
  });
});
