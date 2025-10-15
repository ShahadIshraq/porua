import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContinuousPlaybackController } from '../../../../src/content/controllers/ContinuousPlaybackController.js';
import { PLAYER_STATES } from '../../../../src/shared/utils/constants.js';

describe('ContinuousPlaybackController', () => {
  let controller;
  let mockState;
  let mockAudioQueue;
  let mockHighlightManager;
  let mockPrefetchManager;
  let mockParagraphQueue;
  let mockSynthesizeAndPlay;
  let p1, p2, p3;

  beforeEach(() => {
    // Create mock paragraphs
    p1 = document.createElement('p');
    p1.textContent = 'Paragraph 1';
    p2 = document.createElement('p');
    p2.textContent = 'Paragraph 2';
    p3 = document.createElement('p');
    p3.textContent = 'Paragraph 3';

    // Create mocks
    mockState = {
      setState: vi.fn(),
      isContinuousMode: vi.fn(() => true),
      setContinuousMode: vi.fn(),
      setPlayingParagraph: vi.fn(),
      getPhraseTimeline: vi.fn(() => [])
    };

    mockAudioQueue = {
      enqueue: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      queue: [],
      currentAudio: null
    };

    mockHighlightManager = {
      transitionToParagraph: vi.fn(),
      clearHighlights: vi.fn(),
      restoreParagraph: vi.fn()
    };

    mockPrefetchManager = {
      prefetch: vi.fn().mockResolvedValue(undefined),
      getPrefetched: vi.fn().mockResolvedValue(null),
      hasPrefetched: vi.fn(() => false),
      cancelPending: vi.fn(),
      clearCache: vi.fn()
    };

    mockParagraphQueue = {
      clear: vi.fn(),
      enqueue: vi.fn(),
      enqueueMultiple: vi.fn(),
      advance: vi.fn(),
      getCurrentParagraph: vi.fn(),
      getNextParagraph: vi.fn(),
      getUpcomingParagraphs: vi.fn(() => []),
      hasNext: vi.fn(() => false)
    };

    mockSynthesizeAndPlay = vi.fn().mockResolvedValue(undefined);

    controller = new ContinuousPlaybackController(
      mockState,
      mockAudioQueue,
      mockHighlightManager,
      mockPrefetchManager,
      mockParagraphQueue,
      mockSynthesizeAndPlay
    );
  });

  describe('playContinuous', () => {
    it('should setup queue and enable continuous mode', async () => {
      mockParagraphQueue.advance.mockReturnValue(p1);

      await controller.playContinuous(p1, [p2, p3]);

      expect(mockParagraphQueue.clear).toHaveBeenCalled();
      expect(mockParagraphQueue.enqueue).toHaveBeenCalledWith(p1);
      expect(mockParagraphQueue.enqueueMultiple).toHaveBeenCalledWith([p2, p3]);
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(true);
    });

    it('should start playing first paragraph', async () => {
      mockParagraphQueue.advance.mockReturnValue(p1);

      await controller.playContinuous(p1, [p2, p3]);

      expect(mockParagraphQueue.advance).toHaveBeenCalled();
      expect(mockSynthesizeAndPlay).toHaveBeenCalledWith('Paragraph 1', p1);
    });

    it('should stop and rethrow on error', async () => {
      mockParagraphQueue.advance.mockReturnValue(p1);
      mockSynthesizeAndPlay.mockRejectedValue(new Error('Fetch failed'));

      const stopSpy = vi.spyOn(controller, 'stop');

      await expect(controller.playContinuous(p1, [p2, p3])).rejects.toThrow('Fetch failed');

      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('handleStreamComplete', () => {
    it('should trigger prefetch when in continuous mode', async () => {
      mockParagraphQueue.getUpcomingParagraphs.mockReturnValue([p2, p3]);

      controller.handleStreamComplete();

      expect(mockParagraphQueue.getUpcomingParagraphs).toHaveBeenCalledWith(2);
      expect(mockPrefetchManager.prefetch).toHaveBeenCalledWith('Paragraph 2');
      expect(mockPrefetchManager.prefetch).toHaveBeenCalledWith('Paragraph 3');
    });

    it('should not prefetch when not in continuous mode', async () => {
      mockState.isContinuousMode.mockReturnValue(false);

      controller.handleStreamComplete();

      expect(mockPrefetchManager.prefetch).not.toHaveBeenCalled();
    });

    it('should skip already prefetched paragraphs', async () => {
      mockParagraphQueue.getUpcomingParagraphs.mockReturnValue([p2, p3]);
      mockPrefetchManager.hasPrefetched.mockImplementation(text =>
        text === 'Paragraph 2'
      );

      controller.handleStreamComplete();

      expect(mockPrefetchManager.prefetch).not.toHaveBeenCalledWith('Paragraph 2');
      expect(mockPrefetchManager.prefetch).toHaveBeenCalledWith('Paragraph 3');
    });
  });

  describe('handleAudioQueueEmpty', () => {
    it('should complete when no more paragraphs', async () => {
      mockParagraphQueue.hasNext.mockReturnValue(false);

      const onCompleteCallback = vi.fn();
      controller.onQueueComplete(onCompleteCallback);

      await controller.handleAudioQueueEmpty();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
      expect(onCompleteCallback).toHaveBeenCalled();
    });

    it('should transition to next paragraph when available', async () => {
      mockParagraphQueue.hasNext.mockReturnValue(true);
      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p1);
      mockParagraphQueue.advance.mockReturnValue(p2);
      mockPrefetchManager.getPrefetched.mockResolvedValue({
        audioBlobs: [new Blob()],
        metadataArray: [{}],
        phraseTimeline: []
      });

      await controller.handleAudioQueueEmpty();

      expect(mockParagraphQueue.advance).toHaveBeenCalled();
    });

    it('should do nothing when not in continuous mode', async () => {
      mockState.isContinuousMode.mockReturnValue(false);

      await controller.handleAudioQueueEmpty();

      expect(mockParagraphQueue.hasNext).not.toHaveBeenCalled();
    });
  });

  describe('transitionToNext', () => {
    it('should use cached data when available', async () => {
      const mockCachedData = {
        audioBlobs: [new Blob([1, 2, 3])],
        metadataArray: [{ chunk_index: 0 }],
        phraseTimeline: [{ phrase: 'test', startTime: 0 }]
      };

      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p1);
      mockParagraphQueue.advance.mockReturnValue(p2);
      mockPrefetchManager.getPrefetched.mockResolvedValue(mockCachedData);
      mockParagraphQueue.getUpcomingParagraphs.mockReturnValue([p3]);

      await controller.transitionToNext();

      expect(mockHighlightManager.transitionToParagraph).toHaveBeenCalledWith(
        p1,
        p2,
        mockCachedData.phraseTimeline
      );
      expect(mockAudioQueue.enqueue).toHaveBeenCalledWith(
        mockCachedData.audioBlobs[0],
        mockCachedData.metadataArray[0]
      );
      expect(mockAudioQueue.play).toHaveBeenCalled();
      expect(mockPrefetchManager.prefetch).toHaveBeenCalled();
    });

    it('should fetch on-demand when cache miss', async () => {
      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p1);
      mockParagraphQueue.advance.mockReturnValue(p2);
      mockPrefetchManager.getPrefetched.mockResolvedValue(null);
      mockState.getPhraseTimeline.mockReturnValue([]);

      await controller.transitionToNext();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.LOADING);
      expect(mockSynthesizeAndPlay).toHaveBeenCalledWith('Paragraph 2', p2);
    });

    it('should skip to next on error if available', async () => {
      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p1);
      mockParagraphQueue.advance.mockReturnValueOnce(p2).mockReturnValueOnce(p3);
      mockPrefetchManager.getPrefetched.mockResolvedValue(null);
      mockSynthesizeAndPlay.mockRejectedValueOnce(new Error('Failed'));
      mockParagraphQueue.hasNext.mockReturnValueOnce(true).mockReturnValueOnce(false);

      mockPrefetchManager.getPrefetched.mockResolvedValueOnce(null).mockResolvedValueOnce({
        audioBlobs: [new Blob()],
        metadataArray: [{}],
        phraseTimeline: []
      });

      await controller.transitionToNext();

      // Should have attempted to transition to next paragraph after error
      expect(mockParagraphQueue.advance).toHaveBeenCalledTimes(2);
    });

    it('should stop when error and no more paragraphs', async () => {
      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p1);
      mockParagraphQueue.advance.mockReturnValue(p2);
      mockPrefetchManager.getPrefetched.mockResolvedValue(null);
      mockSynthesizeAndPlay.mockRejectedValue(new Error('Failed'));
      mockParagraphQueue.hasNext.mockReturnValue(false);

      const stopSpy = vi.spyOn(controller, 'stop');

      await controller.transitionToNext();

      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('should pause audio and cancel prefetch', () => {
      controller.pause();

      expect(mockAudioQueue.pause).toHaveBeenCalled();
      expect(mockPrefetchManager.cancelPending).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('should resume audio queue', async () => {
      await controller.resume();

      expect(mockAudioQueue.resume).toHaveBeenCalled();
    });

    it('should transition to next if queue empty', async () => {
      mockAudioQueue.queue = [];
      mockAudioQueue.currentAudio = null;
      mockParagraphQueue.hasNext.mockReturnValue(true);
      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p1);
      mockParagraphQueue.advance.mockReturnValue(p2);
      mockPrefetchManager.getPrefetched.mockResolvedValue({
        audioBlobs: [new Blob()],
        metadataArray: [{}],
        phraseTimeline: []
      });

      await controller.resume();

      expect(mockParagraphQueue.advance).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should clear all state and restore paragraph', () => {
      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p1);

      controller.stop();

      expect(mockAudioQueue.clear).toHaveBeenCalled();
      expect(mockPrefetchManager.cancelPending).toHaveBeenCalled();
      expect(mockPrefetchManager.clearCache).toHaveBeenCalled();
      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
      expect(mockHighlightManager.clearHighlights).toHaveBeenCalled();
      expect(mockHighlightManager.restoreParagraph).toHaveBeenCalledWith(p1);
      expect(mockState.setPlayingParagraph).toHaveBeenCalledWith(null);
      expect(mockParagraphQueue.clear).toHaveBeenCalled();
    });
  });

  describe('handleQueueComplete', () => {
    it('should reset state and notify listeners', () => {
      mockParagraphQueue.getCurrentParagraph.mockReturnValue(p3);

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      controller.onQueueComplete(callback1);
      controller.onQueueComplete(callback2);

      controller.handleQueueComplete();

      expect(mockState.setState).toHaveBeenCalledWith(PLAYER_STATES.IDLE);
      expect(mockState.setContinuousMode).toHaveBeenCalledWith(false);
      expect(mockHighlightManager.clearHighlights).toHaveBeenCalled();
      expect(mockHighlightManager.restoreParagraph).toHaveBeenCalledWith(p3);
      expect(mockState.setPlayingParagraph).toHaveBeenCalledWith(null);
      expect(mockParagraphQueue.clear).toHaveBeenCalled();
      expect(mockPrefetchManager.clearCache).toHaveBeenCalled();
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('triggerPrefetch', () => {
    it('should prefetch next 2 paragraphs', async () => {
      mockParagraphQueue.getUpcomingParagraphs.mockReturnValue([p2, p3]);

      await controller.triggerPrefetch();

      expect(mockParagraphQueue.getUpcomingParagraphs).toHaveBeenCalledWith(2);
      expect(mockPrefetchManager.prefetch).toHaveBeenCalledTimes(2);
      expect(mockPrefetchManager.prefetch).toHaveBeenCalledWith('Paragraph 2');
      expect(mockPrefetchManager.prefetch).toHaveBeenCalledWith('Paragraph 3');
    });

    it('should do nothing when no upcoming paragraphs', async () => {
      mockParagraphQueue.getUpcomingParagraphs.mockReturnValue([]);

      await controller.triggerPrefetch();

      expect(mockPrefetchManager.prefetch).not.toHaveBeenCalled();
    });

    it('should skip already prefetched paragraphs', async () => {
      mockParagraphQueue.getUpcomingParagraphs.mockReturnValue([p2, p3]);
      mockPrefetchManager.hasPrefetched.mockImplementation(text => text === 'Paragraph 2');

      await controller.triggerPrefetch();

      expect(mockPrefetchManager.prefetch).toHaveBeenCalledTimes(1);
      expect(mockPrefetchManager.prefetch).toHaveBeenCalledWith('Paragraph 3');
    });

    it('should handle prefetch errors gracefully', async () => {
      mockParagraphQueue.getUpcomingParagraphs.mockReturnValue([p2]);
      mockPrefetchManager.prefetch.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await controller.triggerPrefetch();

      // Errors are logged but not propagated
      expect(mockPrefetchManager.prefetch).toHaveBeenCalled();
    });
  });
});
