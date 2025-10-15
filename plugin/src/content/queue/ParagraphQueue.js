/**
 * Manages a queue of paragraphs for continuous playback
 */
export class ParagraphQueue {
  constructor() {
    this.paragraphs = [];
    this.currentIndex = -1;
  }

  /**
   * Add a single paragraph to the queue
   * @param {HTMLElement} paragraph
   */
  enqueue(paragraph) {
    if (paragraph) {
      this.paragraphs.push(paragraph);
    }
  }

  /**
   * Add multiple paragraphs to the queue
   * @param {Array<HTMLElement>} paragraphs
   */
  enqueueMultiple(paragraphs) {
    if (Array.isArray(paragraphs)) {
      this.paragraphs.push(...paragraphs);
    }
  }

  /**
   * Get the current paragraph without advancing
   * @returns {HTMLElement|null}
   */
  getCurrentParagraph() {
    if (this.currentIndex >= 0 && this.currentIndex < this.paragraphs.length) {
      return this.paragraphs[this.currentIndex];
    }
    return null;
  }

  /**
   * Get the next paragraph without advancing
   * @returns {HTMLElement|null}
   */
  getNextParagraph() {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex < this.paragraphs.length) {
      return this.paragraphs[nextIndex];
    }
    return null;
  }

  /**
   * Get multiple upcoming paragraphs without advancing
   * @param {number} count - Number of paragraphs to retrieve
   * @returns {Array<HTMLElement>}
   */
  getUpcomingParagraphs(count) {
    const startIndex = this.currentIndex + 1;
    const endIndex = Math.min(startIndex + count, this.paragraphs.length);
    return this.paragraphs.slice(startIndex, endIndex);
  }

  /**
   * Move to the next paragraph and return it
   * @returns {HTMLElement|null}
   */
  advance() {
    this.currentIndex++;
    return this.getCurrentParagraph();
  }

  /**
   * Check if there are more paragraphs after the current one
   * @returns {boolean}
   */
  hasNext() {
    return this.currentIndex + 1 < this.paragraphs.length;
  }

  /**
   * Clear all paragraphs and reset index
   */
  clear() {
    this.paragraphs = [];
    this.currentIndex = -1;
  }

  /**
   * Check if the queue is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.paragraphs.length === 0;
  }

  /**
   * Get the total number of paragraphs
   * @returns {number}
   */
  size() {
    return this.paragraphs.length;
  }

  /**
   * Get the current position in the queue (0-indexed)
   * @returns {number}
   */
  getCurrentIndex() {
    return this.currentIndex;
  }
}
