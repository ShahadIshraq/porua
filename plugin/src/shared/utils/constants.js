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
