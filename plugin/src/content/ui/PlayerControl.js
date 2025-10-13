import { createElement } from '../utils/dom.js';
import { PLAYER_STATES, Z_INDEX } from '../../shared/utils/constants.js';

export class PlayerControl {
  constructor(state, eventManager, onButtonClick) {
    this.state = state;
    this.eventManager = eventManager;
    this.onButtonClick = onButtonClick;
    this.element = null;
    this.button = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    this.state.subscribe((newState) => this.updateUI(newState));
  }

  create() {
    const control = createElement('div', 'tts-player-control');
    this.button = createElement('button', 'tts-player-button');
    this.button.innerHTML = '▶';

    this.eventManager.on(this.button, 'click', (e) => {
      e.stopPropagation();
      this.onButtonClick();
    });

    this.eventManager.on(control, 'mousedown', (e) => this.startDrag(e));

    control.appendChild(this.button);

    const viewportHeight = window.innerHeight;
    control.style.position = 'fixed';
    control.style.right = '20px';
    control.style.top = (viewportHeight / 2 - 25) + 'px';
    control.style.zIndex = Z_INDEX.PLAYER_CONTROL;

    return control;
  }

  startDrag(e) {
    if (e.target.classList.contains('tts-player-button')) {
      return;
    }

    this.isDragging = true;
    const rect = this.element.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;

    const onDrag = (e) => this.onDrag(e);
    const stopDrag = () => this.stopDrag(onDrag, stopDrag);

    this.eventManager.on(document, 'mousemove', onDrag);
    this.eventManager.on(document, 'mouseup', stopDrag);

    e.preventDefault();
  }

  onDrag(e) {
    if (!this.isDragging) return;

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    const maxX = window.innerWidth - this.element.offsetWidth;
    const maxY = window.innerHeight - this.element.offsetHeight;

    this.element.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    this.element.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    this.element.style.right = 'auto';
  }

  stopDrag(onDrag, stopDrag) {
    this.isDragging = false;
    this.eventManager.off(document, 'mousemove', onDrag);
    this.eventManager.off(document, 'mouseup', stopDrag);
  }

  updateUI(state) {
    if (!this.button) return;

    this.button.classList.remove('loading', 'playing');

    switch (state) {
      case PLAYER_STATES.IDLE:
        this.button.innerHTML = '▶';
        this.button.title = 'Play';
        break;
      case PLAYER_STATES.LOADING:
        this.button.classList.add('loading');
        this.button.innerHTML = '<div class="tts-spinner"></div>';
        this.button.title = 'Loading...';
        break;
      case PLAYER_STATES.PLAYING:
        this.button.classList.add('playing');
        this.button.innerHTML = '⏸';
        this.button.title = 'Pause';
        break;
      case PLAYER_STATES.PAUSED:
        this.button.innerHTML = '▶';
        this.button.title = 'Resume';
        break;
    }
  }

  show() {
    if (!this.element) {
      this.element = this.create();
      document.body.appendChild(this.element);
    }
    this.element.style.display = 'flex';
  }

  hide() {
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  cleanup() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.button = null;
  }
}
