import { escapeHtml } from '../utils/dom.js';
import { PhraseMatcher } from '../utils/phraseMatcher.js';
import { DOMTextMapper } from '../utils/DOMTextMapper.js';

export class HighlightManager {
  constructor(state) {
    this.state = state;
    this.mutationObserver = null;
    // WeakMap cache for DOMTextMapper instances to improve performance
    this.mapperCache = new WeakMap();
  }

  wrapPhrases(paragraph, timeline) {
    if (!paragraph.dataset.originalHtml) {
      // Safe: Storing original page HTML for later restoration
      // eslint-disable-next-line no-unsanitized/property
      paragraph.dataset.originalHtml = paragraph.innerHTML;
    }

    // Clear any existing phrase spans first
    this.clearPhraseSpans(paragraph);

    const originalText = paragraph.textContent;
    const matcher = new PhraseMatcher(originalText);

    // Get or create mapper from cache
    let mapper = this.mapperCache.get(paragraph);
    if (!mapper || mapper.getPlainText() !== originalText) {
      // Create new mapper if cache is empty or text has changed
      mapper = new DOMTextMapper(paragraph);
      this.mapperCache.set(paragraph, mapper);
    }

    let currentIndex = 0;
    const failedPhrases = [];

    for (let timelineIndex = 0; timelineIndex < timeline.length; timelineIndex++) {
      const phraseData = timeline[timelineIndex];
      const phraseText = phraseData.text;

      // Use word-count matcher
      const match = matcher.find(phraseText, currentIndex);

      if (!match) {
        failedPhrases.push({
          index: timelineIndex,
          phrase: phraseText,
          searchStart: currentIndex
        });
        continue;
      }

      // Try to wrap the phrase using Range API
      try {
        this.wrapPhraseWithRange(
          mapper,
          match.index,
          match.index + match.length,
          phraseData,
          timelineIndex
        );
      } catch (e) {
        // If Range API fails, fall back to manual wrapping
        this.wrapPhraseManually(
          paragraph,
          match.index,
          match.index + match.length,
          phraseData,
          timelineIndex
        );
      }

      currentIndex = match.index + match.length;
    }

    // Setup DOM protection
    this.setupDOMProtection(paragraph);
  }

  /**
   * Clear existing phrase spans without destroying other HTML.
   * Unwraps all .tts-phrase spans while preserving their content and other HTML elements.
   * Uses DocumentFragment for better performance with large documents.
   *
   * @param {HTMLElement} paragraph - The paragraph element to clear phrase spans from
   */
  clearPhraseSpans(paragraph) {
    const phraseSpans = Array.from(paragraph.querySelectorAll('.tts-phrase'));

    phraseSpans.forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;

      // Use DocumentFragment to batch DOM operations
      const fragment = document.createDocumentFragment();
      while (span.firstChild) {
        fragment.appendChild(span.firstChild);
      }
      parent.replaceChild(fragment, span);
    });

    // Normalize to merge adjacent text nodes
    paragraph.normalize();
  }

  /**
   * Wrap a phrase using the Range API (preserves HTML structure).
   * This is the preferred method as it maintains the original DOM structure.
   *
   * @param {DOMTextMapper} mapper - Text-to-DOM position mapper
   * @param {number} startPos - Start position in plain text
   * @param {number} endPos - End position in plain text
   * @param {Object} phraseData - Phrase metadata containing startTime, endTime, and phrase text
   * @param {number} timelineIndex - Index in the phrase timeline
   * @throws {Error} If range cannot be created or surroundContents fails due to partial node selection
   */
  wrapPhraseWithRange(mapper, startPos, endPos, phraseData, timelineIndex) {
    const range = mapper.createRangeFromTextOffset(startPos, endPos);
    if (!range) {
      throw new Error(`Could not create range from text offsets [${startPos}, ${endPos}]`);
    }

    // Create the phrase span
    const phraseSpan = document.createElement('span');
    phraseSpan.className = 'tts-phrase';
    phraseSpan.dataset.startTime = phraseData.startTime;
    phraseSpan.dataset.endTime = phraseData.endTime;
    phraseSpan.dataset.phraseIndex = timelineIndex;

    // surroundContents() only works if the range doesn't partially select nodes
    // This works for most cases where phrases align with word boundaries
    try {
      range.surroundContents(phraseSpan);
    } catch (e) {
      // Only catch specific DOM exceptions related to partial node selection
      if (e instanceof DOMException &&
          (e.name === 'InvalidStateError' || e.name === 'HierarchyRequestError')) {
        // Expected error when phrase spans partial nodes, let caller handle with manual wrapping
        throw e;
      }
      // Unexpected error, log and rethrow
      console.error('Unexpected error in surroundContents:', e);
      throw e;
    }
  }

  /**
   * Manually wrap a phrase when Range.surroundContents() fails.
   * This handles cases where the phrase spans partial nodes or crosses element boundaries.
   *
   * @param {HTMLElement} paragraph - The paragraph element containing the text
   * @param {number} startPos - Start position in plain text
   * @param {number} endPos - End position in plain text
   * @param {Object} phraseData - Phrase metadata containing startTime, endTime, and phrase text
   * @param {number} timelineIndex - Index in the phrase timeline
   */
  wrapPhraseManually(paragraph, startPos, endPos, phraseData, timelineIndex) {
    const mapper = new DOMTextMapper(paragraph);
    const affectedNodes = mapper.getNodesInRange(startPos, endPos);

    if (affectedNodes.length === 0) {
      return;
    }

    // Case 1: Phrase is entirely within one text node
    if (affectedNodes.length === 1) {
      const { node, startOffset, endOffset } = affectedNodes[0];
      this.wrapTextNodeRange(node, startOffset, endOffset, phraseData, timelineIndex);
      return;
    }

    // Case 2: Phrase spans multiple text nodes
    // Create a wrapper span and extract the content into it
    const firstNode = affectedNodes[0];
    const lastNode = affectedNodes[affectedNodes.length - 1];

    const phraseSpan = document.createElement('span');
    phraseSpan.className = 'tts-phrase';
    phraseSpan.dataset.startTime = phraseData.startTime;
    phraseSpan.dataset.endTime = phraseData.endTime;
    phraseSpan.dataset.phraseIndex = timelineIndex;

    // Create a range spanning the entire phrase
    const range = document.createRange();
    range.setStart(firstNode.node, firstNode.startOffset);
    range.setEnd(lastNode.node, lastNode.endOffset);

    // Extract contents and wrap them
    const contents = range.extractContents();
    phraseSpan.appendChild(contents);
    range.insertNode(phraseSpan);

    // Normalize to clean up any fragmented text nodes
    paragraph.normalize();
  }

  /**
   * Wrap a portion of a single text node by splitting it into three parts.
   * This is used when a phrase is contained entirely within one text node.
   *
   * @param {Text} textNode - The text node to split and wrap
   * @param {number} startOffset - Start offset within the text node
   * @param {number} endOffset - End offset within the text node
   * @param {Object} phraseData - Phrase metadata containing startTime, endTime, and phrase text
   * @param {number} timelineIndex - Index in the phrase timeline
   */
  wrapTextNodeRange(textNode, startOffset, endOffset, phraseData, timelineIndex) {
    const text = textNode.textContent;
    const before = text.slice(0, startOffset);
    const target = text.slice(startOffset, endOffset);
    const after = text.slice(endOffset);

    const phraseSpan = document.createElement('span');
    phraseSpan.className = 'tts-phrase';
    phraseSpan.dataset.startTime = phraseData.startTime;
    phraseSpan.dataset.endTime = phraseData.endTime;
    phraseSpan.dataset.phraseIndex = timelineIndex;
    phraseSpan.textContent = target;

    const parent = textNode.parentNode;
    const beforeNode = before ? document.createTextNode(before) : null;
    const afterNode = after ? document.createTextNode(after) : null;

    // Replace the text node with the three parts
    if (beforeNode) parent.insertBefore(beforeNode, textNode);
    parent.insertBefore(phraseSpan, textNode);
    if (afterNode) parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);
  }

  /**
   * Setup MutationObserver to detect external DOM changes.
   * If phrase spans are removed by external code, this will attempt to re-wrap them.
   *
   * @param {HTMLElement} paragraph - The paragraph element to monitor for changes
   */
  setupDOMProtection(paragraph) {
    // Disconnect existing observer
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          // Check if our phrase spans still exist
          const phraseSpans = paragraph.querySelectorAll('.tts-phrase');

          if (phraseSpans.length === 0) {
            this.attemptReWrap();
          }
        }
      }
    });

    // Observe changes to paragraph
    this.mutationObserver.observe(paragraph, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  /**
   * Attempt to re-wrap phrases after DOM corruption.
   */
  attemptReWrap() {
    const paragraph = this.state.getPlayingParagraph();
    const timeline = this.state.getPhraseTimeline();

    if (!paragraph || !timeline || timeline.length === 0) {
      return;
    }

    // Restore original HTML
    if (paragraph.dataset.originalHtml) {
      // Safe: Restoring previously saved page HTML (no user input)
      // eslint-disable-next-line no-unsanitized/property
      paragraph.innerHTML = paragraph.dataset.originalHtml;
    }

    // Re-wrap
    this.wrapPhrases(paragraph, timeline);
  }

  restoreParagraph(paragraph) {
    if (!paragraph) return;

    if (paragraph.dataset.originalHtml) {
      // Safe: Restoring previously saved page HTML (no user input)
      // eslint-disable-next-line no-unsanitized/property
      paragraph.innerHTML = paragraph.dataset.originalHtml;
      delete paragraph.dataset.originalHtml;
    }

    const highlightedPhrases = paragraph.querySelectorAll('.tts-phrase.tts-highlighted');
    highlightedPhrases.forEach(el => el.classList.remove('tts-highlighted'));
  }

  updateHighlight(currentTimeMs) {
    const paragraph = this.state.getPlayingParagraph();
    if (!paragraph) return;

    // Check if the paragraph still has phrase spans
    const phraseSpans = paragraph.querySelectorAll('.tts-phrase[data-start-time][data-end-time]');

    if (phraseSpans.length === 0) {
      // Attempt to re-wrap if we still have timeline data
      const timeline = this.state.getPhraseTimeline();
      if (timeline && timeline.length > 0 && paragraph.dataset.originalHtml) {
        this.wrapPhrases(paragraph, timeline);
      }
      return;
    }

    for (const span of phraseSpans) {
      const startTime = parseFloat(span.dataset.startTime);
      const endTime = parseFloat(span.dataset.endTime);

      const isInRange = currentTimeMs >= startTime && currentTimeMs < endTime;

      if (isInRange) {
        const currentHighlight = this.state.getHighlightedPhrase();

        // Check if current highlight is still valid (attached to DOM)
        if (currentHighlight && !currentHighlight.isConnected) {
          this.state.setHighlightedPhrase(null);
        }

        if (currentHighlight !== span) {
          if (currentHighlight && currentHighlight.isConnected) {
            currentHighlight.classList.remove('tts-highlighted');
          }

          span.classList.add('tts-highlighted');
          this.state.setHighlightedPhrase(span);
          this.scrollToPhraseIfNeeded(span);
        }
        return;
      }
    }
  }

  scrollToPhraseIfNeeded(phraseSpan) {
    // Check if element is currently visible in viewport
    const rect = phraseSpan.getBoundingClientRect();
    const isVisible = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );

    // Only scroll if not visible (one-time check, no continuous observation)
    if (!isVisible) {
      phraseSpan.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }

  clearHighlights() {
    const currentHighlight = this.state.getHighlightedPhrase();
    if (currentHighlight) {
      currentHighlight.classList.remove('tts-highlighted');
      this.state.setHighlightedPhrase(null);
    }

    document.querySelectorAll('.tts-phrase.tts-highlighted').forEach(el => {
      el.classList.remove('tts-highlighted');
    });
  }

  /**
   * Transition highlights from one paragraph to another (for continuous playback)
   * @param {HTMLElement} oldParagraph - The paragraph to restore
   * @param {HTMLElement} newParagraph - The paragraph to prepare
   * @param {Array} newTimeline - Timeline for the new paragraph
   */
  transitionToParagraph(oldParagraph, newParagraph, newTimeline) {
    if (oldParagraph) {
      this.clearHighlights();
      this.restoreParagraph(oldParagraph);
    }

    if (newParagraph && newTimeline.length > 0) {
      this.wrapPhrases(newParagraph, newTimeline);
    }

    this.state.setPlayingParagraph(newParagraph);
    this.state.setPhraseTimeline(newTimeline);
  }
}
