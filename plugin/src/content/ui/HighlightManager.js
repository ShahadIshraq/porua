import { escapeHtml } from '../utils/dom.js';

export class HighlightManager {
  constructor(state) {
    this.state = state;
  }

  wrapPhrases(paragraph, timeline) {
    if (!paragraph.dataset.originalHtml) {
      paragraph.dataset.originalHtml = paragraph.innerHTML;
    }

    const originalText = paragraph.textContent;
    const phrasesToFind = timeline.map(t => t.phrase);

    let currentIndex = 0;
    let html = '';
    let timelineIndex = 0;

    for (const phraseText of phrasesToFind) {
      const phraseIndex = originalText.indexOf(phraseText, currentIndex);
      if (phraseIndex === -1) continue;

      if (phraseIndex > currentIndex) {
        html += escapeHtml(originalText.substring(currentIndex, phraseIndex));
      }

      const phraseData = timeline[timelineIndex];
      html += `<span class="tts-phrase" data-start-time="${phraseData.startTime}" data-end-time="${phraseData.endTime}" data-phrase-index="${timelineIndex}">${escapeHtml(phraseText)}</span>`;

      currentIndex = phraseIndex + phraseText.length;
      timelineIndex++;
    }

    if (currentIndex < originalText.length) {
      html += escapeHtml(originalText.substring(currentIndex));
    }

    paragraph.innerHTML = html;
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
    const paragraph = this.state.getParagraph();
    if (!paragraph) return;

    const phraseSpans = paragraph.querySelectorAll('.tts-phrase[data-start-time][data-end-time]');

    for (const span of phraseSpans) {
      const startTime = parseFloat(span.dataset.startTime);
      const endTime = parseFloat(span.dataset.endTime);

      if (currentTimeMs >= startTime && currentTimeMs < endTime) {
        const currentHighlight = this.state.getHighlightedPhrase();

        if (currentHighlight !== span) {
          if (currentHighlight) {
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
    const rect = phraseSpan.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const isAboveViewport = rect.top < 0;
    const isBelowViewport = rect.bottom > viewportHeight;

    if (isAboveViewport || isBelowViewport) {
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
}
