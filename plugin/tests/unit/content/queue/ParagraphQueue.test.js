import { describe, it, expect, beforeEach } from 'vitest';
import { ParagraphQueue } from '../../../../src/content/queue/ParagraphQueue.js';

describe('ParagraphQueue', () => {
  let queue;
  let p1, p2, p3, p4;

  beforeEach(() => {
    queue = new ParagraphQueue();

    // Create mock paragraph elements
    p1 = document.createElement('p');
    p1.textContent = 'Paragraph 1';

    p2 = document.createElement('p');
    p2.textContent = 'Paragraph 2';

    p3 = document.createElement('p');
    p3.textContent = 'Paragraph 3';

    p4 = document.createElement('p');
    p4.textContent = 'Paragraph 4';
  });

  describe('initial state', () => {
    it('should initialize with empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it('should initialize with index -1', () => {
      expect(queue.getCurrentIndex()).toBe(-1);
    });

    it('should return null for current paragraph when empty', () => {
      expect(queue.getCurrentParagraph()).toBeNull();
    });

    it('should return null for next paragraph when empty', () => {
      expect(queue.getNextParagraph()).toBeNull();
    });

    it('should not have next when empty', () => {
      expect(queue.hasNext()).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('should add paragraph to queue', () => {
      queue.enqueue(p1);

      expect(queue.size()).toBe(1);
      expect(queue.isEmpty()).toBe(false);
    });

    it('should add multiple paragraphs', () => {
      queue.enqueue(p1);
      queue.enqueue(p2);
      queue.enqueue(p3);

      expect(queue.size()).toBe(3);
    });

    it('should handle null paragraph gracefully', () => {
      queue.enqueue(null);

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it('should handle undefined paragraph gracefully', () => {
      queue.enqueue(undefined);

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('enqueueMultiple', () => {
    it('should add multiple paragraphs at once', () => {
      queue.enqueueMultiple([p1, p2, p3]);

      expect(queue.size()).toBe(3);
    });

    it('should append to existing queue', () => {
      queue.enqueue(p1);
      queue.enqueueMultiple([p2, p3]);

      expect(queue.size()).toBe(3);
    });

    it('should handle empty array', () => {
      queue.enqueueMultiple([]);

      expect(queue.size()).toBe(0);
    });

    it('should handle non-array input gracefully', () => {
      queue.enqueueMultiple(null);

      expect(queue.size()).toBe(0);
    });
  });

  describe('getCurrentParagraph', () => {
    it('should return null before advance', () => {
      queue.enqueue(p1);

      expect(queue.getCurrentParagraph()).toBeNull();
    });

    it('should return current paragraph after advance', () => {
      queue.enqueue(p1);
      queue.advance();

      expect(queue.getCurrentParagraph()).toBe(p1);
    });

    it('should return correct paragraph after multiple advances', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0
      queue.advance(); // index 1

      expect(queue.getCurrentParagraph()).toBe(p2);
    });

    it('should return null when advanced past end', () => {
      queue.enqueue(p1);
      queue.advance();
      queue.advance(); // past end

      expect(queue.getCurrentParagraph()).toBeNull();
    });
  });

  describe('getNextParagraph', () => {
    it('should return first paragraph before any advance', () => {
      queue.enqueue(p1);

      expect(queue.getNextParagraph()).toBe(p1);
    });

    it('should return next paragraph without advancing', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // at p1

      expect(queue.getNextParagraph()).toBe(p2);
      expect(queue.getCurrentParagraph()).toBe(p1); // Still at p1
    });

    it('should return null when no next paragraph', () => {
      queue.enqueue(p1);
      queue.advance();

      expect(queue.getNextParagraph()).toBeNull();
    });
  });

  describe('getUpcomingParagraphs', () => {
    it('should return requested number of upcoming paragraphs', () => {
      queue.enqueueMultiple([p1, p2, p3, p4]);
      queue.advance(); // at p1

      const upcoming = queue.getUpcomingParagraphs(2);

      expect(upcoming).toEqual([p2, p3]);
    });

    it('should return all remaining if count exceeds available', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // at p1

      const upcoming = queue.getUpcomingParagraphs(5);

      expect(upcoming).toEqual([p2, p3]);
    });

    it('should return empty array when no upcoming paragraphs', () => {
      queue.enqueue(p1);
      queue.advance(); // at p1

      const upcoming = queue.getUpcomingParagraphs(2);

      expect(upcoming).toEqual([]);
    });

    it('should return all paragraphs when not yet advanced', () => {
      queue.enqueueMultiple([p1, p2, p3]);

      const upcoming = queue.getUpcomingParagraphs(2);

      expect(upcoming).toEqual([p1, p2]);
    });

    it('should handle count of 0', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance();

      const upcoming = queue.getUpcomingParagraphs(0);

      expect(upcoming).toEqual([]);
    });
  });

  describe('advance', () => {
    it('should move to first paragraph', () => {
      queue.enqueue(p1);

      const result = queue.advance();

      expect(result).toBe(p1);
      expect(queue.getCurrentIndex()).toBe(0);
      expect(queue.getCurrentParagraph()).toBe(p1);
    });

    it('should move through queue sequentially', () => {
      queue.enqueueMultiple([p1, p2, p3]);

      expect(queue.advance()).toBe(p1);
      expect(queue.getCurrentIndex()).toBe(0);

      expect(queue.advance()).toBe(p2);
      expect(queue.getCurrentIndex()).toBe(1);

      expect(queue.advance()).toBe(p3);
      expect(queue.getCurrentIndex()).toBe(2);
    });

    it('should return null when advancing past end', () => {
      queue.enqueue(p1);
      queue.advance();

      const result = queue.advance();

      expect(result).toBeNull();
    });

    it('should increment index even when past end', () => {
      queue.enqueue(p1);
      queue.advance(); // index 0
      queue.advance(); // index 1

      expect(queue.getCurrentIndex()).toBe(1);
    });
  });

  describe('hasNext', () => {
    it('should return true when paragraphs remain', () => {
      queue.enqueueMultiple([p1, p2]);
      queue.advance();

      expect(queue.hasNext()).toBe(true);
    });

    it('should return false when at last paragraph', () => {
      queue.enqueue(p1);
      queue.advance();

      expect(queue.hasNext()).toBe(false);
    });

    it('should return false when queue is empty', () => {
      expect(queue.hasNext()).toBe(false);
    });

    it('should return true before any advance with items', () => {
      queue.enqueue(p1);

      expect(queue.hasNext()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all paragraphs', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance();

      queue.clear();

      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it('should reset index to -1', () => {
      queue.enqueue(p1);
      queue.advance();

      queue.clear();

      expect(queue.getCurrentIndex()).toBe(-1);
    });

    it('should reset all state', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance();
      queue.advance();

      queue.clear();

      expect(queue.getCurrentParagraph()).toBeNull();
      expect(queue.getNextParagraph()).toBeNull();
      expect(queue.hasNext()).toBe(false);
    });

    it('should be idempotent', () => {
      queue.enqueue(p1);
      queue.clear();
      queue.clear();

      expect(queue.isEmpty()).toBe(true);
      expect(queue.getCurrentIndex()).toBe(-1);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('should return false when queue has items', () => {
      queue.enqueue(p1);

      expect(queue.isEmpty()).toBe(false);
    });

    it('should return true after clearing', () => {
      queue.enqueue(p1);
      queue.clear();

      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should return correct size', () => {
      queue.enqueueMultiple([p1, p2, p3]);

      expect(queue.size()).toBe(3);
    });

    it('should not change with advance', () => {
      queue.enqueueMultiple([p1, p2]);
      queue.advance();

      expect(queue.size()).toBe(2);
    });

    it('should return 0 after clear', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.clear();

      expect(queue.size()).toBe(0);
    });
  });

  describe('getPreviousParagraph', () => {
    it('should return null when no previous paragraph exists', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // at p1 (index 0)

      expect(queue.getPreviousParagraph()).toBeNull();
    });

    it('should return previous paragraph without moving index', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // at p1 (index 0)
      queue.advance(); // at p2 (index 1)

      expect(queue.getPreviousParagraph()).toBe(p1);
      expect(queue.getCurrentParagraph()).toBe(p2); // Still at p2
      expect(queue.getCurrentIndex()).toBe(1); // Index unchanged
    });

    it('should return correct previous paragraph after multiple advances', () => {
      queue.enqueueMultiple([p1, p2, p3, p4]);
      queue.advance(); // index 0
      queue.advance(); // index 1
      queue.advance(); // index 2

      expect(queue.getPreviousParagraph()).toBe(p2);
    });

    it('should return null before any advance', () => {
      queue.enqueueMultiple([p1, p2, p3]);

      expect(queue.getPreviousParagraph()).toBeNull();
    });

    it('should return null when queue is empty', () => {
      expect(queue.getPreviousParagraph()).toBeNull();
    });
  });

  describe('rewind', () => {
    it('should move back to previous paragraph', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0
      queue.advance(); // index 1

      const result = queue.rewind();

      expect(result).toBe(p1);
      expect(queue.getCurrentIndex()).toBe(0);
      expect(queue.getCurrentParagraph()).toBe(p1);
    });

    it('should return null when already at first paragraph', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0

      const result = queue.rewind();

      expect(result).toBeNull();
      expect(queue.getCurrentIndex()).toBe(0); // Still at 0
    });

    it('should return null before any advance', () => {
      queue.enqueueMultiple([p1, p2, p3]);

      const result = queue.rewind();

      expect(result).toBeNull();
      expect(queue.getCurrentIndex()).toBe(-1); // Still at -1
    });

    it('should move backward through queue sequentially', () => {
      queue.enqueueMultiple([p1, p2, p3, p4]);
      queue.advance(); // index 0
      queue.advance(); // index 1
      queue.advance(); // index 2
      queue.advance(); // index 3

      expect(queue.rewind()).toBe(p3);
      expect(queue.getCurrentIndex()).toBe(2);

      expect(queue.rewind()).toBe(p2);
      expect(queue.getCurrentIndex()).toBe(1);

      expect(queue.rewind()).toBe(p1);
      expect(queue.getCurrentIndex()).toBe(0);

      expect(queue.rewind()).toBeNull();
      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('should work correctly with advance after rewind', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0
      queue.advance(); // index 1

      queue.rewind(); // back to index 0

      expect(queue.advance()).toBe(p2);
      expect(queue.getCurrentIndex()).toBe(1);
    });
  });

  describe('hasPrevious', () => {
    it('should return false when at first paragraph', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0

      expect(queue.hasPrevious()).toBe(false);
    });

    it('should return true when previous paragraphs exist', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0
      queue.advance(); // index 1

      expect(queue.hasPrevious()).toBe(true);
    });

    it('should return false before any advance', () => {
      queue.enqueueMultiple([p1, p2, p3]);

      expect(queue.hasPrevious()).toBe(false);
    });

    it('should return false when queue is empty', () => {
      expect(queue.hasPrevious()).toBe(false);
    });

    it('should return true at last paragraph if previous exist', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0
      queue.advance(); // index 1
      queue.advance(); // index 2

      expect(queue.hasPrevious()).toBe(true);
    });

    it('should return false after rewind to first', () => {
      queue.enqueueMultiple([p1, p2, p3]);
      queue.advance(); // index 0
      queue.advance(); // index 1
      queue.rewind(); // back to index 0

      expect(queue.hasPrevious()).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete playback cycle', () => {
      // Setup
      queue.enqueueMultiple([p1, p2, p3]);

      // Start playback
      expect(queue.hasNext()).toBe(true);
      const first = queue.advance();
      expect(first).toBe(p1);

      // Move to second
      expect(queue.hasNext()).toBe(true);
      const second = queue.advance();
      expect(second).toBe(p2);

      // Move to third
      expect(queue.hasNext()).toBe(true);
      const third = queue.advance();
      expect(third).toBe(p3);

      // End of queue
      expect(queue.hasNext()).toBe(false);
    });

    it('should support prefetch look-ahead', () => {
      queue.enqueueMultiple([p1, p2, p3, p4]);
      queue.advance(); // Playing p1

      // Prefetch next 2
      const toPrefetch = queue.getUpcomingParagraphs(2);
      expect(toPrefetch).toEqual([p2, p3]);

      // Advance to p2
      queue.advance();

      // Prefetch next 2 (should get p3, p4)
      const nextPrefetch = queue.getUpcomingParagraphs(2);
      expect(nextPrefetch).toEqual([p3, p4]);
    });
  });
});
