import { SettingsForm } from './SettingsForm.js';
import { StatusMessage } from './StatusMessage.js';

const statusMessageElement = document.getElementById('status-message');
const formElement = document.getElementById('settings-form');

const statusMessage = new StatusMessage(statusMessageElement);
const settingsForm = new SettingsForm(formElement, statusMessage);

settingsForm.init();
