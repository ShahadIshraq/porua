import { createElement, replaceContent } from '../shared/utils/domBuilder.js';
import { SettingsStore } from '../shared/storage/SettingsStore.js';

/**
 * PlayButtonToggle component for enabling/disabling the play button feature
 * Provides a toggle switch to control whether play buttons appear on web pages
 */
export class PlayButtonToggle {
  /**
   * @param {HTMLElement} container - The container element for the toggle
   * @param {Object} statusMessage - StatusMessage instance for showing feedback
   */
  constructor(container, statusMessage) {
    this.container = container;
    this.statusMessage = statusMessage;
    this.isEnabled = true;
    this.toggle = null;
    this.onChangeCallback = null;
  }

  /**
   * Initializes the play button toggle component
   */
  async init() {
    // Load current setting
    this.isEnabled = await SettingsStore.getPlayButtonEnabled();
    this.render();
    this.setupEventListeners();
  }

  /**
   * Renders the toggle UI
   */
  render() {
    const toggle = createElement('input', {
      type: 'checkbox',
      id: 'play-button-toggle',
      className: 'toggle-checkbox',
      checked: this.isEnabled,
      'aria-label': 'Enable play button'
    });

    const toggleLabel = createElement('label', {
      htmlFor: 'play-button-toggle',
      className: 'toggle-label'
    }, [
      createElement('span', 'toggle-slider')
    ]);

    const view = createElement('div', 'play-button-toggle', [
      createElement('div', 'toggle-header', [
        createElement('label', { className: 'toggle-title' }, 'Play Button'),
        createElement('div', 'toggle-switch', [toggle, toggleLabel])
      ]),
      createElement('small', 'help-text', 'Show or hide the play button on web pages')
    ]);

    replaceContent(this.container, view);

    // Store reference to toggle element
    this.toggle = toggle;
  }

  /**
   * Sets up event listeners for the toggle
   */
  setupEventListeners() {
    this.toggle.addEventListener('change', async (e) => {
      await this.handleToggleChange(e.target.checked);
    });
  }

  /**
   * Handles toggle change events
   * @param {boolean} enabled - The new enabled state
   */
  async handleToggleChange(enabled) {
    this.isEnabled = enabled;

    try {
      // Save to storage
      await SettingsStore.setPlayButtonEnabled(enabled);

      // Notify all content scripts about the change
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'PLAY_BUTTON_TOGGLE',
            enabled: enabled
          });
        } catch (error) {
          // Tab might not have content script, ignore
          console.debug('[PlayButtonToggle] Could not send message to tab:', tab.id);
        }
      }

      const message = enabled
        ? 'Play button enabled'
        : 'Play button disabled';
      this.statusMessage.show(message, 'success');

      // Fire callback if registered
      if (this.onChangeCallback) {
        this.onChangeCallback(enabled);
      }
    } catch (error) {
      console.error('[PlayButtonToggle] Failed to save setting:', error);
      this.statusMessage.show('Error saving setting: ' + error.message, 'error');

      // Revert toggle state on error
      this.isEnabled = !enabled;
      this.toggle.checked = this.isEnabled;
    }
  }

  /**
   * Gets the current enabled state
   * @returns {boolean} Whether play button is enabled
   */
  isPlayButtonEnabled() {
    return this.isEnabled;
  }

  /**
   * Registers a callback for toggle changes
   * @param {Function} callback - Callback function called with the new enabled state
   */
  onChange(callback) {
    this.onChangeCallback = callback;
  }

  /**
   * Cleanup method
   */
  cleanup() {
    this.toggle = null;
    this.onChangeCallback = null;
  }
}
