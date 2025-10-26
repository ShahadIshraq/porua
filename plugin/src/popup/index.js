import '../styles/popup.css';
import { SettingsForm } from './SettingsForm.js';
import { StatusMessage } from './StatusMessage.js';
import { CacheStats } from './CacheStats.js';

const statusMessageElement = document.getElementById('status-message');
const formElement = document.getElementById('settings-form');

const statusMessage = new StatusMessage(statusMessageElement);
const settingsForm = new SettingsForm(formElement, statusMessage);
const cacheStats = new CacheStats();

settingsForm.init();

// Initialize cache stats
const cacheContainer = document.getElementById('cache-stats-container');
if (cacheContainer) {
  cacheStats.init(cacheContainer);
}
