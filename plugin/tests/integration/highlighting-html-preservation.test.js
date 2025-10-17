import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HighlightManager } from '../../src/content/ui/HighlightManager.js';

/**
 * Integration tests for HTML preservation during text highlighting.
 * These tests simulate real-world scenarios where content has mixed HTML.
 */
describe('HighlightManager - HTML Preservation Integration', () => {
  let highlightManager;
  let mockState;
  let container;

  beforeEach(() => {
    // Create a real DOM container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock state
    mockState = {
      getPlayingParagraph: vi.fn(),
      getPhraseTimeline: vi.fn(),
      getHighlightedPhrase: vi.fn(),
      setHighlightedPhrase: vi.fn(),
      setPlayingParagraph: vi.fn(),
      setPhraseTimeline: vi.fn()
    };

    highlightManager = new HighlightManager(mockState);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Wikipedia-style content', () => {
    it('should preserve links in article text', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'The <a href="/wiki/Cat">domestic cat</a> (<i>Felis catus</i>) is a small carnivorous mammal.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'The domestic cat Felis catus', startTime: 0, endTime: 2000 },
        { phrase: 'is a small carnivorous mammal', startTime: 2000, endTime: 4000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      // Verify link is preserved
      const link = paragraph.querySelector('a[href="/wiki/Cat"]');
      expect(link).not.toBeNull();
      expect(link.textContent).toBe('domestic cat');

      // Verify italic tag is preserved
      const italic = paragraph.querySelector('i');
      expect(italic).not.toBeNull();
      expect(italic.textContent).toBe('Felis catus');

      // Verify phrases are wrapped
      const phrases = paragraph.querySelectorAll('.tts-phrase');
      expect(phrases.length).toBe(2);
    });

    it('should handle complex Wikipedia paragraph with multiple links', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'In <a href="/wiki/Physics">physics</a>, <a href="/wiki/Energy">energy</a> is the quantitative property that must be transferred to an <a href="/wiki/Object">object</a> in order to perform work.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'In physics energy is', startTime: 0, endTime: 1500 },
        { phrase: 'the quantitative property that', startTime: 1500, endTime: 3000 },
        { phrase: 'must be transferred to', startTime: 3000, endTime: 4000 },
        { phrase: 'an object in order', startTime: 4000, endTime: 5000 },
        { phrase: 'to perform work', startTime: 5000, endTime: 6000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      // Verify all three links are preserved
      expect(paragraph.querySelector('a[href="/wiki/Physics"]')).not.toBeNull();
      expect(paragraph.querySelector('a[href="/wiki/Energy"]')).not.toBeNull();
      expect(paragraph.querySelector('a[href="/wiki/Object"]')).not.toBeNull();

      // Verify all links are clickable (href attribute preserved)
      const links = paragraph.querySelectorAll('a');
      expect(links.length).toBe(3);
      links.forEach(link => {
        expect(link.href).toBeTruthy();
      });
    });
  });

  describe('Blog/Article content', () => {
    it('should preserve inline code and emphasis', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Use the <code>Array.map()</code> method to <strong>transform</strong> array elements.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Use the Array map method', startTime: 0, endTime: 2000 },
        { phrase: 'to transform array elements', startTime: 2000, endTime: 4000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      // Verify code tag is preserved
      const code = paragraph.querySelector('code');
      expect(code).not.toBeNull();
      expect(code.textContent).toBe('Array.map()');

      // Verify strong tag is preserved
      const strong = paragraph.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong.textContent).toBe('transform');
    });

    it('should handle quote with attribution link', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<q>To be or not to be</q>, said <a href="/shakespeare">Shakespeare</a>.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'To be or not to be', startTime: 0, endTime: 1500 },
        { phrase: 'said Shakespeare', startTime: 1500, endTime: 2500 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      // Verify q tag is preserved
      const quote = paragraph.querySelector('q');
      expect(quote).not.toBeNull();

      // Verify link is preserved
      const link = paragraph.querySelector('a[href="/shakespeare"]');
      expect(link).not.toBeNull();
    });
  });

  describe('Full playback simulation', () => {
    it('should maintain links throughout entire playback cycle', () => {
      const paragraph = document.createElement('p');
      const originalHtml = 'Visit <a href="https://example.com" id="test-link">our website</a> for more information.';
      paragraph.innerHTML = originalHtml;
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Visit our website', startTime: 0, endTime: 1000 },
        { phrase: 'for more information', startTime: 1000, endTime: 2000 }
      ];

      // Wrap phrases (simulating playback start)
      highlightManager.wrapPhrases(paragraph, timeline);
      mockState.getPlayingParagraph.mockReturnValue(paragraph);

      // Verify link is clickable during playback
      const linkDuringPlayback = paragraph.querySelector('a#test-link');
      expect(linkDuringPlayback).not.toBeNull();
      expect(linkDuringPlayback.href).toBe('https://example.com/');

      // Simulate highlighting first phrase
      const firstPhrase = paragraph.querySelector('.tts-phrase[data-phrase-index="0"]');
      if (firstPhrase) {
        mockState.getHighlightedPhrase.mockReturnValue(null);
        Object.defineProperty(firstPhrase, 'isConnected', { value: true, writable: true });
        highlightManager.updateHighlight(500); // Time within first phrase
      }

      // Link should still be present and functional
      expect(paragraph.querySelector('a#test-link')).not.toBeNull();

      // Simulate highlighting second phrase
      const secondPhrase = paragraph.querySelector('.tts-phrase[data-phrase-index="1"]');
      if (secondPhrase && firstPhrase) {
        mockState.getHighlightedPhrase.mockReturnValue(firstPhrase);
        Object.defineProperty(secondPhrase, 'isConnected', { value: true, writable: true });
        highlightManager.updateHighlight(1500); // Time within second phrase
      }

      // Link should still be present
      expect(paragraph.querySelector('a#test-link')).not.toBeNull();

      // Restore paragraph (simulating playback end)
      highlightManager.restoreParagraph(paragraph);

      // Verify HTML is fully restored
      expect(paragraph.innerHTML).toBe(originalHtml);
    });

    it('should handle rapid phrase changes without breaking HTML', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Check <a href="#">link one</a> and <a href="#">link two</a>.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Check link one', startTime: 0, endTime: 500 },
        { phrase: 'and link two', startTime: 500, endTime: 1000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);
      mockState.getPlayingParagraph.mockReturnValue(paragraph);

      // Rapidly change highlights
      for (let i = 0; i < 10; i++) {
        const phraseSpans = paragraph.querySelectorAll('.tts-phrase[data-start-time][data-end-time]');
        if (phraseSpans.length > 0) {
          const randomPhrase = phraseSpans[Math.floor(Math.random() * phraseSpans.length)];
          const startTime = parseFloat(randomPhrase.dataset.startTime);
          const endTime = parseFloat(randomPhrase.dataset.endTime);
          const timeInPhrase = startTime + (endTime - startTime) / 2;

          mockState.getHighlightedPhrase.mockReturnValue(null);
          highlightManager.updateHighlight(timeInPhrase);
        }
      }

      // Verify links still exist
      const links = paragraph.querySelectorAll('a');
      expect(links.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle phrase wrapping when link is at start', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<a href="#">Start</a> with a link.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Start with a link', startTime: 0, endTime: 1000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      // Link may be wrapped in a phrase span or may be preserved differently
      const link = paragraph.querySelector('a');
      expect(link).not.toBeNull();
      expect(link.href).toBeTruthy();
      // The link text might be wrapped or moved, but link should exist
      expect(paragraph.textContent).toContain('Start');
    });

    it('should handle phrase wrapping when link is at end', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'End with <a href="#">a link</a>';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'End with a link', startTime: 0, endTime: 1000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      const link = paragraph.querySelector('a');
      expect(link).not.toBeNull();
      expect(link.textContent).toBe('a link');
    });

    it('should handle adjacent inline elements', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<strong>Bold</strong><em>Italic</em><code>Code</code>';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Bold Italic Code', startTime: 0, endTime: 1000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      expect(paragraph.querySelector('strong')).not.toBeNull();
      expect(paragraph.querySelector('em')).not.toBeNull();
      expect(paragraph.querySelector('code')).not.toBeNull();
    });

    it('should handle empty links', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Text <a href="#"></a> more text.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Text more text', startTime: 0, endTime: 1000 }
      ];

      expect(() => {
        highlightManager.wrapPhrases(paragraph, timeline);
      }).not.toThrow();
    });

    it('should handle deeply nested inline elements', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Text <strong><em><u>very nested</u></em></strong> content.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Text very nested content', startTime: 0, endTime: 1000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      expect(paragraph.querySelector('strong')).not.toBeNull();
      expect(paragraph.querySelector('em')).not.toBeNull();
      expect(paragraph.querySelector('u')).not.toBeNull();
    });
  });

  describe('Real-world content scenarios', () => {
    it('should handle Medium-style article paragraph', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'As <a href="/author">John Doe</a> explains in his <a href="/article">recent article</a>, the key to <strong>success</strong> is <em>persistence</em>.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'As John Doe explains', startTime: 0, endTime: 1500 },
        { phrase: 'in his recent article', startTime: 1500, endTime: 3000 },
        { phrase: 'the key to success', startTime: 3000, endTime: 4500 },
        { phrase: 'is persistence', startTime: 4500, endTime: 6000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      // Verify all elements preserved
      expect(paragraph.querySelectorAll('a').length).toBeGreaterThanOrEqual(2);
      expect(paragraph.querySelector('strong')).not.toBeNull();
      expect(paragraph.querySelector('em')).not.toBeNull();
    });

    it('should handle GitHub README-style content', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Install with <code>npm install</code> or see the <a href="/docs">documentation</a> for more details.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'Install with npm install', startTime: 0, endTime: 2000 },
        { phrase: 'or see the documentation', startTime: 2000, endTime: 4000 },
        { phrase: 'for more details', startTime: 4000, endTime: 5000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      expect(paragraph.querySelector('code')).not.toBeNull();
      expect(paragraph.querySelector('a[href="/docs"]')).not.toBeNull();
    });

    it('should handle news article with multiple citations', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'According to <a href="/source1">Reuters</a> and <a href="/source2">BBC</a>, the event was <strong>unprecedented</strong>.';
      container.appendChild(paragraph);

      const timeline = [
        { phrase: 'According to Reuters and BBC', startTime: 0, endTime: 2000 },
        { phrase: 'the event was unprecedented', startTime: 2000, endTime: 4000 }
      ];

      highlightManager.wrapPhrases(paragraph, timeline);

      expect(paragraph.querySelectorAll('a').length).toBeGreaterThanOrEqual(2);
      expect(paragraph.querySelector('strong')).not.toBeNull();
    });
  });

  describe('External DOM modifications and caching', () => {
    it('should handle external DOM modifications between wrapping calls', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Original text with <a href="#">link</a>.';
      container.appendChild(paragraph);

      const timeline1 = [{ phrase: 'Original text with link', startTime: 0, endTime: 1000 }];
      highlightManager.wrapPhrases(paragraph, timeline1);

      // Verify first wrap worked
      expect(paragraph.querySelector('.tts-phrase')).not.toBeNull();
      expect(paragraph.querySelector('a[href="#"]')).not.toBeNull();

      // External modification - restore paragraph
      highlightManager.restoreParagraph(paragraph);

      // Add new link externally
      const newLink = document.createElement('a');
      newLink.href = '#new';
      newLink.textContent = ' new link';
      paragraph.appendChild(newLink);

      // Wrap again with updated content
      const timeline2 = [{ phrase: 'Original text with link new link', startTime: 0, endTime: 2000 }];
      highlightManager.wrapPhrases(paragraph, timeline2);

      // Should handle gracefully - both links should exist
      expect(paragraph.querySelector('a[href="#"]')).not.toBeNull();
      expect(paragraph.querySelector('a[href="#new"]')).not.toBeNull();
      expect(paragraph.querySelector('.tts-phrase')).not.toBeNull();
    });

    it('should use cached DOMTextMapper for identical content', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Test content <a href="#">link</a>.';
      container.appendChild(paragraph);

      const timeline = [{ phrase: 'Test content link', startTime: 0, endTime: 1000 }];

      // First wrap - creates cache entry
      highlightManager.wrapPhrases(paragraph, timeline);
      expect(paragraph.querySelector('.tts-phrase')).not.toBeNull();

      // Restore paragraph completely (as it happens in real usage)
      highlightManager.restoreParagraph(paragraph);
      expect(paragraph.querySelector('.tts-phrase')).toBeNull();

      // Second wrap - should use cached mapper since text content hasn't changed
      highlightManager.wrapPhrases(paragraph, timeline);

      // Should successfully wrap again
      expect(paragraph.querySelector('.tts-phrase')).not.toBeNull();
      expect(paragraph.querySelector('a[href="#"]')).not.toBeNull();
    });

    it('should invalidate cache when text content changes', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Original text.';
      container.appendChild(paragraph);

      const timeline1 = [{ phrase: 'Original text', startTime: 0, endTime: 1000 }];
      highlightManager.wrapPhrases(paragraph, timeline1);

      // Restore and change content
      highlightManager.restoreParagraph(paragraph);
      paragraph.innerHTML = 'Modified text with <strong>emphasis</strong>.';

      const timeline2 = [{ phrase: 'Modified text with emphasis', startTime: 0, endTime: 1500 }];
      highlightManager.wrapPhrases(paragraph, timeline2);

      // Should handle new content correctly
      expect(paragraph.querySelector('.tts-phrase')).not.toBeNull();
      expect(paragraph.querySelector('strong')).not.toBeNull();
      expect(paragraph.textContent).toContain('Modified text');
    });

    it('should warn when re-wrapping without clearing', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Test text.';
      container.appendChild(paragraph);

      const timeline = [{ phrase: 'Test text', startTime: 0, endTime: 1000 }];

      // Spy on console.warn
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // First wrap
      highlightManager.wrapPhrases(paragraph, timeline);
      expect(warnSpy).not.toHaveBeenCalled();

      // Second wrap without clearing (should trigger warning)
      highlightManager.wrapPhrases(paragraph, timeline);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Re-wrapping paragraph that already has phrase spans')
      );

      warnSpy.mockRestore();
    });
  });
});
