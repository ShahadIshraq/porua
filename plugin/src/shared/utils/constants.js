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
  selectedVoiceId: 'bf_lily',
  selectedVoiceName: 'Lily',
  speed: 1.0
};

export const Z_INDEX = {
  PLAY_BUTTON: 999999,
  PLAYER_CONTROL: 1000000
};

export const CACHE_CONFIG = {
  MAX_PREFETCH_CACHE_SIZE: 3,
  PREFETCH_LOOKAHEAD: 2
};

export const AUDIO_PROGRESS = {
  VIRTUAL_DURATION: 100
};
