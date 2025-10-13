# Plugin Restructuring Plan

## Current Issues

### Architecture
- **content.js**: 869 lines, monolithic IIFE with 22+ global variables
- No separation of concerns: UI + state + business logic + API + parsing all mixed
- **popup.js**: 227 lines, closure-based state, mixed concerns
- Global scope pollution via `window.CryptoUtils`
- No centralized state management
- Callback hell (lines 352-371 in content.js)

### Code Quality
- No ES modules, uses IIFEs
- No TypeScript
- Manual DOM manipulation throughout
- Magic numbers scattered everywhere (3000ms, 500ms, 10ms)
- No input validation
- Resource leaks: `URL.createObjectURL()` not always revoked
- Event listeners never cleaned up
- Inline styles instead of CSS classes

### Performance
- Scroll/resize handlers fire excessively (lines 846-866)
- DOM queries repeated on every frame: `querySelectorAll('.tts-phrase')`
- No debouncing/throttling
- `parseMultipartStream()` re-processes entire buffer
- Memory leaks from accumulated event listeners

### Security
- API key encryption uses public extension ID (crypto-utils.js:11)
- No input sanitization before `innerHTML` (content.js:643)
- No rate limiting on API calls

### Testing
- Zero test structure
- Untestable: global state in closures, tightly coupled, side effects everywhere

## New Directory Structure

```
plugin/
├── manifest.json
├── manifest.firefox.json
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   ├── index.js
│   │   ├── ui/
│   │   │   ├── PlayButton.js
│   │   │   ├── PlayerControl.js
│   │   │   └── HighlightManager.js
│   │   ├── audio/
│   │   │   ├── AudioQueue.js
│   │   │   ├── StreamParser.js
│   │   │   └── AudioPlayer.js
│   │   ├── state/
│   │   │   └── PlaybackState.js
│   │   └── utils/
│   │       ├── dom.js
│   │       └── events.js
│   ├── popup/
│   │   ├── index.js
│   │   ├── SettingsForm.js
│   │   └── StatusMessage.js
│   ├── shared/
│   │   ├── api/
│   │   │   └── TTSClient.js
│   │   ├── storage/
│   │   │   └── SettingsStore.js
│   │   ├── crypto/
│   │   │   └── encryption.js
│   │   └── utils/
│   │       ├── debounce.js
│   │       ├── throttle.js
│   │       ├── errors.js
│   │       └── constants.js
│   └── styles/
│       ├── popup.css
│       ├── content/
│       │   ├── play-button.css
│       │   ├── player-control.css
│       │   └── highlighting.css
│       └── variables.css
├── icons/
├── dist/
└── build/
    └── bundle.js
```

## Module Breakdown

### shared/utils/constants.js
```javascript
export const TIMEOUTS = {
  STATUS_MESSAGE: 3000,
  BUTTON_HIDE: 500,
  SCROLL_DEBOUNCE: 10,
  RESIZE_DEBOUNCE: 10,
  PARAGRAPH_RESTORE: 1000
};

export const PLAYER_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused'
};

export const DEFAULT_SETTINGS = {
  apiUrl: 'http://localhost:3000',
  voice: 'bf_lily',
  speed: 1.0
};

export const Z_INDEX = {
  PLAY_BUTTON: 999999,
  PLAYER_CONTROL: 1000000
};
```

### shared/utils/debounce.js
```javascript
export function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}
```

### shared/utils/throttle.js
```javascript
export function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
```

### shared/utils/errors.js
```javascript
export class APIError extends Error {
  constructor(status, message) {
    super(`API Error ${status}: ${message}`);
    this.name = 'APIError';
    this.status = status;
  }
}

export class StreamParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StreamParseError';
  }
}

export class AudioPlaybackError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AudioPlaybackError';
  }
}
```

### shared/crypto/encryption.js
```javascript
export class Encryption {
  static async getDerivedKey() {
    const keyMaterial = chrome.runtime.id + 'tts-reader-salt-v1';
    const encoder = new TextEncoder();
    const data = encoder.encode(keyMaterial);

    const importedKey = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('tts-reader-extension'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      importedKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async encrypt(plaintext) {
    if (!plaintext) return '';

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.getDerivedKey();

    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  static async decrypt(encryptedBase64) {
    if (!encryptedBase64) return '';

    try {
      const combined = new Uint8Array(
        atob(encryptedBase64).split('').map(char => char.charCodeAt(0))
      );

      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);
      const key = await this.getDerivedKey();

      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
      );

      return new TextDecoder().decode(decryptedData);
    } catch {
      return '';
    }
  }
}
```

### shared/storage/SettingsStore.js
```javascript
import { Encryption } from '../crypto/encryption.js';
import { DEFAULT_SETTINGS } from '../utils/constants.js';

export class SettingsStore {
  static async get() {
    const syncData = await chrome.storage.sync.get({
      apiUrl: DEFAULT_SETTINGS.apiUrl
    });

    const localData = await chrome.storage.local.get({
      encryptedApiKey: ''
    });

    let apiKey = '';
    if (localData.encryptedApiKey) {
      apiKey = await Encryption.decrypt(localData.encryptedApiKey);
    }

    return {
      apiUrl: syncData.apiUrl,
      apiKey
    };
  }

  static async set({ apiUrl, apiKey }) {
    await chrome.storage.sync.set({ apiUrl });

    if (apiKey !== undefined) {
      const encryptedApiKey = apiKey ? await Encryption.encrypt(apiKey) : '';
      await chrome.storage.local.set({ encryptedApiKey });
    }
  }

  static async getApiUrl() {
    const data = await chrome.storage.sync.get({
      apiUrl: DEFAULT_SETTINGS.apiUrl
    });
    return data.apiUrl;
  }

  static async getApiKey() {
    const data = await chrome.storage.local.get({ encryptedApiKey: '' });
    if (data.encryptedApiKey) {
      return await Encryption.decrypt(data.encryptedApiKey);
    }
    return '';
  }
}
```

### shared/api/TTSClient.js
```javascript
import { APIError } from '../utils/errors.js';

export class TTSClient {
  constructor(baseUrl, apiKey = '') {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async checkHealth() {
    const response = await this.fetch('/health');
    return response.json();
  }

  async synthesizeStream(text, options = {}) {
    return await this.fetch('/tts/stream', {
      method: 'POST',
      body: JSON.stringify({
        text,
        voice: options.voice || 'bf_lily',
        speed: options.speed || 1.0
      })
    });
  }

  async fetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'X-API-Key': this.apiKey }),
      ...options.headers
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new APIError(response.status, await response.text());
    }

    return response;
  }
}
```

### content/utils/events.js
```javascript
export class EventManager {
  constructor() {
    this.handlers = new Map();
  }

  on(element, event, handler, options) {
    element.addEventListener(event, handler, options);

    if (!this.handlers.has(element)) {
      this.handlers.set(element, []);
    }
    this.handlers.get(element).push({ event, handler, options });
  }

  off(element, event, handler) {
    element.removeEventListener(event, handler);
  }

  cleanup() {
    for (const [element, handlers] of this.handlers) {
      for (const { event, handler } of handlers) {
        element.removeEventListener(event, handler);
      }
    }
    this.handlers.clear();
  }
}
```

### content/utils/dom.js
```javascript
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function createElement(tag, className, attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

export function getScrollPosition() {
  return {
    top: window.pageYOffset || document.documentElement.scrollTop,
    left: window.pageXOffset || document.documentElement.scrollLeft
  };
}
```

### content/state/PlaybackState.js
```javascript
import { PLAYER_STATES } from '../../shared/utils/constants.js';

export class PlaybackState {
  constructor() {
    this.state = PLAYER_STATES.IDLE;
    this.listeners = new Set();
    this.currentParagraph = null;
    this.currentHighlightedPhrase = null;
    this.phraseTimeline = [];
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.notify();
    }
  }

  getState() {
    return this.state;
  }

  setParagraph(paragraph) {
    this.currentParagraph = paragraph;
  }

  getParagraph() {
    return this.currentParagraph;
  }

  setHighlightedPhrase(phrase) {
    this.currentHighlightedPhrase = phrase;
  }

  getHighlightedPhrase() {
    return this.currentHighlightedPhrase;
  }

  setPhraseTimeline(timeline) {
    this.phraseTimeline = timeline;
  }

  getPhraseTimeline() {
    return this.phraseTimeline;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  reset() {
    this.state = PLAYER_STATES.IDLE;
    this.currentParagraph = null;
    this.currentHighlightedPhrase = null;
    this.phraseTimeline = [];
    this.notify();
  }
}
```

### content/audio/StreamParser.js
```javascript
import { StreamParseError } from '../../shared/utils/errors.js';

export class StreamParser {
  static async parseMultipartStream(reader, boundary) {
    const parts = [];
    let buffer = new Uint8Array(0);
    const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
    const endBoundaryBytes = new TextEncoder().encode(`--${boundary}--`);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = this.appendBuffer(buffer, value);

      while (true) {
        const part = this.extractNextPart(buffer, boundaryBytes, endBoundaryBytes);
        if (!part) break;
        if (part.isEnd) return parts;

        parts.push(part.data);
        buffer = part.remaining;
      }
    }

    return parts;
  }

  static appendBuffer(buffer, value) {
    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    return newBuffer;
  }

  static extractNextPart(buffer, boundaryBytes, endBoundaryBytes) {
    const boundaryIndex = this.findBytesInArray(buffer, boundaryBytes);
    if (boundaryIndex === -1) return null;

    const isEndBoundary = this.arrayStartsWith(
      buffer.slice(boundaryIndex),
      endBoundaryBytes
    );
    if (isEndBoundary) return { isEnd: true };

    const headersEnd = this.findBytesInArray(
      buffer.slice(boundaryIndex),
      new Uint8Array([13, 10, 13, 10])
    );
    if (headersEnd === -1) return null;

    const headersStart = boundaryIndex + boundaryBytes.length;
    const contentStart = boundaryIndex + headersEnd + 4;

    const headersBytes = buffer.slice(headersStart, boundaryIndex + headersEnd);
    const headers = new TextDecoder().decode(headersBytes);
    const contentType = this.extractContentType(headers);

    const nextBoundaryIndex = this.findBytesInArray(
      buffer.slice(contentStart),
      new Uint8Array([13, 10, 45, 45])
    );
    if (nextBoundaryIndex === -1) return null;

    const contentEnd = contentStart + nextBoundaryIndex;
    const contentBytes = buffer.slice(contentStart, contentEnd);

    let data;
    if (contentType.includes('application/json')) {
      const jsonText = new TextDecoder().decode(contentBytes);
      try {
        data = { type: 'metadata', metadata: JSON.parse(jsonText) };
      } catch {
        return null;
      }
    } else if (contentType.includes('audio/wav')) {
      data = { type: 'audio', audioData: contentBytes };
    } else {
      data = { type: 'unknown' };
    }

    return {
      data,
      remaining: buffer.slice(contentEnd),
      isEnd: false
    };
  }

  static findBytesInArray(array, sequence) {
    for (let i = 0; i <= array.length - sequence.length; i++) {
      let found = true;
      for (let j = 0; j < sequence.length; j++) {
        if (array[i + j] !== sequence[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }

  static arrayStartsWith(array, sequence) {
    if (array.length < sequence.length) return false;
    for (let i = 0; i < sequence.length; i++) {
      if (array[i] !== sequence[i]) return false;
    }
    return true;
  }

  static extractContentType(headers) {
    const match = headers.match(/Content-Type:\s*([^\r\n]+)/i);
    return match ? match[1].trim() : '';
  }

  static buildPhraseTimeline(metadataArray) {
    const timeline = [];

    for (const metadata of metadataArray) {
      const { chunk_index, phrases, start_offset_ms } = metadata;
      if (!phrases || phrases.length === 0) continue;

      for (const phrase of phrases) {
        timeline.push({
          phrase: phrase.text,
          startTime: start_offset_ms + phrase.start_ms,
          endTime: start_offset_ms + phrase.start_ms + phrase.duration_ms,
          chunkIndex: chunk_index
        });
      }
    }

    return timeline;
  }
}
```

### content/audio/AudioQueue.js
```javascript
import { AudioPlaybackError } from '../../shared/utils/errors.js';
import { PLAYER_STATES, TIMEOUTS } from '../../shared/utils/constants.js';

export class AudioQueue {
  constructor(state, highlightManager) {
    this.state = state;
    this.highlightManager = highlightManager;
    this.queue = [];
    this.currentAudio = null;
    this.currentMetadata = null;
    this.isPlaying = false;
    this.pausedQueue = [];
  }

  enqueue(audioBlob, metadata) {
    this.queue.push({ blob: audioBlob, metadata });
  }

  clear() {
    this.queue = [];
    this.pausedQueue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.currentMetadata = null;
    this.isPlaying = false;
  }

  async play() {
    if (this.queue.length === 0) {
      this.finish();
      return;
    }

    const item = this.queue.shift();
    this.currentMetadata = item.metadata;

    const audioUrl = URL.createObjectURL(item.blob);
    this.currentAudio = new Audio(audioUrl);

    this.setupAudioEvents(audioUrl);
    this.setupHighlightSync();

    try {
      await this.currentAudio.play();
      this.state.setState(PLAYER_STATES.PLAYING);
      this.isPlaying = true;
    } catch (error) {
      URL.revokeObjectURL(audioUrl);
      throw new AudioPlaybackError(error.message);
    }
  }

  pause() {
    if (this.currentAudio && this.isPlaying) {
      this.currentAudio.pause();
      this.pausedQueue = [...this.queue];
      this.isPlaying = false;
      this.state.setState(PLAYER_STATES.PAUSED);
    }
  }

  async resume() {
    if (this.currentAudio && !this.isPlaying) {
      try {
        await this.currentAudio.play();
        this.isPlaying = true;
        this.state.setState(PLAYER_STATES.PLAYING);

        if (this.currentMetadata) {
          const startOffsetMs = this.currentMetadata.start_offset_ms;
          const currentTimeMs = startOffsetMs + (this.currentAudio.currentTime * 1000);
          this.highlightManager.updateHighlight(currentTimeMs);
        }
      } catch (error) {
        await this.play();
      }
    }
  }

  setupAudioEvents(audioUrl) {
    this.currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      this.play();
    };

    this.currentAudio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      this.play();
    };
  }

  setupHighlightSync() {
    if (!this.currentMetadata) return;

    const startOffsetMs = this.currentMetadata.start_offset_ms;

    this.currentAudio.addEventListener('timeupdate', () => {
      if (this.currentAudio && !this.currentAudio.paused) {
        const currentTimeMs = startOffsetMs + (this.currentAudio.currentTime * 1000);
        this.highlightManager.updateHighlight(currentTimeMs);
      }
    });

    this.currentAudio.addEventListener('play', () => {
      this.highlightManager.updateHighlight(startOffsetMs);
    });
  }

  finish() {
    this.isPlaying = false;
    this.state.setState(PLAYER_STATES.IDLE);
    this.currentAudio = null;
    this.currentMetadata = null;
    this.highlightManager.clearHighlights();

    setTimeout(() => {
      const paragraph = this.state.getParagraph();
      if (paragraph) {
        this.highlightManager.restoreParagraph(paragraph);
      }
    }, TIMEOUTS.PARAGRAPH_RESTORE);
  }
}
```

### content/ui/HighlightManager.js
```javascript
import { escapeHtml } from '../utils/dom.js';

export class HighlightManager {
  constructor(state) {
    this.state = state;
  }

  wrapPhrases(paragraph, timeline) {
    if (!paragraph.dataset.originalHtml) {
      paragraph.dataset.originalHtml = paragraph.innerHTML;
    }

    const originalText = paragraph.textContent;
    const phrasesToFind = timeline.map(t => t.phrase);

    let currentIndex = 0;
    let html = '';
    let timelineIndex = 0;

    for (const phraseText of phrasesToFind) {
      const phraseIndex = originalText.indexOf(phraseText, currentIndex);
      if (phraseIndex === -1) continue;

      if (phraseIndex > currentIndex) {
        html += escapeHtml(originalText.substring(currentIndex, phraseIndex));
      }

      const phraseData = timeline[timelineIndex];
      html += `<span class="tts-phrase" data-start-time="${phraseData.startTime}" data-end-time="${phraseData.endTime}" data-phrase-index="${timelineIndex}">${escapeHtml(phraseText)}</span>`;

      currentIndex = phraseIndex + phraseText.length;
      timelineIndex++;
    }

    if (currentIndex < originalText.length) {
      html += escapeHtml(originalText.substring(currentIndex));
    }

    paragraph.innerHTML = html;
  }

  restoreParagraph(paragraph) {
    if (!paragraph) return;

    if (paragraph.dataset.originalHtml) {
      paragraph.innerHTML = paragraph.dataset.originalHtml;
      delete paragraph.dataset.originalHtml;
    }

    const highlightedPhrases = paragraph.querySelectorAll('.tts-phrase.tts-highlighted');
    highlightedPhrases.forEach(el => el.classList.remove('tts-highlighted'));
  }

  updateHighlight(currentTimeMs) {
    const paragraph = this.state.getParagraph();
    if (!paragraph) return;

    const phraseSpans = paragraph.querySelectorAll('.tts-phrase[data-start-time][data-end-time]');

    for (const span of phraseSpans) {
      const startTime = parseFloat(span.dataset.startTime);
      const endTime = parseFloat(span.dataset.endTime);

      if (currentTimeMs >= startTime && currentTimeMs < endTime) {
        const currentHighlight = this.state.getHighlightedPhrase();

        if (currentHighlight !== span) {
          if (currentHighlight) {
            currentHighlight.classList.remove('tts-highlighted');
          }

          span.classList.add('tts-highlighted');
          this.state.setHighlightedPhrase(span);
          this.scrollToPhraseIfNeeded(span);
        }
        return;
      }
    }
  }

  scrollToPhraseIfNeeded(phraseSpan) {
    const rect = phraseSpan.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const isAboveViewport = rect.top < 0;
    const isBelowViewport = rect.bottom > viewportHeight;

    if (isAboveViewport || isBelowViewport) {
      phraseSpan.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }

  clearHighlights() {
    const currentHighlight = this.state.getHighlightedPhrase();
    if (currentHighlight) {
      currentHighlight.classList.remove('tts-highlighted');
      this.state.setHighlightedPhrase(null);
    }

    document.querySelectorAll('.tts-phrase.tts-highlighted').forEach(el => {
      el.classList.remove('tts-highlighted');
    });
  }
}
```

### content/ui/PlayButton.js
```javascript
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
```

### content/ui/PlayerControl.js
```javascript
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
```

### content/index.js
```javascript
import { PlaybackState } from './state/PlaybackState.js';
import { EventManager } from './utils/events.js';
import { PlayButton } from './ui/PlayButton.js';
import { PlayerControl } from './ui/PlayerControl.js';
import { HighlightManager } from './ui/HighlightManager.js';
import { AudioQueue } from './audio/AudioQueue.js';
import { StreamParser } from './audio/StreamParser.js';
import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { TTSClient } from '../shared/api/TTSClient.js';
import { PLAYER_STATES } from '../shared/utils/constants.js';

class TTSContentScript {
  constructor() {
    this.state = new PlaybackState();
    this.eventManager = new EventManager();
    this.highlightManager = new HighlightManager(this.state);
    this.audioQueue = new AudioQueue(this.state, this.highlightManager);
    this.playerControl = new PlayerControl(
      this.state,
      this.eventManager,
      () => this.handlePlayerControlClick()
    );
    this.playButton = new PlayButton(
      this.state,
      this.eventManager,
      () => this.handlePlayClick()
    );
  }

  init() {
    this.playButton.init();
  }

  async handlePlayClick() {
    const paragraph = this.state.getParagraph();
    if (!paragraph) return;

    const text = paragraph.textContent.trim();

    this.audioQueue.clear();
    this.playerControl.show();
    this.state.setState(PLAYER_STATES.LOADING);

    try {
      const settings = await SettingsStore.get();
      await this.synthesizeAndPlay(text, settings);
    } catch (error) {
      console.error('TTS Error:', error);
      this.state.setState(PLAYER_STATES.IDLE);
      alert('Failed to connect to TTS server. Please check your settings.\n\nError: ' + error.message);
    }
  }

  handlePlayerControlClick() {
    const currentState = this.state.getState();

    if (currentState === PLAYER_STATES.PLAYING) {
      this.audioQueue.pause();
    } else if (currentState === PLAYER_STATES.PAUSED) {
      this.audioQueue.resume();
    } else if (currentState === PLAYER_STATES.IDLE) {
      const paragraph = this.state.getParagraph();
      if (paragraph) {
        this.handlePlayClick();
      }
    }
  }

  async synthesizeAndPlay(text, settings) {
    const client = new TTSClient(settings.apiUrl, settings.apiKey);
    const response = await client.synthesizeStream(text);

    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('multipart')) {
      throw new Error('Expected multipart response, got: ' + contentType);
    }

    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      throw new Error('No boundary found in multipart response');
    }

    const reader = response.body.getReader();
    const parts = await StreamParser.parseMultipartStream(reader, boundaryMatch[1]);

    const metadataArray = parts
      .filter(p => p.type === 'metadata')
      .map(p => p.metadata);

    const audioBlobs = parts
      .filter(p => p.type === 'audio')
      .map(p => new Blob([p.audioData], { type: 'audio/wav' }));

    if (audioBlobs.length === 0) {
      throw new Error('No audio data received from server');
    }

    const phraseTimeline = StreamParser.buildPhraseTimeline(metadataArray);
    this.state.setPhraseTimeline(phraseTimeline);

    const paragraph = this.state.getParagraph();
    if (paragraph && phraseTimeline.length > 0) {
      this.highlightManager.wrapPhrases(paragraph, phraseTimeline);
    }

    for (let i = 0; i < audioBlobs.length; i++) {
      this.audioQueue.enqueue(audioBlobs[i], metadataArray[i] || null);
    }

    await this.audioQueue.play();
  }

  cleanup() {
    this.playButton.cleanup();
    this.playerControl.cleanup();
    this.audioQueue.clear();
    this.eventManager.cleanup();
  }
}

const ttsApp = new TTSContentScript();
ttsApp.init();
```

### popup/StatusMessage.js
```javascript
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
```

### popup/SettingsForm.js
```javascript
import { SettingsStore } from '../shared/storage/SettingsStore.js';
import { TTSClient } from '../shared/api/TTSClient.js';

export class SettingsForm {
  constructor(formElement, statusMessage) {
    this.form = formElement;
    this.statusMessage = statusMessage;
    this.apiUrlInput = formElement.querySelector('#api-url');
    this.apiKeyInput = formElement.querySelector('#api-key');
    this.testButton = formElement.querySelector('#test-connection');
    this.toggleButton = formElement.querySelector('#toggle-visibility');
    this.changeButton = formElement.querySelector('#change-key');

    this.isApiKeyModified = false;
    this.hasStoredKey = false;
  }

  init() {
    this.loadSettings();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.testButton.addEventListener('click', () => this.testConnection());
    this.toggleButton.addEventListener('click', () => this.togglePasswordVisibility());
    this.changeButton.addEventListener('click', () => this.handleChangeKey());
    this.apiKeyInput.addEventListener('input', () => this.handleApiKeyInput());
  }

  async loadSettings() {
    const settings = await SettingsStore.get();
    this.apiUrlInput.value = settings.apiUrl;

    if (settings.apiKey) {
      this.apiKeyInput.value = '';
      this.apiKeyInput.placeholder = '••••••••••••••••';
      this.apiKeyInput.disabled = true;
      this.hasStoredKey = true;
      this.toggleButton.style.display = 'none';
      this.changeButton.style.display = 'block';
    } else {
      this.apiKeyInput.placeholder = 'Enter API key if required';
      this.apiKeyInput.disabled = false;
      this.hasStoredKey = false;
      this.toggleButton.style.display = 'none';
      this.changeButton.style.display = 'none';
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    const apiUrl = this.apiUrlInput.value.trim();
    const apiKey = this.apiKeyInput.value.trim();

    try {
      await SettingsStore.set({ apiUrl });

      if (this.isApiKeyModified || apiKey) {
        await SettingsStore.set({ apiKey });

        this.apiKeyInput.value = '';
        this.apiKeyInput.placeholder = '••••••••••••••••';
        this.apiKeyInput.disabled = true;
        this.isApiKeyModified = false;
        this.hasStoredKey = true;
        this.toggleButton.style.display = 'none';
        this.changeButton.style.display = 'block';
      }

      this.statusMessage.show('Settings saved successfully!', 'success');
    } catch (error) {
      this.statusMessage.show('Error saving settings: ' + error.message, 'error');
    }
  }

  async testConnection() {
    const apiUrl = this.apiUrlInput.value.trim();

    if (!apiUrl) {
      this.statusMessage.show('Please enter an API URL', 'error');
      return;
    }

    this.testButton.disabled = true;
    this.testButton.textContent = 'Testing...';

    try {
      let apiKey = this.apiKeyInput.value.trim();
      if (!apiKey) {
        apiKey = await SettingsStore.getApiKey();
      }

      const client = new TTSClient(apiUrl, apiKey);
      const data = await client.checkHealth();

      if (data.status === 'ok') {
        this.statusMessage.show('Connection successful!', 'success');
      } else {
        this.statusMessage.show('Unexpected response from server', 'error');
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        this.statusMessage.show('Authentication failed. Check your API key.', 'error');
      } else {
        this.statusMessage.show('Connection failed: ' + error.message, 'error');
      }
    } finally {
      this.testButton.disabled = false;
      this.testButton.textContent = 'Test Connection';
    }
  }

  togglePasswordVisibility() {
    if (this.apiKeyInput.type === 'password') {
      this.apiKeyInput.type = 'text';
      this.toggleButton.textContent = '🙈';
    } else {
      this.apiKeyInput.type = 'password';
      this.toggleButton.textContent = '👁️';
    }
  }

  handleApiKeyInput() {
    this.isApiKeyModified = true;

    if (this.apiKeyInput.value.length > 0) {
      this.toggleButton.style.display = 'block';
      this.changeButton.style.display = 'none';
    } else {
      this.toggleButton.style.display = 'none';
      if (this.hasStoredKey) {
        this.changeButton.style.display = 'block';
      }
    }
  }

  handleChangeKey() {
    this.apiKeyInput.disabled = false;
    this.apiKeyInput.value = '';
    this.apiKeyInput.placeholder = 'Enter new API key';
    this.apiKeyInput.focus();
    this.isApiKeyModified = true;
    this.changeButton.style.display = 'none';
  }
}
```

### popup/index.js
```javascript
import { SettingsForm } from './SettingsForm.js';
import { StatusMessage } from './StatusMessage.js';

const statusMessageElement = document.getElementById('status-message');
const formElement = document.getElementById('settings-form');

const statusMessage = new StatusMessage(statusMessageElement);
const settingsForm = new SettingsForm(formElement, statusMessage);

settingsForm.init();
```

## Implementation Phases

### Phase 1: Shared Utilities
1. Create `shared/utils/constants.js`
2. Create `shared/utils/errors.js`
3. Create `shared/utils/debounce.js`
4. Create `shared/utils/throttle.js`
5. Create `shared/crypto/encryption.js`
6. Create `shared/storage/SettingsStore.js`
7. Create `shared/api/TTSClient.js`

### Phase 2: Content Script Modules
1. Create `content/utils/dom.js`
2. Create `content/utils/events.js`
3. Create `content/state/PlaybackState.js`
4. Create `content/audio/StreamParser.js`
5. Create `content/audio/AudioQueue.js`
6. Create `content/ui/HighlightManager.js`
7. Create `content/ui/PlayButton.js`
8. Create `content/ui/PlayerControl.js`
9. Create `content/index.js`

### Phase 3: Popup Modules
1. Create `popup/StatusMessage.js`
2. Create `popup/SettingsForm.js`
3. Create `popup/index.js`

### Phase 4: CSS Organization
1. Extract `styles/variables.css`
2. Split `styles/content/play-button.css`
3. Split `styles/content/player-control.css`
4. Split `styles/content/highlighting.css`
5. Keep `styles/popup.css`

### Phase 5: Build System
1. Install esbuild or rollup
2. Create build scripts
3. Update manifest.json to point to bundled files
4. Add source maps for development
5. Test bundled extension

### Phase 6: Testing & Cleanup
1. Test each module independently
2. Remove old files (content.js, popup.js, crypto-utils.js)
3. Verify all features work
4. Check for memory leaks
5. Performance testing

## Build Configuration (esbuild)

### package.json
```json
{
  "name": "tts-reader-extension",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "node build/bundle.js",
    "dev": "node build/bundle.js --watch"
  },
  "devDependencies": {
    "esbuild": "^0.19.0"
  }
}
```

### build/bundle.js
```javascript
import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [
    join(rootDir, 'src/content/index.js'),
    join(rootDir, 'src/popup/index.js')
  ],
  bundle: true,
  outdir: join(rootDir, 'dist'),
  format: 'iife',
  target: 'chrome96',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}
```

## Updated Manifest

### manifest.json
```json
{
  "manifest_version": 3,
  "name": "TTS Reader",
  "version": "1.0.0",
  "description": "Text-to-speech reader for web pages",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    "default_title": "TTS Reader Settings"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/index.js"],
      "css": ["src/styles/content/play-button.css", "src/styles/content/player-control.css", "src/styles/content/highlighting.css"],
      "run_at": "document_idle"
    }
  ],
  "permissions": ["storage"],
  "host_permissions": ["http://localhost/*", "https://*/*"]
}
```

