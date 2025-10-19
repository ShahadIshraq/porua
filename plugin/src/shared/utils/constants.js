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

export const SKIP_INTERVALS = {
  FIVE_SECONDS: 5,
  TEN_SECONDS: 10,
  FIFTEEN_SECONDS: 15,
  THIRTY_SECONDS: 30
};

export const DEFAULT_SETTINGS = {
  apiUrl: 'http://localhost:3000',
  selectedVoiceId: 'bf_lily',
  selectedVoiceName: 'Lily',
  speed: 1.0,
  skipInterval: 10,
  enableSkipControls: true
};

export const Z_INDEX = {
  PLAY_BUTTON: 999999,
  PLAYER_CONTROL: 1000000
};

export const CACHE_CONFIG = {
  // Legacy prefetch config (deprecated)
  MAX_PREFETCH_CACHE_SIZE: 3,
  PREFETCH_LOOKAHEAD: 2,

  // NEW: Persistent cache config
  HOT_CACHE_SIZE: 5,              // In-memory entries
  WARM_CACHE_DB_NAME: 'tts-audio-db',
  WARM_CACHE_VERSION: 1,

  // Hard limits
  MAX_CACHE_SIZE_BYTES: 100 * 1024 * 1024,  // 100MB hard limit
  MAX_ENTRY_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds

  // Cache key
  CACHE_KEY_VERSION: 1,           // Bump to invalidate all caches

  // Eviction
  EVICTION_BATCH_SIZE: 5,         // Evict 5 entries at a time when limit hit
  CLEANUP_INTERVAL_MS: 3600000,   // Run cleanup every hour to remove stale entries

  // Stats
  STATS_LOG_INTERVAL_MS: 300000   // Log stats every 5 minutes
};

export const AUDIO_PROGRESS = {
  VIRTUAL_DURATION: 100
};
