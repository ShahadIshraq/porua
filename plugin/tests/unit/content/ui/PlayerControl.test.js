import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerControl } from '../../../../src/content/ui/PlayerControl.js';
import { PLAYER_STATES, Z_INDEX } from '../../../../src/shared/utils/constants.js';

describe('PlayerControl', () => {
  let playerControl;
  let mockState;
  let mockEventManager;
  let mockOnButtonClick;

  beforeEach(() => {
    // Mock PlaybackState with subscribe
    mockState = {
      subscribe: vi.fn((callback) => {
        mockState._stateCallback = callback;
        return vi.fn(); // Return unsubscribe function
      }),
      subscribeToSkipState: vi.fn((callback) => {
        mockState._skipStateCallback = callback;
        return vi.fn(); // Return unsubscribe function
      })
    };

    // Mock EventManager
    mockEventManager = {
      on: vi.fn(),
      off: vi.fn()
    };

    // Mock callbacks
    mockOnButtonClick = vi.fn();
    const mockOnSkipForward = vi.fn();
    const mockOnSkipBackward = vi.fn();

    // Mock document.body
    document.body.appendChild = vi.fn();

    // Mock window dimensions
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800
    });
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200
    });

    playerControl = new PlayerControl(
      mockState,
      mockEventManager,
      mockOnButtonClick,
      mockOnSkipForward,
      mockOnSkipBackward
    );
  });

  describe('constructor', () => {
    it('should initialize with null element and button', () => {
      expect(playerControl.element).toBeNull();
      expect(playerControl.button).toBeNull();
      expect(playerControl.isDragging).toBe(false);
    });

    it('should store dependencies', () => {
      expect(playerControl.state).toBe(mockState);
      expect(playerControl.eventManager).toBe(mockEventManager);
      expect(playerControl.onButtonClick).toBe(mockOnButtonClick);
    });

    it('should subscribe to state changes', () => {
      expect(mockState.subscribe).toHaveBeenCalled();
    });

    it('should call updateUI when state changes', () => {
      const updateSpy = vi.spyOn(playerControl, 'updateUI');
      const callback = mockState.subscribe.mock.calls[0][0];

      callback(PLAYER_STATES.PLAYING);

      expect(updateSpy).toHaveBeenCalledWith(PLAYER_STATES.PLAYING);
    });
  });

  describe('create', () => {
    it('should create control element', () => {
      const control = playerControl.create();

      expect(control).toBeDefined();
      expect(control.className).toContain('tts-player-control');
    });

    it('should create button element', () => {
      const control = playerControl.create();

      expect(playerControl.button).not.toBeNull();
      expect(playerControl.button.className).toContain('tts-player-button');
      expect(playerControl.button.innerHTML).toBe('▶');
    });

    it('should append button to control', () => {
      const control = playerControl.create();

      expect(control.contains(playerControl.button)).toBe(true);
    });

    it('should add click listener to button', () => {
      playerControl.create();

      const calls = mockEventManager.on.mock.calls;
      const clickCall = calls.find(call => call[1] === 'click');
      expect(clickCall).toBeDefined();
    });

    it('should call onButtonClick when button clicked', () => {
      playerControl.create();

      // Find the click handler for the tts-player-button specifically
      const clickHandler = mockEventManager.on.mock.calls.find(
        call => call[0] === playerControl.button && call[1] === 'click'
      )[2];

      const event = { stopPropagation: vi.fn() };
      clickHandler(event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockOnButtonClick).toHaveBeenCalled();
    });

    it('should add mousedown listener for dragging', () => {
      playerControl.create();

      const calls = mockEventManager.on.mock.calls;
      const mousedownCall = calls.find(call => call[1] === 'mousedown');
      expect(mousedownCall).toBeDefined();
    });

    it('should set fixed position', () => {
      const control = playerControl.create();

      expect(control.style.position).toBe('fixed');
      expect(control.style.right).toBe('20px');
    });

    it('should center vertically', () => {
      const control = playerControl.create();

      // Widget is now 122px tall (50px play + 2x28px skip + 2x8px gaps)
      // So we center by subtracting half: 122/2 = 61
      const expectedTop = (window.innerHeight / 2 - 61) + 'px';
      expect(control.style.top).toBe(expectedTop);
    });

    it('should set z-index', () => {
      const control = playerControl.create();

      expect(control.style.zIndex).toBe(String(Z_INDEX.PLAYER_CONTROL));
    });
  });

  describe('startDrag', () => {
    beforeEach(() => {
      playerControl.element = document.createElement('div');
      playerControl.element.getBoundingClientRect = vi.fn(() => ({
        left: 100,
        top: 200,
        width: 50,
        height: 50
      }));
      playerControl.button = document.createElement('button');
      playerControl.button.classList.add('tts-player-button');
    });

    it('should not start drag if clicking button', () => {
      const event = {
        target: playerControl.button,
        clientX: 150,
        clientY: 250,
        preventDefault: vi.fn()
      };

      playerControl.startDrag(event);

      expect(playerControl.isDragging).toBe(false);
    });

    it('should set isDragging flag', () => {
      const event = {
        target: playerControl.element,
        clientX: 150,
        clientY: 250,
        preventDefault: vi.fn()
      };

      playerControl.startDrag(event);

      expect(playerControl.isDragging).toBe(true);
    });

    it('should calculate drag offset', () => {
      const event = {
        target: playerControl.element,
        clientX: 150,
        clientY: 250,
        preventDefault: vi.fn()
      };

      playerControl.startDrag(event);

      expect(playerControl.dragOffset.x).toBe(50); // 150 - 100
      expect(playerControl.dragOffset.y).toBe(50); // 250 - 200
    });

    it('should add mousemove and mouseup listeners', () => {
      const event = {
        target: playerControl.element,
        clientX: 150,
        clientY: 250,
        preventDefault: vi.fn()
      };

      playerControl.startDrag(event);

      const calls = mockEventManager.on.mock.calls;
      const mousemoveCall = calls.find(call =>
        call[0] === document && call[1] === 'mousemove'
      );
      const mouseupCall = calls.find(call =>
        call[0] === document && call[1] === 'mouseup'
      );

      expect(mousemoveCall).toBeDefined();
      expect(mouseupCall).toBeDefined();
    });

    it('should prevent default behavior', () => {
      const event = {
        target: playerControl.element,
        clientX: 150,
        clientY: 250,
        preventDefault: vi.fn()
      };

      playerControl.startDrag(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe('onDrag', () => {
    beforeEach(() => {
      playerControl.element = document.createElement('div');
      playerControl.element.style = {};
      Object.defineProperty(playerControl.element, 'offsetWidth', {
        value: 50,
        writable: true,
        configurable: true
      });
      Object.defineProperty(playerControl.element, 'offsetHeight', {
        value: 50,
        writable: true,
        configurable: true
      });
      playerControl.isDragging = true;
      playerControl.dragOffset = { x: 25, y: 25 };
    });

    it('should update element position', () => {
      const event = {
        clientX: 300,
        clientY: 400
      };

      playerControl.onDrag(event);

      expect(playerControl.element.style.left).toBe('275px'); // 300 - 25
      expect(playerControl.element.style.top).toBe('375px'); // 400 - 25
    });

    it('should set right to auto', () => {
      const event = { clientX: 300, clientY: 400 };

      playerControl.onDrag(event);

      expect(playerControl.element.style.right).toBe('auto');
    });

    it('should constrain to left boundary', () => {
      const event = {
        clientX: 0,
        clientY: 400
      };

      playerControl.onDrag(event);

      expect(playerControl.element.style.left).toBe('0px');
    });

    it('should constrain to right boundary', () => {
      const event = {
        clientX: 9999,
        clientY: 400
      };

      playerControl.onDrag(event);

      const maxX = window.innerWidth - playerControl.element.offsetWidth;
      expect(playerControl.element.style.left).toBe(maxX + 'px');
    });

    it('should constrain to top boundary', () => {
      const event = {
        clientX: 300,
        clientY: 0
      };

      playerControl.onDrag(event);

      expect(playerControl.element.style.top).toBe('0px');
    });

    it('should constrain to bottom boundary', () => {
      const event = {
        clientX: 300,
        clientY: 9999
      };

      playerControl.onDrag(event);

      const maxY = window.innerHeight - playerControl.element.offsetHeight;
      expect(playerControl.element.style.top).toBe(maxY + 'px');
    });

    it('should not drag if not dragging', () => {
      playerControl.isDragging = false;
      const event = { clientX: 300, clientY: 400 };

      playerControl.onDrag(event);

      // Style.left should not be set (remains empty string)
      expect(playerControl.element.style.left).toBe('');
    });
  });

  describe('stopDrag', () => {
    const mockOnDrag = vi.fn();
    const mockStopDrag = vi.fn();

    beforeEach(() => {
      playerControl.isDragging = true;
    });

    it('should set isDragging to false', () => {
      playerControl.stopDrag(mockOnDrag, mockStopDrag);

      expect(playerControl.isDragging).toBe(false);
    });

    it('should remove mousemove listener', () => {
      playerControl.stopDrag(mockOnDrag, mockStopDrag);

      expect(mockEventManager.off).toHaveBeenCalledWith(document, 'mousemove', mockOnDrag);
    });

    it('should remove mouseup listener', () => {
      playerControl.stopDrag(mockOnDrag, mockStopDrag);

      expect(mockEventManager.off).toHaveBeenCalledWith(document, 'mouseup', mockStopDrag);
    });
  });

  describe('updateUI', () => {
    beforeEach(() => {
      playerControl.button = document.createElement('button');
    });

    it('should update UI for IDLE state', () => {
      playerControl.updateUI(PLAYER_STATES.IDLE);

      expect(playerControl.button.innerHTML).toBe('▶');
      expect(playerControl.button.title).toBe('Play');
      expect(playerControl.button.classList.contains('loading')).toBe(false);
      expect(playerControl.button.classList.contains('playing')).toBe(false);
    });

    it('should update UI for LOADING state', () => {
      playerControl.updateUI(PLAYER_STATES.LOADING);

      expect(playerControl.button.innerHTML).toContain('tts-spinner');
      expect(playerControl.button.title).toBe('Loading...');
      expect(playerControl.button.classList.contains('loading')).toBe(true);
    });

    it('should update UI for PLAYING state', () => {
      playerControl.updateUI(PLAYER_STATES.PLAYING);

      expect(playerControl.button.innerHTML).toBe('⏸');
      expect(playerControl.button.title).toBe('Pause');
      expect(playerControl.button.classList.contains('playing')).toBe(true);
    });

    it('should update UI for PAUSED state', () => {
      playerControl.updateUI(PLAYER_STATES.PAUSED);

      expect(playerControl.button.innerHTML).toBe('▶');
      expect(playerControl.button.title).toBe('Resume');
      expect(playerControl.button.classList.contains('loading')).toBe(false);
      expect(playerControl.button.classList.contains('playing')).toBe(false);
    });

    it('should remove previous state classes', () => {
      playerControl.button.classList.add('loading', 'playing');

      playerControl.updateUI(PLAYER_STATES.IDLE);

      expect(playerControl.button.classList.contains('loading')).toBe(false);
      expect(playerControl.button.classList.contains('playing')).toBe(false);
    });

    it('should not update if no button', () => {
      playerControl.button = null;

      expect(() => {
        playerControl.updateUI(PLAYER_STATES.PLAYING);
      }).not.toThrow();
    });
  });

  describe('show', () => {
    it('should create element if not exists', () => {
      playerControl.show();

      expect(playerControl.element).not.toBeNull();
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    it('should set display to flex', () => {
      playerControl.show();

      expect(playerControl.element.style.display).toBe('flex');
    });

    it('should not recreate element if already exists', () => {
      playerControl.show();
      const element = playerControl.element;

      playerControl.show();

      expect(playerControl.element).toBe(element);
    });

    it('should show hidden element', () => {
      playerControl.show();
      playerControl.hide();

      playerControl.show();

      expect(playerControl.element.style.display).toBe('flex');
    });
  });

  describe('hide', () => {
    it('should set display to none', () => {
      playerControl.show();

      playerControl.hide();

      expect(playerControl.element.style.display).toBe('none');
    });

    it('should not throw if no element', () => {
      expect(() => {
        playerControl.hide();
      }).not.toThrow();
    });
  });

  describe('skip button integration', () => {
    let mockOnSkipForward;
    let mockOnSkipBackward;

    beforeEach(() => {
      mockOnSkipForward = vi.fn();
      mockOnSkipBackward = vi.fn();

      // Recreate playerControl with skip callbacks
      playerControl = new PlayerControl(
        mockState,
        mockEventManager,
        mockOnButtonClick,
        mockOnSkipForward,
        mockOnSkipBackward
      );
    });

    describe('skip button creation', () => {
      it('should create skip backward button', () => {
        playerControl.create();

        expect(playerControl.skipBackwardButton).not.toBeNull();
        expect(playerControl.skipBackwardButton.className).toContain('tts-skip-button');
        expect(playerControl.skipBackwardButton.title).toContain('Backward');
      });

      it('should create skip forward button', () => {
        playerControl.create();

        expect(playerControl.skipForwardButton).not.toBeNull();
        expect(playerControl.skipForwardButton.className).toContain('tts-skip-button');
        expect(playerControl.skipForwardButton.title).toContain('Forward');
      });

      it('should add skip buttons to control element', () => {
        const control = playerControl.create();

        expect(control.contains(playerControl.skipBackwardButton)).toBe(true);
        expect(control.contains(playerControl.skipForwardButton)).toBe(true);
      });

      it('should initialize skip buttons as disabled', () => {
        playerControl.create();

        expect(playerControl.skipBackwardButton.disabled).toBe(true);
        expect(playerControl.skipForwardButton.disabled).toBe(true);
      });

      it('should place skip backward button before play button', () => {
        const control = playerControl.create();

        const buttons = Array.from(control.querySelectorAll('button, .tts-play-button-container'));
        const backwardIndex = buttons.findIndex(el => el === playerControl.skipBackwardButton);
        const playIndex = buttons.findIndex(el => el.contains(playerControl.button));

        expect(backwardIndex).toBeLessThan(playIndex);
      });

      it('should place skip forward button after play button', () => {
        const control = playerControl.create();

        const buttons = Array.from(control.querySelectorAll('button, .tts-play-button-container'));
        const forwardIndex = buttons.findIndex(el => el === playerControl.skipForwardButton);
        const playIndex = buttons.findIndex(el => el.contains(playerControl.button));

        expect(forwardIndex).toBeGreaterThan(playIndex);
      });
    });

    describe('skip button click handlers', () => {
      beforeEach(() => {
        playerControl.create();
      });

      it('should add click listener to skip backward button', () => {
        const calls = mockEventManager.on.mock.calls;
        const backwardClickCall = calls.find(
          call => call[0] === playerControl.skipBackwardButton && call[1] === 'click'
        );
        expect(backwardClickCall).toBeDefined();
      });

      it('should add click listener to skip forward button', () => {
        const calls = mockEventManager.on.mock.calls;
        const forwardClickCall = calls.find(
          call => call[0] === playerControl.skipForwardButton && call[1] === 'click'
        );
        expect(forwardClickCall).toBeDefined();
      });

      it('should call onSkipBackward when skip backward button clicked', () => {
        const clickHandler = mockEventManager.on.mock.calls.find(
          call => call[0] === playerControl.skipBackwardButton && call[1] === 'click'
        )[2];

        const event = { stopPropagation: vi.fn() };
        clickHandler(event);

        expect(event.stopPropagation).toHaveBeenCalled();
        expect(mockOnSkipBackward).toHaveBeenCalled();
      });

      it('should call onSkipForward when skip forward button clicked', () => {
        const clickHandler = mockEventManager.on.mock.calls.find(
          call => call[0] === playerControl.skipForwardButton && call[1] === 'click'
        )[2];

        const event = { stopPropagation: vi.fn() };
        clickHandler(event);

        expect(event.stopPropagation).toHaveBeenCalled();
        expect(mockOnSkipForward).toHaveBeenCalled();
      });

      it('should not start drag when clicking skip backward button', () => {
        playerControl.element = document.createElement('div');
        playerControl.element.getBoundingClientRect = vi.fn(() => ({
          left: 100,
          top: 200,
          width: 50,
          height: 122
        }));

        const event = {
          target: playerControl.skipBackwardButton,
          clientX: 150,
          clientY: 250,
          preventDefault: vi.fn()
        };

        playerControl.startDrag(event);

        expect(playerControl.isDragging).toBe(false);
      });

      it('should not start drag when clicking skip forward button', () => {
        playerControl.element = document.createElement('div');
        playerControl.element.getBoundingClientRect = vi.fn(() => ({
          left: 100,
          top: 200,
          width: 50,
          height: 122
        }));

        const event = {
          target: playerControl.skipForwardButton,
          clientX: 150,
          clientY: 250,
          preventDefault: vi.fn()
        };

        playerControl.startDrag(event);

        expect(playerControl.isDragging).toBe(false);
      });
    });

    describe('skip state subscription', () => {
      it('should subscribe to skip state changes on construction', () => {
        expect(mockState.subscribeToSkipState).toHaveBeenCalled();
      });

      it('should call updateSkipButtonStates when skip state changes', () => {
        playerControl.create();

        // Get the callback that was registered (last call since playerControl was recreated)
        const calls = mockState.subscribeToSkipState.mock.calls;
        const callback = calls[calls.length - 1][0];

        // Directly test that calling the callback updates the buttons
        callback({ canSkipForward: true, canSkipBackward: false });

        // Verify buttons were updated correctly
        expect(playerControl.skipForwardButton.disabled).toBe(false);
        expect(playerControl.skipBackwardButton.disabled).toBe(true);
      });
    });

    describe('updateSkipButtonStates', () => {
      beforeEach(() => {
        playerControl.create();
      });

      it('should enable skip forward button when canSkipForward is true', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: true,
          canSkipBackward: false
        });

        expect(playerControl.skipForwardButton.disabled).toBe(false);
      });

      it('should disable skip forward button when canSkipForward is false', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: false,
          canSkipBackward: true
        });

        expect(playerControl.skipForwardButton.disabled).toBe(true);
      });

      it('should enable skip backward button when canSkipBackward is true', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: false,
          canSkipBackward: true
        });

        expect(playerControl.skipBackwardButton.disabled).toBe(false);
      });

      it('should disable skip backward button when canSkipBackward is false', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: true,
          canSkipBackward: false
        });

        expect(playerControl.skipBackwardButton.disabled).toBe(true);
      });

      it('should enable both buttons when both can skip', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: true,
          canSkipBackward: true
        });

        expect(playerControl.skipForwardButton.disabled).toBe(false);
        expect(playerControl.skipBackwardButton.disabled).toBe(false);
      });

      it('should disable both buttons when neither can skip', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: false,
          canSkipBackward: false
        });

        expect(playerControl.skipForwardButton.disabled).toBe(true);
        expect(playerControl.skipBackwardButton.disabled).toBe(true);
      });

      it('should not throw if skip buttons do not exist', () => {
        playerControl.skipForwardButton = null;
        playerControl.skipBackwardButton = null;

        expect(() => {
          playerControl.updateSkipButtonStates({
            canSkipForward: true,
            canSkipBackward: true
          });
        }).not.toThrow();
      });
    });

    describe('skip button integration with progress', () => {
      beforeEach(() => {
        playerControl.create();
      });

      it('should maintain skip button states when progress updates', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: true,
          canSkipBackward: false
        });

        playerControl.updateProgress(1000, 5000);

        expect(playerControl.skipForwardButton.disabled).toBe(false);
        expect(playerControl.skipBackwardButton.disabled).toBe(true);
      });

      it('should maintain skip button states when resetting progress', () => {
        playerControl.updateSkipButtonStates({
          canSkipForward: false,
          canSkipBackward: true
        });

        playerControl.resetProgress();

        expect(playerControl.skipForwardButton.disabled).toBe(true);
        expect(playerControl.skipBackwardButton.disabled).toBe(false);
      });
    });
  });

  describe('cleanup', () => {
    it('should remove element from DOM', () => {
      playerControl.element = document.createElement('div');
      const mockParent = {
        removeChild: vi.fn()
      };
      Object.defineProperty(playerControl.element, 'parentNode', {
        value: mockParent,
        writable: true,
        configurable: true
      });

      const element = playerControl.element;
      playerControl.cleanup();

      expect(mockParent.removeChild).toHaveBeenCalledWith(element);
    });

    it('should null element and button', () => {
      playerControl.element = document.createElement('div');
      playerControl.button = document.createElement('button');
      Object.defineProperty(playerControl.element, 'parentNode', {
        value: null,
        writable: true,
        configurable: true
      });

      playerControl.cleanup();

      expect(playerControl.element).toBeNull();
      expect(playerControl.button).toBeNull();
    });

    it('should handle element without parent', () => {
      playerControl.element = document.createElement('div');
      Object.defineProperty(playerControl.element, 'parentNode', {
        value: null,
        writable: true,
        configurable: true
      });

      expect(() => {
        playerControl.cleanup();
      }).not.toThrow();
    });

    it('should handle no element', () => {
      expect(() => {
        playerControl.cleanup();
      }).not.toThrow();
    });
  });
});
