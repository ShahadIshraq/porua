// Test setup file for Jest
// Mocks Tauri API and sets up DOM environment

// Mock Tauri API
global.window = global.window || {};
global.window.__TAURI__ = {
  invoke: jest.fn(),
  listen: jest.fn(),
  event: {
    listen: jest.fn()
  },
  tauri: {
    invoke: jest.fn()
  },
  shell: {
    open: jest.fn()
  }
};

// Make Tauri API available globally for tests
global.invoke = global.window.__TAURI__.invoke;
global.listen = global.window.__TAURI__.listen;
global.openUrl = global.window.__TAURI__.shell.open;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Helper to reset all mocks between tests
global.resetAllMocks = () => {
  jest.clearAllMocks();
  global.window.__TAURI__.invoke.mockReset();
  global.window.__TAURI__.listen.mockReset();
  global.window.__TAURI__.shell.open.mockReset();
};

// Helper to create DOM structure for settings screen
global.createSettingsDom = () => {
  document.body.innerHTML = `
    <div id="app">
      <!-- Welcome Screen -->
      <div id="welcome-screen" class="screen"></div>

      <!-- Progress Screen -->
      <div id="progress-screen" class="screen"></div>

      <!-- Success Screen -->
      <div id="success-screen" class="screen"></div>

      <!-- Error Screen -->
      <div id="error-screen" class="screen">
        <div id="error-message"></div>
        <div id="log-path"></div>
      </div>

      <!-- Settings Screen -->
      <div id="settings-screen" class="screen">
        <div class="provider-tabs">
          <button class="tab-btn active" data-provider="gemini">Google Gemini</button>
          <button class="tab-btn" data-provider="openai">OpenAI</button>
        </div>

        <!-- Gemini Content -->
        <div class="provider-content active" data-provider="gemini">
          <input type="password" id="gemini-key" />
          <button class="toggle-visibility-btn" data-target="gemini-key">👁️</button>
          <div class="validation-status" id="gemini-status"></div>
          <button id="validate-gemini-btn">Validate & Save</button>
          <button id="remove-gemini-btn" style="display:none;">Remove Key</button>
        </div>

        <!-- OpenAI Content -->
        <div class="provider-content" data-provider="openai">
          <input type="password" id="openai-key" />
          <button class="toggle-visibility-btn" data-target="openai-key">👁️</button>
          <div class="validation-status" id="openai-status"></div>
          <button id="validate-openai-btn">Validate & Save</button>
          <button id="remove-openai-btn" style="display:none;">Remove Key</button>
        </div>

        <!-- Provider Selection -->
        <div class="provider-selection">
          <input type="radio" name="provider" value="gemini" checked />
          <input type="radio" name="provider" value="openai" />
        </div>

        <button id="close-settings-btn">Close</button>
      </div>
    </div>
  `;
};

// Helper to create progress screen DOM
global.createProgressDom = () => {
  document.body.innerHTML = `
    <div id="progress-screen" class="screen active">
      <div class="tasks-list">
        <div class="task-item" data-step="CreatingDirectories">
          <div class="task-checkbox pending"></div>
          <span class="task-text">Creating directories...</span>
        </div>
        <div class="task-item" data-step="DownloadingModels">
          <div class="task-checkbox pending"></div>
          <span class="task-text">Downloading models...</span>
          <span class="task-details" id="download-details"></span>
        </div>
      </div>
    </div>
  `;
};
