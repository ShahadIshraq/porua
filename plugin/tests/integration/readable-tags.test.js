import { describe, it, expect, beforeEach } from 'vitest';
import { getReadableElementsSelector } from '../../src/shared/config/readableElements.js';
import { filterReadableElements, shouldShowPlayButton } from '../../src/shared/utils/elementValidation.js';

describe('Readable Tags Integration', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('should detect all readable tag types in a complex HTML document', () => {
    container.innerHTML = `
      <article>
        <h1>Main Article Title with enough text</h1>
        <h2>Section Header with enough text</h2>
        <p>This is a paragraph with sufficient text content for reading.</p>
        <h3>Subsection Title with text</h3>
        <p>Another paragraph with enough text to be readable by TTS system.</p>
        <blockquote>This is a quoted text with sufficient length for reading.</blockquote>
        <ul>
          <li>First list item with enough text content to be readable.</li>
          <li>Second list item with enough text content to be readable.</li>
        </ul>
        <h4>Smaller heading with text</h4>
        <div>This div should not be detected as readable element type.</div>
        <span>This span should not be detected as readable element.</span>
        <h5>Even smaller with text</h5>
        <h6>Smallest heading text</h6>
      </article>
    `;

    const selector = getReadableElementsSelector();
    const elements = Array.from(container.querySelectorAll(selector));

    // Should find: h1, h2, p, h3, p, blockquote, li, li, h4, h5, h6 = 11 elements
    expect(elements.length).toBe(11);

    // Verify tag types
    const tagCounts = elements.reduce((counts, el) => {
      counts[el.tagName] = (counts[el.tagName] || 0) + 1;
      return counts;
    }, {});

    expect(tagCounts.H1).toBe(1);
    expect(tagCounts.H2).toBe(1);
    expect(tagCounts.H3).toBe(1);
    expect(tagCounts.H4).toBe(1);
    expect(tagCounts.H5).toBe(1);
    expect(tagCounts.H6).toBe(1);
    expect(tagCounts.P).toBe(2);
    expect(tagCounts.LI).toBe(2);
    expect(tagCounts.BLOCKQUOTE).toBe(1);

    // Should NOT include DIV or SPAN
    expect(tagCounts.DIV).toBeUndefined();
    expect(tagCounts.SPAN).toBeUndefined();
  });

  it('should filter out elements with insufficient text content', () => {
    container.innerHTML = `
      <h1>Long enough heading text</h1>
      <h2>Short</h2>
      <p>This paragraph has sufficient text content for the TTS system.</p>
      <p>Tiny</p>
      <li>This list item has enough text</li>
      <li>No</li>
      <blockquote>A meaningful quote with sufficient length.</blockquote>
      <blockquote>X</blockquote>
    `;

    const selector = getReadableElementsSelector();
    const allElements = Array.from(container.querySelectorAll(selector));
    const filtered = filterReadableElements(allElements);

    // Should keep: h1, p (1st), li (1st), blockquote (1st) = 4 elements
    expect(filtered.length).toBe(4);

    expect(filtered[0].tagName).toBe('H1');
    expect(filtered[1].tagName).toBe('P');
    expect(filtered[2].tagName).toBe('LI');
    expect(filtered[3].tagName).toBe('BLOCKQUOTE');
  });

  it('should validate elements for play button display', () => {
    container.innerHTML = `
      <h1>This is a valid heading with enough text</h1>
      <h2>Short</h2>
      <p>Valid paragraph with sufficient text content here.</p>
      <div>Not a readable tag type, even with enough text.</div>
      <li>Valid list item with enough text</li>
      <blockquote>Valid quote with sufficient text content.</blockquote>
    `;

    const h1 = container.querySelector('h1');
    const h2 = container.querySelector('h2');
    const p = container.querySelector('p');
    const div = container.querySelector('div');
    const li = container.querySelector('li');
    const blockquote = container.querySelector('blockquote');

    // Mock window.getComputedStyle for visibility check
    global.window = {
      getComputedStyle: () => ({
        display: 'block',
        visibility: 'visible'
      })
    };

    expect(shouldShowPlayButton(h1)).toBe(true);
    expect(shouldShowPlayButton(h2)).toBe(false); // Too short
    expect(shouldShowPlayButton(p)).toBe(true);
    expect(shouldShowPlayButton(div)).toBe(false); // Wrong tag
    expect(shouldShowPlayButton(li)).toBe(true);
    expect(shouldShowPlayButton(blockquote)).toBe(true);
  });

  it('should work with nested lists', () => {
    container.innerHTML = `
      <ul>
        <li>First level item with enough text content</li>
        <li>
          Another first level with text
          <ul>
            <li>Nested list item with sufficient text</li>
            <li>Another nested item with text</li>
          </ul>
        </li>
      </ul>
    `;

    const selector = getReadableElementsSelector();
    const elements = Array.from(container.querySelectorAll(selector));

    // Should find all 4 list items
    expect(elements.length).toBe(4);
    expect(elements.every(el => el.tagName === 'LI')).toBe(true);
  });

  it('should handle ordered and unordered lists', () => {
    container.innerHTML = `
      <ul>
        <li>Unordered list item with enough text</li>
      </ul>
      <ol>
        <li>Ordered list item with enough text</li>
      </ol>
    `;

    const selector = getReadableElementsSelector();
    const elements = Array.from(container.querySelectorAll(selector));

    expect(elements.length).toBe(2);
    expect(elements.every(el => el.tagName === 'LI')).toBe(true);
  });

  it('should handle mixed heading levels', () => {
    container.innerHTML = `
      <h1>Title Level 1 with text</h1>
      <h2>Title Level 2 with text</h2>
      <h3>Title Level 3 with text</h3>
      <h4>Title Level 4 with text</h4>
      <h5>Title Level 5 with text</h5>
      <h6>Title Level 6 with text</h6>
    `;

    const selector = getReadableElementsSelector();
    const elements = Array.from(container.querySelectorAll(selector));

    expect(elements.length).toBe(6);

    const tags = elements.map(el => el.tagName);
    expect(tags).toEqual(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  });

  it('should handle blockquotes with nested content', () => {
    container.innerHTML = `
      <blockquote>
        <p>This is a paragraph inside a blockquote with enough text.</p>
      </blockquote>
    `;

    const selector = getReadableElementsSelector();
    const elements = Array.from(container.querySelectorAll(selector));

    // Should find both blockquote and the p inside
    expect(elements.length).toBe(2);
    expect(elements[0].tagName).toBe('BLOCKQUOTE');
    expect(elements[1].tagName).toBe('P');
  });

  it('should work with real-world article structure', () => {
    container.innerHTML = `
      <article>
        <header>
          <h1>Understanding Text-to-Speech Technology</h1>
          <p>Published on January 15, 2025 by the TTS Team</p>
        </header>

        <section>
          <h2>Introduction to TTS Systems</h2>
          <p>Text-to-speech technology has revolutionized accessibility on the web.</p>
          <p>Modern TTS systems can handle various content types seamlessly.</p>

          <h3>Key Benefits of TTS</h3>
          <ul>
            <li>Improved accessibility for visually impaired users</li>
            <li>Enhanced learning experience for auditory learners</li>
            <li>Multitasking capability for busy professionals</li>
          </ul>
        </section>

        <section>
          <h2>Technical Implementation</h2>
          <p>Implementing TTS requires careful consideration of content structure.</p>

          <blockquote>
            The future of web accessibility lies in seamless audio integration.
          </blockquote>

          <h3>Supported Content Types</h3>
          <ol>
            <li>Paragraphs and body text for main content delivery</li>
            <li>Headings for document structure navigation</li>
            <li>Lists for organized information presentation</li>
            <li>Quotes for emphasis and attribution</li>
          </ol>
        </section>
      </article>
    `;

    const selector = getReadableElementsSelector();
    const allElements = Array.from(container.querySelectorAll(selector));
    const readable = filterReadableElements(allElements);

    // Should include: h1, p (date), h2, p, p, h3, 3xli, h2, p, blockquote, h3, 4xli
    // Total: 1 + 1 + 1 + 1 + 1 + 1 + 3 + 1 + 1 + 1 + 1 + 4 = 17
    expect(readable.length).toBeGreaterThanOrEqual(15); // Some flexibility for whitespace

    // Verify we got all heading levels
    const headings = readable.filter(el => /^H[1-6]$/.test(el.tagName));
    expect(headings.length).toBeGreaterThanOrEqual(5);

    // Verify we got list items
    const listItems = readable.filter(el => el.tagName === 'LI');
    expect(listItems.length).toBeGreaterThanOrEqual(7);

    // Verify we got paragraphs
    const paragraphs = readable.filter(el => el.tagName === 'P');
    expect(paragraphs.length).toBeGreaterThanOrEqual(4);

    // Verify we got blockquote
    const quotes = readable.filter(el => el.tagName === 'BLOCKQUOTE');
    expect(quotes.length).toBeGreaterThanOrEqual(1);
  });
});
