import { TIMEOUTS } from '../shared/utils/constants.js';

export class StatusMessage {
  constructor(element) {
    this.element = element;
  }

  show(message, type = 'info') {
    this.element.textContent = message;
    this.element.className = `status-message ${type}`;
    this.element.classList.remove('hidden');

    setTimeout(() => {
      this.element.classList.add('hidden');
    }, TIMEOUTS.STATUS_MESSAGE);
  }

  hide() {
    this.element.classList.add('hidden');
  }
}
