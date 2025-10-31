import { createElement } from '../utils/dom.js';
import { PLAYER_STATES, Z_INDEX } from '../../shared/utils/constants.js';

export class PlayerControl {
  constructor(state, eventManager, onButtonClick, onSkipForward, onSkipBackward) {
    this.state = state;
    this.eventManager = eventManager;
    this.onButtonClick = onButtonClick;
    this.onSkipForward = onSkipForward;
    this.onSkipBackward = onSkipBackward;
    this.element = null;
    this.button = null;
    this.skipBackwardButton = null;
    this.skipForwardButton = null;
    this.progressRing = null;
    this.progressArc = null;
    this.circumference = 2 * Math.PI * 24; // 2πr where r=24
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    // Progress smoothing
    this.pendingProgress = null;
    this.progressRafId = null;
    this.lastProgressUpdate = 0;

    this.state.subscribe((newState) => this.updateUI(newState));
    this.state.subscribeToSkipState((skipState) => this.updateSkipButtonStates(skipState));
  }

  createSkipButton(direction) {
    const button = createElement('button', 'tts-skip-button');
    button.textContent = direction === 'backward' ? '⏮' : '⏭';
    button.title = direction === 'backward' ? 'Skip Backward' : 'Skip Forward';
    button.disabled = true; // Start disabled

    this.eventManager.on(button, 'click', (e) => {
      e.stopPropagation();
      if (direction === 'backward') {
        this.onSkipBackward();
      } else {
        this.onSkipForward();
      }
    });

    return button;
  }

  createProgressRing() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tts-progress-ring');
    svg.setAttribute('viewBox', '0 0 54 54');
    svg.setAttribute('width', '54');
    svg.setAttribute('height', '54');

    // Background track (subtle gray circle)
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('class', 'tts-progress-track');
    track.setAttribute('cx', '27');
    track.setAttribute('cy', '27');
    track.setAttribute('r', '24');
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
    track.setAttribute('stroke-width', '3');

    // Progress arc (white circle that fills)
    const progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progress.setAttribute('class', 'tts-progress-arc');
    progress.setAttribute('cx', '27');
    progress.setAttribute('cy', '27');
    progress.setAttribute('r', '24');
    progress.setAttribute('fill', 'none');
    progress.setAttribute('stroke', 'rgba(255, 255, 255, 0.95)');
    progress.setAttribute('stroke-width', '3');
    progress.setAttribute('stroke-linecap', 'round');
    progress.setAttribute('stroke-dasharray', this.circumference.toString());
    progress.setAttribute('stroke-dashoffset', this.circumference.toString());

    svg.appendChild(track);
    svg.appendChild(progress);

    this.progressArc = progress;

    return svg;
  }

  create() {
    const control = createElement('div', 'tts-player-control');

    // Create skip backward button
    this.skipBackwardButton = this.createSkipButton('backward');
    control.appendChild(this.skipBackwardButton);

    // Create play button container with progress ring
    const playButtonContainer = createElement('div', 'tts-play-button-container');

    // Add progress ring first (behind button)
    this.progressRing = this.createProgressRing();
    playButtonContainer.appendChild(this.progressRing);

    this.button = createElement('button', 'tts-player-button');
    this.button.textContent = '▶';

    this.eventManager.on(this.button, 'click', (e) => {
      e.stopPropagation();
      this.onButtonClick();
    });

    playButtonContainer.appendChild(this.button);
    control.appendChild(playButtonContainer);

    // Create skip forward button
    this.skipForwardButton = this.createSkipButton('forward');
    control.appendChild(this.skipForwardButton);

    this.eventManager.on(control, 'mousedown', (e) => this.startDrag(e));

    const viewportHeight = window.innerHeight;
    control.style.position = 'fixed';
    control.style.right = '20px';
    control.style.top = (viewportHeight / 2 - 61) + 'px'; // Adjusted for taller widget
    control.style.zIndex = Z_INDEX.PLAYER_CONTROL;

    return control;
  }

  startDrag(e) {
    // Don't drag when clicking on buttons
    if (e.target.classList.contains('tts-player-button') ||
        e.target.classList.contains('tts-skip-button')) {
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
    if (!this.progressArc || !duration || isNaN(duration) || duration === 0) {
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

    if (!this.pendingProgress || !this.progressArc) {
      return;
    }

    const { currentTime, duration } = this.pendingProgress;
    const percentage = Math.min(100, Math.max(0, (currentTime / duration) * 100));
    const offset = this.circumference - (percentage / 100) * this.circumference;

    // Use CSS for smooth animation instead of direct attribute updates
    this.progressArc.style.strokeDashoffset = offset.toString();

    this.pendingProgress = null;
  }

  resetProgress() {
    // Cancel any pending progress updates
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
    this.pendingProgress = null;

    if (this.progressArc) {
      this.progressArc.style.strokeDashoffset = this.circumference.toString();
    }
  }

  updateSkipButtonStates(skipState) {
    if (this.skipBackwardButton) {
      this.skipBackwardButton.disabled = !skipState.canSkipBackward;
    }
    if (this.skipForwardButton) {
      this.skipForwardButton.disabled = !skipState.canSkipForward;
    }
  }

  updateUI(state) {
    if (!this.button) return;

    this.button.classList.remove('loading', 'playing', 'paused');

    switch (state) {
      case PLAYER_STATES.IDLE:
        this.button.textContent = '▶';
        this.button.title = 'Play';
        this.resetProgress();
        break;
      case PLAYER_STATES.LOADING:
        this.button.classList.add('loading');
        this.button.textContent = '';
        const spinner = createElement('div', 'tts-spinner');
        this.button.appendChild(spinner);
        this.button.title = 'Loading...';
        this.resetProgress();
        break;
      case PLAYER_STATES.PLAYING:
        this.button.classList.add('playing');
        this.button.textContent = '⏸';
        this.button.title = 'Pause';
        break;
      case PLAYER_STATES.PAUSED:
        this.button.classList.add('paused');
        this.button.textContent = '▶';
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
    this.progressRing = null;
    this.progressArc = null;
    this.pendingProgress = null;
  }
}
