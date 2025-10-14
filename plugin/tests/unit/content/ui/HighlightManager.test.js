import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HighlightManager } from '../../../../src/content/ui/HighlightManager.js';

describe('HighlightManager', () => {
  let highlightManager;
  let mockState;
  let mockParagraph;

  beforeEach(() => {
    // Mock PlaybackState
    mockState = {
      getParagraph: vi.fn(),
      getHighlightedPhrase: vi.fn(),
      setHighlightedPhrase: vi.fn()
    };

    // Create mock paragraph element
    mockParagraph = document.createElement('p');
    mockParagraph.textContent = 'Hello World this is a test';
    mockParagraph.querySelectorAll = vi.fn(() => []);
    mockParagraph.querySelector = vi.fn();

    highlightManager = new HighlightManager(mockState);

    // Mock window.innerHeight
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 768
    });
  });

  describe('constructor', () => {
    it('should store state reference', () => {
      expect(highlightManager.state).toBe(mockState);
    });
  });

  describe('wrapPhrases', () => {
    it('should wrap phrases in spans', () => {
      const timeline = [
        { phrase: 'Hello', startTime: 0, endTime: 500 },
        { phrase: 'World', startTime: 500, endTime: 1000 }
      ];

      highlightManager.wrapPhrases(mockParagraph, timeline);

      expect(mockParagraph.innerHTML).toContain('<span class="tts-phrase"');
      expect(mockParagraph.innerHTML).toContain('data-start-time="0"');
      expect(mockParagraph.innerHTML).toContain('data-end-time="500"');
      expect(mockParagraph.innerHTML).toContain('data-phrase-index="0"');
    });

    it('should store original HTML', () => {
      const originalHtml = mockParagraph.innerHTML;
      const timeline = [{ phrase: 'Hello', startTime: 0, endTime: 500 }];

      highlightManager.wrapPhrases(mockParagraph, timeline);

      expect(mockParagraph.dataset.originalHtml).toBe(originalHtml);
    });

    it('should not overwrite originalHtml if already set', () => {
      const originalHtml = '<strong>Original</strong>';
      mockParagraph.dataset.originalHtml = originalHtml;
      const timeline = [{ phrase: 'Hello', startTime: 0, endTime: 500 }];

      highlightManager.wrapPhrases(mockParagraph, timeline);

      expect(mockParagraph.dataset.originalHtml).toBe(originalHtml);
    });

    it('should handle multiple phrases', () => {
      const timeline = [
        { phrase: 'Hello', startTime: 0, endTime: 500 },
        { phrase: 'World', startTime: 500, endTime: 1000 },
        { phrase: 'test', startTime: 1000, endTime: 1500 }
      ];

      highlightManager.wrapPhrases(mockParagraph, timeline);

      expect(mockParagraph.innerHTML).toContain('data-phrase-index="0"');
      expect(mockParagraph.innerHTML).toContain('data-phrase-index="1"');
      expect(mockParagraph.innerHTML).toContain('data-phrase-index="2"');
    });

    it('should preserve text between phrases', () => {
      const timeline = [
        { phrase: 'Hello', startTime: 0, endTime: 500 },
        { phrase: 'test', startTime: 1000, endTime: 1500 }
      ];

      highlightManager.wrapPhrases(mockParagraph, timeline);

      // Should contain the text between "Hello" and "test"
      expect(mockParagraph.textContent).toContain('World this is a');
    });

    it('should handle phrase not found in text', () => {
      const timeline = [
        { phrase: 'Hello', startTime: 0, endTime: 500 },
        { phrase: 'NonExistent', startTime: 500, endTime: 1000 }
      ];

      expect(() => {
        highlightManager.wrapPhrases(mockParagraph, timeline);
      }).not.toThrow();
    });

    it('should escape HTML in matched text', () => {
      mockParagraph.textContent = '<div>alert("xss")</div>';
      const timeline = [
        { phrase: 'div', startTime: 0, endTime: 500 }
      ];

      highlightManager.wrapPhrases(mockParagraph, timeline);

      // Should escape the HTML entities in the final output
      expect(mockParagraph.innerHTML).not.toContain('<div>');
      expect(mockParagraph.innerHTML).toContain('&lt;');
      expect(mockParagraph.innerHTML).toContain('&gt;');
      // The word "div" should be wrapped
      expect(mockParagraph.innerHTML).toContain('<span class="tts-phrase"');
    });

    it('should handle empty timeline', () => {
      const originalText = mockParagraph.textContent;

      highlightManager.wrapPhrases(mockParagraph, []);

      expect(mockParagraph.textContent).toBe(originalText);
    });
  });

  describe('restoreParagraph', () => {
    it('should restore original HTML', () => {
      const originalHtml = '<strong>Original</strong>';
      mockParagraph.dataset.originalHtml = originalHtml;
      mockParagraph.innerHTML = '<span>Modified</span>';

      highlightManager.restoreParagraph(mockParagraph);

      expect(mockParagraph.innerHTML).toBe(originalHtml);
    });

    it('should delete originalHtml dataset', () => {
      mockParagraph.dataset.originalHtml = '<p>Test</p>';

      highlightManager.restoreParagraph(mockParagraph);

      expect(mockParagraph.dataset.originalHtml).toBeUndefined();
    });

    it('should remove highlight classes from phrases', () => {
      const mockHighlightedSpan = document.createElement('span');
      mockHighlightedSpan.classList.add('tts-phrase', 'tts-highlighted');
      mockParagraph.appendChild(mockHighlightedSpan);

      mockParagraph.querySelectorAll = vi.fn(() => [mockHighlightedSpan]);

      highlightManager.restoreParagraph(mockParagraph);

      expect(mockHighlightedSpan.classList.contains('tts-highlighted')).toBe(false);
    });

    it('should handle null paragraph', () => {
      expect(() => {
        highlightManager.restoreParagraph(null);
      }).not.toThrow();
    });

    it('should handle paragraph without originalHtml', () => {
      expect(() => {
        highlightManager.restoreParagraph(mockParagraph);
      }).not.toThrow();
    });
  });

  describe('updateHighlight', () => {
    let mockSpan1, mockSpan2, mockSpan3;

    beforeEach(() => {
      mockSpan1 = document.createElement('span');
      mockSpan1.className = 'tts-phrase';
      mockSpan1.dataset.startTime = '0';
      mockSpan1.dataset.endTime = '500';

      mockSpan2 = document.createElement('span');
      mockSpan2.className = 'tts-phrase';
      mockSpan2.dataset.startTime = '500';
      mockSpan2.dataset.endTime = '1000';

      mockSpan3 = document.createElement('span');
      mockSpan3.className = 'tts-phrase';
      mockSpan3.dataset.startTime = '1000';
      mockSpan3.dataset.endTime = '1500';

      mockParagraph.querySelectorAll = vi.fn(() => [mockSpan1, mockSpan2, mockSpan3]);
      mockState.getParagraph.mockReturnValue(mockParagraph);
    });

    it('should add highlight class to matching phrase', () => {
      mockState.getHighlightedPhrase.mockReturnValue(null);
      const scrollSpy = vi.spyOn(highlightManager, 'scrollToPhraseIfNeeded');

      highlightManager.updateHighlight(250);

      expect(mockSpan1.classList.contains('tts-highlighted')).toBe(true);
      expect(mockState.setHighlightedPhrase).toHaveBeenCalledWith(mockSpan1);
      expect(scrollSpy).toHaveBeenCalledWith(mockSpan1);
    });

    it('should highlight second phrase when time matches', () => {
      mockState.getHighlightedPhrase.mockReturnValue(null);

      highlightManager.updateHighlight(750);

      expect(mockSpan2.classList.contains('tts-highlighted')).toBe(true);
      expect(mockState.setHighlightedPhrase).toHaveBeenCalledWith(mockSpan2);
    });

    it('should remove previous highlight when switching phrases', () => {
      mockSpan1.classList.add('tts-highlighted');
      // Make spans connected to DOM
      Object.defineProperty(mockSpan1, 'isConnected', { value: true, writable: true });
      Object.defineProperty(mockSpan2, 'isConnected', { value: true, writable: true });
      mockState.getHighlightedPhrase.mockReturnValue(mockSpan1);

      highlightManager.updateHighlight(750);

      expect(mockSpan1.classList.contains('tts-highlighted')).toBe(false);
      expect(mockSpan2.classList.contains('tts-highlighted')).toBe(true);
    });

    it('should not update if same phrase already highlighted', () => {
      mockSpan1.classList.add('tts-highlighted');
      Object.defineProperty(mockSpan1, 'isConnected', { value: true, writable: true });
      mockState.getHighlightedPhrase.mockReturnValue(mockSpan1);
      // Clear the initial call from getHighlightedPhrase setup
      mockState.setHighlightedPhrase.mockClear();

      highlightManager.updateHighlight(250);

      expect(mockState.setHighlightedPhrase).not.toHaveBeenCalled();
    });

    it('should handle time at phrase boundary', () => {
      mockState.getHighlightedPhrase.mockReturnValue(null);

      highlightManager.updateHighlight(500);

      expect(mockSpan2.classList.contains('tts-highlighted')).toBe(true);
      expect(mockSpan1.classList.contains('tts-highlighted')).toBe(false);
    });

    it('should return early if no paragraph', () => {
      mockState.getParagraph.mockReturnValue(null);
      mockState.setHighlightedPhrase.mockClear();

      highlightManager.updateHighlight(100);

      expect(mockState.setHighlightedPhrase).not.toHaveBeenCalled();
    });

    it('should handle time outside all phrases', () => {
      mockState.getHighlightedPhrase.mockReturnValue(null);
      mockState.setHighlightedPhrase.mockClear();

      highlightManager.updateHighlight(9999);

      expect(mockState.setHighlightedPhrase).not.toHaveBeenCalled();
      expect(mockSpan1.classList.contains('tts-highlighted')).toBe(false);
      expect(mockSpan2.classList.contains('tts-highlighted')).toBe(false);
      expect(mockSpan3.classList.contains('tts-highlighted')).toBe(false);
    });
  });

  describe('scrollToPhraseIfNeeded', () => {
    let mockSpan;

    beforeEach(() => {
      mockSpan = document.createElement('span');
      mockSpan.scrollIntoView = vi.fn();
    });

    it('should scroll when phrase is above viewport', () => {
      mockSpan.getBoundingClientRect = vi.fn(() => ({
        top: -100,
        bottom: -50
      }));

      highlightManager.scrollToPhraseIfNeeded(mockSpan);

      expect(mockSpan.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    });

    it('should scroll when phrase is below viewport', () => {
      mockSpan.getBoundingClientRect = vi.fn(() => ({
        top: 1000,
        bottom: 1100
      }));

      highlightManager.scrollToPhraseIfNeeded(mockSpan);

      expect(mockSpan.scrollIntoView).toHaveBeenCalled();
    });

    it('should not scroll when phrase is visible', () => {
      mockSpan.getBoundingClientRect = vi.fn(() => ({
        top: 100,
        bottom: 200
      }));

      highlightManager.scrollToPhraseIfNeeded(mockSpan);

      expect(mockSpan.scrollIntoView).not.toHaveBeenCalled();
    });

    it('should not scroll when phrase is at top edge', () => {
      mockSpan.getBoundingClientRect = vi.fn(() => ({
        top: 0,
        bottom: 50
      }));

      highlightManager.scrollToPhraseIfNeeded(mockSpan);

      expect(mockSpan.scrollIntoView).not.toHaveBeenCalled();
    });

    it('should not scroll when phrase is at bottom edge', () => {
      mockSpan.getBoundingClientRect = vi.fn(() => ({
        top: 700,
        bottom: 768
      }));

      highlightManager.scrollToPhraseIfNeeded(mockSpan);

      expect(mockSpan.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe('clearHighlights', () => {
    it('should remove highlight from current phrase', () => {
      const mockSpan = document.createElement('span');
      mockSpan.classList.add('tts-highlighted');
      mockState.getHighlightedPhrase.mockReturnValue(mockSpan);

      highlightManager.clearHighlights();

      expect(mockSpan.classList.contains('tts-highlighted')).toBe(false);
      expect(mockState.setHighlightedPhrase).toHaveBeenCalledWith(null);
    });

    it('should remove highlights from all phrases in document', () => {
      const span1 = document.createElement('span');
      const span2 = document.createElement('span');
      span1.classList.add('tts-phrase', 'tts-highlighted');
      span2.classList.add('tts-phrase', 'tts-highlighted');

      document.querySelectorAll = vi.fn(() => [span1, span2]);

      highlightManager.clearHighlights();

      expect(span1.classList.contains('tts-highlighted')).toBe(false);
      expect(span2.classList.contains('tts-highlighted')).toBe(false);
    });

    it('should handle no highlighted phrase', () => {
      mockState.getHighlightedPhrase.mockReturnValue(null);
      document.querySelectorAll = vi.fn(() => []);

      expect(() => {
        highlightManager.clearHighlights();
      }).not.toThrow();
    });

    it('should handle empty document.querySelectorAll result', () => {
      mockState.getHighlightedPhrase.mockReturnValue(null);
      document.querySelectorAll = vi.fn(() => []);

      highlightManager.clearHighlights();

      // setHighlightedPhrase is only called if there was a highlighted phrase
      expect(document.querySelectorAll).toHaveBeenCalled();
    });
  });
});
