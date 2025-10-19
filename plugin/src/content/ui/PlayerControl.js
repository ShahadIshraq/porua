import { createElement } from '../utils/dom.js';
import { PLAYER_STATES, Z_INDEX } from '../../shared/utils/constants.js';

export class PlayerControl {
  constructor(state, eventManager, onButtonClick, skipInterval = 10) {
    this.state = state;
    this.eventManager = eventManager;
    this.onButtonClick = onButtonClick;
    this.skipInterval = skipInterval;
    this.element = null;
    this.button = null;
    this.skipBackwardButton = null;
    this.skipForwardButton = null;
    this.progressContainer = null;
    this.progressFill = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    // Progress smoothing
    this.pendingProgress = null;
    this.progressRafId = null;
    this.lastProgressUpdate = 0;

    // Skip callback (set by parent)
    this.onSkip = null;

    this.state.subscribe((newState) => this.updateUI(newState));
  }

  createProgressBar() {
    const container = createElement('div', 'tts-progress-container');

    // Background track
    const track = createElement('div', 'tts-progress-track');

    // Progress fill
    const fill = createElement('div', 'tts-progress-fill');

    track.appendChild(fill);
    container.appendChild(track);

    this.progressFill = fill;

    return container;
  }

  createSkipButton(direction) {
    const button = createElement('button', `tts-skip-button tts-skip-${direction}`);

    // Create SVG icon for cleaner look
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tts-skip-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'currentColor');

    // Create double arrow path based on direction
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (direction === 'forward') {
      // Forward double arrow: >>
      path.setAttribute('d', 'M5.5 4l8 8-8 8V4zm9 0l8 8-8 8V4z');
    } else {
      // Backward double arrow: <<
      path.setAttribute('d', 'M18.5 20l-8-8 8-8v16zm-9 0l-8-8 8-8v16z');
    }
    svg.appendChild(path);

    const time = createElement('span', 'tts-skip-time');
    time.textContent = this.skipInterval.toString();

    // Layout: backward shows icon-time, forward shows time-icon
    if (direction === 'forward') {
      button.appendChild(time);
      button.appendChild(svg);
    } else {
      button.appendChild(svg);
      button.appendChild(time);
    }

    button.setAttribute('aria-label', `Skip ${direction} ${this.skipInterval} seconds`);
    button.setAttribute('title', `Skip ${direction} ${this.skipInterval} seconds`);

    return button;
  }

  handleSkipBackward(e) {
    e.stopPropagation();
    if (this.onSkip) {
      this.onSkip(-this.skipInterval);
    }
  }

  handleSkipForward(e) {
    e.stopPropagation();
    if (this.onSkip) {
      this.onSkip(this.skipInterval);
    }
  }

  setOnSkip(callback) {
    this.onSkip = callback;
  }

  create() {
    const control = createElement('div', 'tts-player-control');

    // Create button container for horizontal layout
    const buttonContainer = createElement('div', 'tts-control-buttons');

    // Skip backward button
    this.skipBackwardButton = this.createSkipButton('backward');
    this.eventManager.on(this.skipBackwardButton, 'click', (e) => this.handleSkipBackward(e));
    buttonContainer.appendChild(this.skipBackwardButton);

    // Play/pause button (existing)
    this.button = createElement('button', 'tts-player-button');
    this.button.innerHTML = '▶';
    this.eventManager.on(this.button, 'click', (e) => {
      e.stopPropagation();
      this.onButtonClick();
    });
    buttonContainer.appendChild(this.button);

    // Skip forward button
    this.skipForwardButton = this.createSkipButton('forward');
    this.eventManager.on(this.skipForwardButton, 'click', (e) => this.handleSkipForward(e));
    buttonContainer.appendChild(this.skipForwardButton);

    control.appendChild(buttonContainer);

    // Add progress bar at the bottom
    this.progressContainer = this.createProgressBar();
    control.appendChild(this.progressContainer);

    // Setup drag handler
    this.eventManager.on(control, 'mousedown', (e) => this.startDrag(e));

    const viewportHeight = window.innerHeight;
    control.style.position = 'fixed';
    control.style.right = '20px';
    control.style.top = (viewportHeight / 2 - 25) + 'px';
    control.style.zIndex = Z_INDEX.PLAYER_CONTROL;

    return control;
  }

  startDrag(e) {
    // Don't drag when clicking any button
    if (e.target.classList.contains('tts-player-button') ||
        e.target.classList.contains('tts-skip-button') ||
        e.target.closest('.tts-control-buttons')) {
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

  updateProgress(currentTime, duration) {
    if (!this.progressFill || !duration || isNaN(duration) || duration === 0) {
      return;
    }

    // Store pending progress data
    this.pendingProgress = { currentTime, duration };

    // Throttle updates using requestAnimationFrame
    if (this.progressRafId !== null) {
      return; // Already have a pending update
    }

    this.progressRafId = requestAnimationFrame(() => {
      this.applyProgressUpdate();
    });
  }

  applyProgressUpdate() {
    this.progressRafId = null;

    if (!this.pendingProgress || !this.progressFill) {
      return;
    }

    const { currentTime, duration } = this.pendingProgress;
    const percentage = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    // Update width of progress fill
    this.progressFill.style.width = `${percentage}%`;

    this.pendingProgress = null;
  }

  resetProgress() {
    // Cancel any pending progress updates
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
    this.pendingProgress = null;

    if (this.progressFill) {
      this.progressFill.style.width = '0%';
    }
  }

  updateUI(state) {
    if (!this.button) return;

    this.button.classList.remove('loading', 'playing', 'paused');

    switch (state) {
      case PLAYER_STATES.IDLE:
        this.button.innerHTML = '▶';
        this.button.title = 'Play';
        this.resetProgress();
        break;
      case PLAYER_STATES.LOADING:
        this.button.classList.add('loading');
        this.button.innerHTML = '<div class="tts-spinner"></div>';
        this.button.title = 'Loading...';
        this.resetProgress();
        break;
      case PLAYER_STATES.PLAYING:
        this.button.classList.add('playing');
        this.button.innerHTML = '⏸';
        this.button.title = 'Pause';
        break;
      case PLAYER_STATES.PAUSED:
        this.button.classList.add('paused');
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
    // Cancel any pending progress animations
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.button = null;
    this.skipBackwardButton = null;
    this.skipForwardButton = null;
    this.progressContainer = null;
    this.progressFill = null;
    this.pendingProgress = null;
  }
}
