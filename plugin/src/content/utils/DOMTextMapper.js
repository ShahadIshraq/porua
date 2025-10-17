/**
 * Maps character positions in plain text to their corresponding DOM text nodes.
 * This allows us to wrap text ranges in elements while preserving existing HTML structure.
 */
export class DOMTextMapper {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.map = []; // Array of {node, startOffset, endOffset, textStart, textEnd}
    this.buildMap();
  }

  /**
   * Build mapping from plain text positions to DOM text nodes.
   *
   * Note: Zero-length text nodes are intentionally skipped as they don't contribute
   * to the visible text content. This ensures accurate mapping between character
   * positions and DOM nodes.
   */
  buildMap() {
    let textPosition = 0;
    this.traverseTextNodes(this.rootElement, (textNode) => {
      const length = textNode.textContent.length;
      if (length > 0) {
        this.map.push({
          node: textNode,
          startOffset: 0,
          endOffset: length,
          textStart: textPosition,
          textEnd: textPosition + length
        });
        textPosition += length;
      }
    });
  }

  /**
   * Traverse DOM tree and call callback for each text node.
   */
  traverseTextNodes(node, callback) {
    if (node.nodeType === Node.TEXT_NODE) {
      callback(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (let child of node.childNodes) {
        this.traverseTextNodes(child, callback);
      }
    }
  }

  /**
   * Find all text nodes that overlap with [start, end) range.
   * Returns array of {node, startOffset, endOffset} where offsets are within the text node.
   */
  getNodesInRange(start, end) {
    return this.map
      .filter(entry => entry.textStart < end && entry.textEnd > start)
      .map(entry => ({
        node: entry.node,
        // Calculate the slice within this specific text node
        startOffset: Math.max(0, start - entry.textStart),
        endOffset: Math.min(entry.node.textContent.length, end - entry.textStart)
      }));
  }

  /**
   * Get the total text length (sum of all text node lengths).
   */
  getTotalLength() {
    if (this.map.length === 0) return 0;
    const lastEntry = this.map[this.map.length - 1];
    return lastEntry.textEnd;
  }

  /**
   * Create a Range object from text offset positions.
   * @param {number} start - Start position in plain text
   * @param {number} end - End position in plain text
   * @returns {Range|null} DOM Range or null if invalid positions
   */
  createRangeFromTextOffset(start, end) {
    if (start < 0 || end < start) return null;

    const range = document.createRange();
    let foundStart = false;

    for (const entry of this.map) {
      // Find start position
      if (!foundStart && entry.textStart <= start && entry.textEnd > start) {
        const offset = start - entry.textStart;
        range.setStart(entry.node, offset);
        foundStart = true;
      }

      // Find end position
      if (foundStart && entry.textStart < end && entry.textEnd >= end) {
        const offset = end - entry.textStart;
        range.setEnd(entry.node, offset);
        return range;
      }
    }

    // If we found start but not end, set end to last possible position
    if (foundStart && this.map.length > 0) {
      const lastEntry = this.map[this.map.length - 1];
      range.setEnd(lastEntry.node, lastEntry.endOffset);
      return range;
    }

    return null;
  }

  /**
   * Get plain text representation (same as element.textContent).
   */
  getPlainText() {
    return this.rootElement.textContent;
  }
}
