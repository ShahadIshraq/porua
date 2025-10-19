/**
 * SkipControl component for configuring skip forward/backward interval
 * Provides preset buttons for common skip intervals
 */
export class SkipControl {
  /**
   * @param {HTMLElement} container - The container element for the skip control
   */
  constructor(container) {
    this.container = container;
    this.currentSkipInterval = 10; // Default 10 seconds
    this.onChangeCallback = null;

    // Skip interval presets (in seconds)
    this.PRESETS = [
      { value: 5, label: '5s' },
      { value: 10, label: '10s' },
      { value: 15, label: '15s' },
      { value: 30, label: '30s' }
    ];

    this.presetButtons = [];
  }

  /**
   * Initializes the skip control component
   * @param {number} initialSkipInterval - The initial skip interval value (default: 10)
   */
  init(initialSkipInterval = 10) {
    this.currentSkipInterval = initialSkipInterval;
    this.render();
    this.setupEventListeners();
  }

  /**
   * Renders the skip control UI
   */
  render() {
    this.container.innerHTML = `
      <div class="skip-control">
        <label class="skip-label">Skip Interval</label>
        <small class="help-text">Choose the time to skip forward/backward with arrow keys</small>

        <div class="skip-presets">
          ${this.PRESETS.map(preset => `
            <button
              type="button"
              class="skip-preset-btn ${preset.value === this.currentSkipInterval ? 'active' : ''}"
              data-interval="${preset.value}"
              aria-label="Set skip interval to ${preset.label}"
              aria-pressed="${preset.value === this.currentSkipInterval}"
            >
              ${preset.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Cache DOM elements
    this.presetButtons = Array.from(
      this.container.querySelectorAll('.skip-preset-btn')
    );
  }

  /**
   * Sets up event listeners for the skip control
   */
  setupEventListeners() {
    // Preset button clicks
    this.presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        const interval = parseFloat(button.dataset.interval);
        this.setSkipInterval(interval);
      });
    });
  }

  /**
   * Sets the skip interval value and updates UI
   * @param {number} interval - The skip interval in seconds
   */
  setSkipInterval(interval) {
    this.currentSkipInterval = interval;
    this.updatePresetButtons();

    // Call onChange callback if set
    if (this.onChangeCallback) {
      this.onChangeCallback(interval);
    }
  }

  /**
   * Gets the current skip interval value
   * @returns {number} The current skip interval in seconds
   */
  getSkipInterval() {
    return this.currentSkipInterval;
  }

  /**
   * Updates the active state of preset buttons
   */
  updatePresetButtons() {
    this.presetButtons.forEach(button => {
      const buttonInterval = parseFloat(button.dataset.interval);
      const isActive = buttonInterval === this.currentSkipInterval;

      if (isActive) {
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
      } else {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      }
    });
  }

  /**
   * Registers a callback for when the skip interval changes
   * @param {Function} callback - Function to call when interval changes
   */
  onChange(callback) {
    this.onChangeCallback = callback;
  }

  /**
   * Cleanup method to remove event listeners
   */
  cleanup() {
    // Event listeners are automatically cleaned up when container innerHTML is replaced
  }
}
