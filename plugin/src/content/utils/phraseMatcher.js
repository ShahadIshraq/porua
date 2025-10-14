/**
 * Simple word-count-based phrase matcher.
 * Matches phrases based on word count, ignoring punctuation and quotes.
 */
export class PhraseMatcher {
  constructor(originalText) {
    this.originalText = originalText;
  }

  /**
   * Find phrase by counting words from startIndex.
   * @param {string} phrase - Phrase to find
   * @param {number} startIndex - Start searching from this index
   * @returns {Object|null} Match result with {index, length, strategy}
   */
  find(phrase, startIndex = 0) {
    return this.findByWordCount(phrase, startIndex);
  }

  /**
   * Word-count-based matching.
   * Counts words from startIndex and matches based on word count.
   * Robust to punctuation, quotes, and formatting differences.
   */
  findByWordCount(phrase, startIndex = 0) {
    const phraseWords = this.extractWords(phrase);
    if (phraseWords.length === 0) return null;

    const targetWordCount = phraseWords.length;

    // Find the character positions of the target words
    let wordCount = 0;
    let matchStartIndex = -1;
    let matchEndIndex = -1;

    // Use regex to find word boundaries in the original text
    const wordRegex = /\b[\w']+\b/g;
    const textToSearch = this.originalText.substring(startIndex);
    let match;

    while ((match = wordRegex.exec(textToSearch)) !== null && wordCount < targetWordCount) {
      if (wordCount === 0) {
        matchStartIndex = startIndex + match.index;
      }
      wordCount++;

      if (wordCount === targetWordCount) {
        matchEndIndex = startIndex + match.index + match[0].length;
        break;
      }
    }

    if (wordCount === targetWordCount && matchStartIndex !== -1 && matchEndIndex !== -1) {
      return {
        index: matchStartIndex,
        length: matchEndIndex - matchStartIndex,
        strategy: 'word-count'
      };
    }

    return null;
  }

  /**
   * Extract words from text (letters, numbers, apostrophes).
   * @param {string} text
   * @returns {string[]}
   */
  extractWords(text) {
    if (!text) return [];

    const words = text.match(/\b[\w']+\b/g);
    return words || [];
  }
}
