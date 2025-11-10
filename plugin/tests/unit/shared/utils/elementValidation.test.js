import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isReadableTag,
  hasMinimumTextContent,
  isElementVisible,
  isInteractiveElement,
  shouldShowPlayButton,
  isReadableElement,
  filterReadableElements,
  isNestedWithinAnother,
  removeNestedElements
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

  describe('isInteractiveElement', () => {
    it('should return true for button elements', () => {
      const button = document.createElement('button');
      expect(isInteractiveElement(button)).toBe(true);
    });

    it('should return true for link elements', () => {
      const link = document.createElement('a');
      expect(isInteractiveElement(link)).toBe(true);
    });

    it('should return true for input elements', () => {
      const input = document.createElement('input');
      expect(isInteractiveElement(input)).toBe(true);
    });

    it('should return true for textarea elements', () => {
      const textarea = document.createElement('textarea');
      expect(isInteractiveElement(textarea)).toBe(true);
    });

    it('should return true for select elements', () => {
      const select = document.createElement('select');
      expect(isInteractiveElement(select)).toBe(true);
    });

    it('should return true for label elements', () => {
      const label = document.createElement('label');
      expect(isInteractiveElement(label)).toBe(true);
    });

    it('should return false for non-interactive elements', () => {
      const p = document.createElement('p');
      const div = document.createElement('div');
      const span = document.createElement('span');

      expect(isInteractiveElement(p)).toBe(false);
      expect(isInteractiveElement(div)).toBe(false);
      expect(isInteractiveElement(span)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isInteractiveElement(null)).toBe(false);
      expect(isInteractiveElement(undefined)).toBe(false);
    });

    it('should return false for elements without tagName', () => {
      const fakeElement = {};
      expect(isInteractiveElement(fakeElement)).toBe(false);
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

    it('should return false for button elements even with sufficient text', () => {
      const button = document.createElement('button');
      button.textContent = 'This is a button with enough text content.';

      expect(shouldShowPlayButton(button)).toBe(false);
    });

    it('should return false for link elements even with sufficient text', () => {
      const link = document.createElement('a');
      link.textContent = 'This is a link with enough text content.';

      expect(shouldShowPlayButton(link)).toBe(false);
    });

    it('should return false for input elements', () => {
      const input = document.createElement('input');
      input.value = 'This is input text with enough content.';

      expect(shouldShowPlayButton(input)).toBe(false);
    });

    it('should return false for textarea elements even with sufficient text', () => {
      const textarea = document.createElement('textarea');
      textarea.textContent = 'This is textarea text with enough content.';

      expect(shouldShowPlayButton(textarea)).toBe(false);
    });

    it('should return false for select elements', () => {
      const select = document.createElement('select');
      const option = document.createElement('option');
      option.textContent = 'Option with enough text';
      select.appendChild(option);

      expect(shouldShowPlayButton(select)).toBe(false);
    });

    it('should return false for label elements even with sufficient text', () => {
      const label = document.createElement('label');
      label.textContent = 'This is a label with enough text content.';

      expect(shouldShowPlayButton(label)).toBe(false);
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

  describe('isNestedWithinAnother', () => {
    it('should return true if element is nested within another element in the list', () => {
      const parent = document.createElement('li');
      const child = document.createElement('p');
      parent.appendChild(child);

      const elements = [parent, child];
      expect(isNestedWithinAnother(child, elements)).toBe(true);
    });

    it('should return false if element is not nested within any other element', () => {
      const p1 = document.createElement('p');
      const p2 = document.createElement('p');

      const elements = [p1, p2];
      expect(isNestedWithinAnother(p1, elements)).toBe(false);
      expect(isNestedWithinAnother(p2, elements)).toBe(false);
    });

    it('should return false for the outermost element', () => {
      const parent = document.createElement('li');
      const child = document.createElement('p');
      parent.appendChild(child);

      const elements = [parent, child];
      expect(isNestedWithinAnother(parent, elements)).toBe(false);
    });

    it('should handle multiple levels of nesting', () => {
      const grandparent = document.createElement('blockquote');
      const parent = document.createElement('li');
      const child = document.createElement('p');

      grandparent.appendChild(parent);
      parent.appendChild(child);

      const elements = [grandparent, parent, child];

      expect(isNestedWithinAnother(child, elements)).toBe(true);
      expect(isNestedWithinAnother(parent, elements)).toBe(true);
      expect(isNestedWithinAnother(grandparent, elements)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      const p = document.createElement('p');
      expect(isNestedWithinAnother(null, [p])).toBe(false);
      expect(isNestedWithinAnother(undefined, [p])).toBe(false);
    });

    it('should return false for empty elements array', () => {
      const p = document.createElement('p');
      expect(isNestedWithinAnother(p, [])).toBe(false);
    });

    it('should return false if elements is null or undefined', () => {
      const p = document.createElement('p');
      expect(isNestedWithinAnother(p, null)).toBe(false);
      expect(isNestedWithinAnother(p, undefined)).toBe(false);
    });
  });

  describe('removeNestedElements', () => {
    it('should remove nested paragraph inside list item', () => {
      const li = document.createElement('li');
      const p = document.createElement('p');
      p.textContent = 'List item text content';
      li.appendChild(p);

      const elements = [li, p];
      const filtered = removeNestedElements(elements);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(li);
    });

    it('should remove nested paragraph inside blockquote', () => {
      const blockquote = document.createElement('blockquote');
      const p = document.createElement('p');
      p.textContent = 'Quote text content';
      blockquote.appendChild(p);

      const elements = [blockquote, p];
      const filtered = removeNestedElements(elements);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(blockquote);
    });

    it('should keep all elements if none are nested', () => {
      const p1 = document.createElement('p');
      const p2 = document.createElement('p');
      const h1 = document.createElement('h1');

      const elements = [p1, p2, h1];
      const filtered = removeNestedElements(elements);

      expect(filtered).toHaveLength(3);
      expect(filtered).toEqual(elements);
    });

    it('should handle multiple nested elements (real-world Cloudflare blog scenario)', () => {
      // Simulate: <ol><li><p>text1</p></li><li><p>text2</p></li></ol>
      const ol = document.createElement('ol');

      const li1 = document.createElement('li');
      const p1 = document.createElement('p');
      p1.textContent = 'All of the fatal panics happen within stack unwinding.';
      li1.appendChild(p1);
      ol.appendChild(li1);

      const li2 = document.createElement('li');
      const p2 = document.createElement('p');
      p2.textContent = 'We correlated an increased volume of recovered panics.';
      li2.appendChild(p2);
      ol.appendChild(li2);

      // querySelectorAll would return both li and p elements
      const elements = [li1, p1, li2, p2];
      const filtered = removeNestedElements(elements);

      // Should only keep the li elements, removing the nested p elements
      expect(filtered).toHaveLength(2);
      expect(filtered[0]).toBe(li1);
      expect(filtered[1]).toBe(li2);
    });

    it('should handle deeply nested structures', () => {
      const outer = document.createElement('blockquote');
      const middle = document.createElement('li');
      const inner = document.createElement('p');

      outer.appendChild(middle);
      middle.appendChild(inner);

      const elements = [outer, middle, inner];
      const filtered = removeNestedElements(elements);

      // Should only keep the outermost element
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(outer);
    });

    it('should return empty array for empty input', () => {
      const filtered = removeNestedElements([]);
      expect(filtered).toEqual([]);
    });

    it('should return empty array for null or undefined', () => {
      expect(removeNestedElements(null)).toEqual([]);
      expect(removeNestedElements(undefined)).toEqual([]);
    });

    it('should handle mix of nested and non-nested elements', () => {
      const standalone = document.createElement('h1');
      standalone.textContent = 'Standalone heading';

      const li = document.createElement('li');
      const p = document.createElement('p');
      p.textContent = 'Nested paragraph';
      li.appendChild(p);

      const another = document.createElement('h2');
      another.textContent = 'Another standalone';

      const elements = [standalone, li, p, another];
      const filtered = removeNestedElements(elements);

      expect(filtered).toHaveLength(3);
      expect(filtered).toContain(standalone);
      expect(filtered).toContain(li);
      expect(filtered).toContain(another);
      expect(filtered).not.toContain(p);
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

    it('should remove nested readable elements to avoid duplicates', () => {
      // Simulate the Cloudflare blog issue: <li><p>text</p></li>
      const li = document.createElement('li');
      const p = document.createElement('p');
      p.textContent = 'All of the fatal panics happen within stack unwinding.';
      li.appendChild(p);

      const elements = [li, p];
      const filtered = filterReadableElements(elements);

      // Should only return the li, not the nested p
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(li);
    });

    it('should handle real-world nested list scenario', () => {
      // Simulate: <ol><li><p>text1</p></li><li><p>text2</p></li><li><p>text3</p></li></ol>
      const li1 = document.createElement('li');
      const p1 = document.createElement('p');
      p1.textContent = 'All of the fatal panics happen within stack unwinding.';
      li1.appendChild(p1);

      const li2 = document.createElement('li');
      const p2 = document.createElement('p');
      p2.textContent = 'We correlated an increased volume of recovered panics.';
      li2.appendChild(p2);

      const li3 = document.createElement('li');
      const p3 = document.createElement('p');
      p3.textContent = 'Recovering a panic unwinds goroutine stacks.';
      li3.appendChild(p3);

      const elements = [li1, p1, li2, p2, li3, p3];
      const filtered = filterReadableElements(elements);

      // Should only return the 3 list items, not the 3 nested paragraphs
      expect(filtered).toHaveLength(3);
      expect(filtered[0]).toBe(li1);
      expect(filtered[1]).toBe(li2);
      expect(filtered[2]).toBe(li3);
    });

    it('should handle blockquote with nested paragraph', () => {
      const blockquote = document.createElement('blockquote');
      const p = document.createElement('p');
      p.textContent = 'This is a quote with nested paragraph element.';
      blockquote.appendChild(p);

      const elements = [blockquote, p];
      const filtered = filterReadableElements(elements);

      // Should only return blockquote, not the nested paragraph
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(blockquote);
    });

    it('should keep standalone paragraphs when not nested', () => {
      const p1 = document.createElement('p');
      p1.textContent = 'First standalone paragraph with enough text.';

      const p2 = document.createElement('p');
      p2.textContent = 'Second standalone paragraph with enough text.';

      const elements = [p1, p2];
      const filtered = filterReadableElements(elements);

      // Both standalone paragraphs should be kept
      expect(filtered).toHaveLength(2);
      expect(filtered[0]).toBe(p1);
      expect(filtered[1]).toBe(p2);
    });
  });
});
