import { createElement, getScrollPosition } from '../utils/dom.js';
import { TIMEOUTS, Z_INDEX } from '../../shared/utils/constants.js';

export class PlayButton {
  constructor(state, eventManager, onPlayClick) {
    this.state = state;
    this.eventManager = eventManager;
    this.onPlayClick = onPlayClick;
    this.element = null;
    this.currentParagraph = null;
    this.hideTimeout = null;
  }

  init() {
    this.setupParagraphListeners();
    this.setupScrollListener();
    this.setupResizeListener();
  }

  setupParagraphListeners() {
    this.eventManager.on(document, 'mouseenter', (e) => {
      if (e.target.tagName === 'P' && e.target.textContent.trim().length > 0) {
        this.show(e.target);
      }
    }, true);

    this.eventManager.on(document, 'mouseleave', (e) => {
      if (e.target.tagName === 'P' && e.target === this.currentParagraph) {
        this.scheduleHide();
      }
    }, true);
  }

  setupScrollListener() {
    const handleScroll = () => {
      if (this.element && this.currentParagraph) {
        this.position(this.currentParagraph);
      }
    };

    this.eventManager.on(window, 'scroll', handleScroll, true);
  }

  setupResizeListener() {
    const handleResize = () => {
      if (this.element && this.currentParagraph) {
        this.position(this.currentParagraph);
      }
    };

    this.eventManager.on(window, 'resize', handleResize);
  }

  create() {
    const button = createElement('div', 'tts-play-button');
    button.innerHTML = '▶';
    button.title = 'Read aloud';

    this.eventManager.on(button, 'click', (e) => {
      e.stopPropagation();
      this.onPlayClick();
    });

    this.eventManager.on(button, 'mouseenter', () => {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    });

    return button;
  }

  position(paragraph) {
    if (!this.element) return;

    const rect = paragraph.getBoundingClientRect();
    const scroll = getScrollPosition();

    const offsetX = -45;
    const offsetY = 5;

    this.element.style.position = 'absolute';
    this.element.style.top = (rect.top + scroll.top + offsetY) + 'px';
    this.element.style.left = (rect.left + scroll.left + offsetX) + 'px';
    this.element.style.zIndex = Z_INDEX.PLAY_BUTTON;
  }

  show(paragraph) {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    if (this.element && this.currentParagraph === paragraph) {
      return;
    }

    this.hide();

    this.currentParagraph = paragraph;
    this.state.setParagraph(paragraph);
    this.element = this.create();
    document.body.appendChild(this.element);
    this.position(paragraph);
  }

  hide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;

    const playerState = this.state.getState();
    if (playerState === 'idle') {
      this.currentParagraph = null;
    }
  }

  scheduleHide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    this.hideTimeout = setTimeout(() => {
      this.hide();
    }, TIMEOUTS.BUTTON_HIDE);
  }

  cleanup() {
    this.hide();
    this.currentParagraph = null;
  }
}
