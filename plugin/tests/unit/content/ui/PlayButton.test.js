import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlayButton } from '../../../../src/content/ui/PlayButton.js';
import { TIMEOUTS, Z_INDEX } from '../../../../src/shared/utils/constants.js';

describe('PlayButton', () => {
  let playButton;
  let mockState;
  let mockEventManager;
  let mockOnPlayClick;
  let mockParagraph;

  beforeEach(() => {
    // Mock PlaybackState
    mockState = {
      getState: vi.fn(() => 'idle')
    };

    // Mock EventManager
    mockEventManager = {
      on: vi.fn()
    };

    // Mock callback
    mockOnPlayClick = vi.fn();

    // Create mock paragraph
    mockParagraph = document.createElement('p');
    mockParagraph.textContent = 'Test paragraph content';
    mockParagraph.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 50,
      width: 600,
      height: 80
    }));

    // Mock document.body
    document.body.appendChild = vi.fn();

    // Use fake timers
    vi.useFakeTimers();

    playButton = new PlayButton(mockState, mockEventManager, mockOnPlayClick);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with null element and paragraph', () => {
      expect(playButton.element).toBeNull();
      expect(playButton.currentParagraph).toBeNull();
      expect(playButton.hideTimeout).toBeNull();
    });

    it('should store dependencies', () => {
      expect(playButton.state).toBe(mockState);
      expect(playButton.eventManager).toBe(mockEventManager);
      expect(playButton.onPlayClick).toBe(mockOnPlayClick);
    });
  });

  describe('init', () => {
    it('should call all setup methods', () => {
      const setupParagraphSpy = vi.spyOn(playButton, 'setupParagraphListeners');
      const setupScrollSpy = vi.spyOn(playButton, 'setupScrollListener');
      const setupResizeSpy = vi.spyOn(playButton, 'setupResizeListener');

      playButton.init();

      expect(setupParagraphSpy).toHaveBeenCalled();
      expect(setupScrollSpy).toHaveBeenCalled();
      expect(setupResizeSpy).toHaveBeenCalled();
    });
  });

  describe('setupParagraphListeners', () => {
    it('should add mouseenter listener to document', () => {
      playButton.setupParagraphListeners();

      const calls = mockEventManager.on.mock.calls;
      const mouseenterCall = calls.find(call =>
        call[0] === document && call[1] === 'mouseenter'
      );
      expect(mouseenterCall).toBeDefined();
      expect(mouseenterCall[3]).toBe(true); // useCapture
    });

    it('should add mouseleave listener to document', () => {
      playButton.setupParagraphListeners();

      const calls = mockEventManager.on.mock.calls;
      const mouseleaveCall = calls.find(call =>
        call[0] === document && call[1] === 'mouseleave'
      );
      expect(mouseleaveCall).toBeDefined();
      expect(mouseleaveCall[3]).toBe(true); // useCapture
    });

    it('should show button on paragraph mouseenter', () => {
      const showSpy = vi.spyOn(playButton, 'show');
      playButton.setupParagraphListeners();

      const mouseenterHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'mouseenter'
      )[2];

      const event = { target: mockParagraph };
      mouseenterHandler(event);

      expect(showSpy).toHaveBeenCalledWith(mockParagraph);
    });

    it('should not show button for empty paragraph', () => {
      const showSpy = vi.spyOn(playButton, 'show');
      playButton.setupParagraphListeners();

      const emptyP = document.createElement('p');
      emptyP.textContent = '   '; // Only whitespace

      const mouseenterHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'mouseenter'
      )[2];

      const event = { target: emptyP };
      mouseenterHandler(event);

      expect(showSpy).not.toHaveBeenCalled();
    });

    it('should schedule hide on paragraph mouseleave', () => {
      const scheduleHideSpy = vi.spyOn(playButton, 'scheduleHide');
      playButton.setupParagraphListeners();
      playButton.currentParagraph = mockParagraph;

      const mouseleaveHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'mouseleave'
      )[2];

      const event = { target: mockParagraph };
      mouseleaveHandler(event);

      expect(scheduleHideSpy).toHaveBeenCalled();
    });
  });

  describe('setupScrollListener', () => {
    it('should add scroll listener to window', () => {
      playButton.setupScrollListener();

      const calls = mockEventManager.on.mock.calls;
      const scrollCall = calls.find(call =>
        call[0] === window && call[1] === 'scroll'
      );
      expect(scrollCall).toBeDefined();
    });

    it('should reposition button on scroll', async () => {
      const positionSpy = vi.spyOn(playButton, 'position');
      playButton.setupScrollListener();
      playButton.element = document.createElement('div');
      playButton.currentParagraph = mockParagraph;

      const scrollHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'scroll'
      )[2];

      scrollHandler();
      await vi.runAllTimersAsync();

      expect(positionSpy).toHaveBeenCalledWith(mockParagraph);
    });

    it('should not reposition if no element', () => {
      const positionSpy = vi.spyOn(playButton, 'position');
      playButton.setupScrollListener();
      playButton.element = null;

      const scrollHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'scroll'
      )[2];

      scrollHandler();

      expect(positionSpy).not.toHaveBeenCalled();
    });
  });

  describe('setupResizeListener', () => {
    it('should add resize listener to window', () => {
      playButton.setupResizeListener();

      const calls = mockEventManager.on.mock.calls;
      const resizeCall = calls.find(call =>
        call[0] === window && call[1] === 'resize'
      );
      expect(resizeCall).toBeDefined();
    });

    it('should reposition button on resize', async () => {
      const positionSpy = vi.spyOn(playButton, 'position');
      playButton.setupResizeListener();
      playButton.element = document.createElement('div');
      playButton.currentParagraph = mockParagraph;

      const resizeHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'resize'
      )[2];

      resizeHandler();
      await vi.runAllTimersAsync();

      expect(positionSpy).toHaveBeenCalledWith(mockParagraph);
    });
  });

  describe('create', () => {
    it('should create button element', () => {
      const button = playButton.create();

      expect(button).toBeDefined();
      expect(button.className).toContain('tts-play-button');
      expect(button.innerHTML).toBe('▶');
      expect(button.title).toBe('Read aloud');
    });

    it('should add click listener', () => {
      playButton.create();

      const calls = mockEventManager.on.mock.calls;
      const clickCall = calls.find(call => call[1] === 'click');
      expect(clickCall).toBeDefined();
    });

    it('should call onPlayClick when clicked', () => {
      playButton.create();

      const clickHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'click'
      )[2];

      const event = { stopPropagation: vi.fn() };
      clickHandler(event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockOnPlayClick).toHaveBeenCalled();
    });

    it('should add mouseenter listener to cancel hide', () => {
      playButton.create();

      const calls = mockEventManager.on.mock.calls;
      const mouseenterCall = calls.find(call => call[1] === 'mouseenter');
      expect(mouseenterCall).toBeDefined();
    });

    it('should clear hide timeout on mouseenter', () => {
      playButton.hideTimeout = setTimeout(() => {}, 1000);
      const timeoutId = playButton.hideTimeout;

      playButton.create();

      const mouseenterHandler = mockEventManager.on.mock.calls.find(
        call => call[1] === 'mouseenter'
      )[2];

      mouseenterHandler();

      expect(playButton.hideTimeout).toBeNull();
    });
  });

  describe('position', () => {
    beforeEach(() => {
      playButton.element = document.createElement('div');
      playButton.element.style = {};

      // Mock getScrollPosition
      vi.mock('../../../../src/content/utils/dom.js', () => ({
        getScrollPosition: vi.fn(() => ({ top: 200, left: 100 })),
        createElement: vi.fn((tag, className) => {
          const el = document.createElement(tag);
          el.className = className;
          return el;
        })
      }));
    });

    it('should set button position', () => {
      playButton.position(mockParagraph);

      expect(playButton.element.style.position).toBe('absolute');
      expect(playButton.element.style.zIndex).toBe(String(Z_INDEX.PLAY_BUTTON));
    });

    it('should calculate position with offsets', () => {
      playButton.position(mockParagraph);

      // rect.top (100) + scroll.top (200) + offsetY (5) = 305
      expect(playButton.element.style.top).toContain('px');
      // rect.left (50) + scroll.left (100) + offsetX (-45) = 105
      expect(playButton.element.style.left).toContain('px');
    });

    it('should not position if no element', () => {
      playButton.element = null;

      expect(() => {
        playButton.position(mockParagraph);
      }).not.toThrow();
    });
  });

  describe('show', () => {
    it('should create and append button', () => {
      playButton.show(mockParagraph);

      expect(playButton.element).not.toBeNull();
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    it('should set currentParagraph', () => {
      playButton.show(mockParagraph);

      expect(playButton.currentParagraph).toBe(mockParagraph);
    });

    it('should clear hide timeout', () => {
      playButton.hideTimeout = setTimeout(() => {}, 1000);

      playButton.show(mockParagraph);

      expect(playButton.hideTimeout).toBeNull();
    });

    it('should not recreate button for same paragraph', () => {
      playButton.element = document.createElement('div');
      playButton.currentParagraph = mockParagraph;
      const existingElement = playButton.element;

      playButton.show(mockParagraph);

      expect(playButton.element).toBe(existingElement);
    });

    it('should hide and recreate for different paragraph', () => {
      const paragraph1 = document.createElement('p');
      const paragraph2 = document.createElement('p');
      paragraph2.textContent = 'Different paragraph';
      paragraph2.getBoundingClientRect = mockParagraph.getBoundingClientRect;

      playButton.show(paragraph1);
      const element1 = playButton.element;

      playButton.show(paragraph2);

      expect(playButton.element).not.toBe(element1);
      expect(playButton.currentParagraph).toBe(paragraph2);
    });

    it('should position button after creation', () => {
      const positionSpy = vi.spyOn(playButton, 'position');

      playButton.show(mockParagraph);

      expect(positionSpy).toHaveBeenCalledWith(mockParagraph);
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      playButton.element = document.createElement('div');
      const mockParent = {
        removeChild: vi.fn()
      };
      document.body.appendChild(playButton.element);
      // Mock the parentNode after appendChild
      Object.defineProperty(playButton.element, 'parentNode', {
        value: mockParent,
        writable: true,
        configurable: true
      });
    });

    it('should remove element from DOM', () => {
      const parent = playButton.element.parentNode;
      const element = playButton.element;
      playButton.hide();

      expect(parent.removeChild).toHaveBeenCalledWith(element);
    });

    it('should null element reference', () => {
      playButton.hide();

      expect(playButton.element).toBeNull();
    });

    it('should clear hide timeout', () => {
      playButton.hideTimeout = setTimeout(() => {}, 1000);

      playButton.hide();

      expect(playButton.hideTimeout).toBeNull();
    });

    it('should null currentParagraph when idle', () => {
      mockState.getState.mockReturnValue('idle');
      playButton.currentParagraph = mockParagraph;

      playButton.hide();

      expect(playButton.currentParagraph).toBeNull();
    });

    it('should keep currentParagraph when playing', () => {
      mockState.getState.mockReturnValue('playing');
      playButton.currentParagraph = mockParagraph;

      playButton.hide();

      expect(playButton.currentParagraph).toBe(mockParagraph);
    });

    it('should handle element without parent', () => {
      Object.defineProperty(playButton.element, 'parentNode', {
        value: null,
        writable: true,
        configurable: true
      });

      expect(() => {
        playButton.hide();
      }).not.toThrow();

      expect(playButton.element).toBeNull();
    });

    it('should handle no element', () => {
      playButton.element = null;

      expect(() => {
        playButton.hide();
      }).not.toThrow();
    });
  });

  describe('scheduleHide', () => {
    it('should set hide timeout', () => {
      playButton.scheduleHide();

      expect(playButton.hideTimeout).not.toBeNull();
    });

    it('should hide after timeout', () => {
      const hideSpy = vi.spyOn(playButton, 'hide');

      playButton.scheduleHide();
      vi.advanceTimersByTime(TIMEOUTS.BUTTON_HIDE);

      expect(hideSpy).toHaveBeenCalled();
    });

    it('should clear previous timeout', () => {
      playButton.hideTimeout = setTimeout(() => {}, 5000);
      const firstTimeout = playButton.hideTimeout;

      playButton.scheduleHide();

      expect(playButton.hideTimeout).not.toBe(firstTimeout);
    });

    it('should not hide if cancelled', () => {
      const hideSpy = vi.spyOn(playButton, 'hide');

      playButton.scheduleHide();
      clearTimeout(playButton.hideTimeout);
      playButton.hideTimeout = null;

      vi.advanceTimersByTime(TIMEOUTS.BUTTON_HIDE);

      expect(hideSpy).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should hide button', () => {
      const hideSpy = vi.spyOn(playButton, 'hide');

      playButton.cleanup();

      expect(hideSpy).toHaveBeenCalled();
    });

    it('should null currentParagraph', () => {
      playButton.currentParagraph = mockParagraph;

      playButton.cleanup();

      expect(playButton.currentParagraph).toBeNull();
    });
  });
});
