import { escapeHtml } from '../utils/dom.js';
import { PhraseMatcher } from '../utils/phraseMatcher.js';

export class HighlightManager {
  constructor(state) {
    this.state = state;
    this.mutationObserver = null;
    this.intersectionObserver = null;
    this.observedSpan = null;
  }

  wrapPhrases(paragraph, timeline) {
    if (!paragraph.dataset.originalHtml) {
      paragraph.dataset.originalHtml = paragraph.innerHTML;
    }

    const originalText = paragraph.textContent;
    const matcher = new PhraseMatcher(originalText);

    let currentIndex = 0;
    let html = '';
    let wrappedCount = 0;
    const failedPhrases = [];

    for (let timelineIndex = 0; timelineIndex < timeline.length; timelineIndex++) {
      const phraseData = timeline[timelineIndex];
      const phraseText = phraseData.phrase;

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

      // Add any gap text before this phrase
      if (match.index > currentIndex) {
        const gapText = originalText.substring(currentIndex, match.index);
        html += escapeHtml(gapText);
      }

      // Extract actual matched text from original
      const actualText = originalText.substring(
        match.index,
        match.index + match.length
      );

      // Create span with phrase data
      html += `<span class="tts-phrase" `;
      html += `data-start-time="${phraseData.startTime}" `;
      html += `data-end-time="${phraseData.endTime}" `;
      html += `data-phrase-index="${timelineIndex}"`;
      html += `>${escapeHtml(actualText)}</span>`;

      currentIndex = match.index + match.length;
      wrappedCount++;
    }

    // Add any remaining text after last phrase
    if (currentIndex < originalText.length) {
      html += escapeHtml(originalText.substring(currentIndex));
    }

    // Update paragraph HTML
    paragraph.innerHTML = html;

    // Setup DOM protection
    this.setupDOMProtection(paragraph);
  }

  /**
   * Setup MutationObserver to detect external DOM changes.
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
      paragraph.innerHTML = paragraph.dataset.originalHtml;
    }

    // Re-wrap
    this.wrapPhrases(paragraph, timeline);
  }

  restoreParagraph(paragraph) {
    if (!paragraph) return;

    if (paragraph.dataset.originalHtml) {
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

    let foundMatch = false;
    for (const span of phraseSpans) {
      const startTime = parseFloat(span.dataset.startTime);
      const endTime = parseFloat(span.dataset.endTime);
      const phraseIndex = span.dataset.phraseIndex;
      const phraseText = span.textContent;

      const isInRange = currentTimeMs >= startTime && currentTimeMs < endTime;

      if (isInRange) {
        foundMatch = true;
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
    // Stop observing previous span
    if (this.observedSpan && this.intersectionObserver) {
      this.intersectionObserver.unobserve(this.observedSpan);
    }

    // Setup intersection observer if not exists
    if (!this.intersectionObserver) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          // If not intersecting (not visible), scroll into view
          if (!entry.isIntersecting) {
            entry.target.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
        });
      }, {
        threshold: 0,
        rootMargin: '0px'
      });
    }

    // Observe new span
    this.observedSpan = phraseSpan;
    this.intersectionObserver.observe(phraseSpan);
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

    // Clean up intersection observer
    if (this.observedSpan && this.intersectionObserver) {
      this.intersectionObserver.unobserve(this.observedSpan);
      this.observedSpan = null;
    }
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
