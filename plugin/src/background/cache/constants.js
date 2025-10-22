/**
 * Cache Configuration Constants
 */

export const CACHE_CONFIG = {
  // Size Limits
  MAX_CACHE_SIZE_BYTES: 100 * 1024 * 1024, // 100 MB
  MIN_CACHE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB

  // Eviction Thresholds
  EVICTION_TRIGGER_PERCENT: 0.95, // Trigger at 95% full
  EVICTION_TARGET_PERCENT: 0.8, // Evict down to 80%

  // Entry Limits
  MAX_ENTRY_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB per entry

  // Key Generation
  TEXT_HASH_LENGTH: 32, // 32 hex chars (16 bytes of SHA-256)
  TEXT_PREVIEW_LENGTH: 200, // Store first 200 chars

  // Database
  DB_NAME: 'porua-tts-cache',
  DB_VERSION: 1,
  STORE_AUDIO_CACHE: 'audioCache',
  STORE_METADATA: 'cacheMetadata',

  // Performance
  BATCH_EVICTION_SIZE: 10, // Evict up to 10 entries at once
  ACCESS_UPDATE_DEBOUNCE_MS: 5000, // Update access time max once per 5s

  // Integrity
  INTEGRITY_CHECK_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours
};

export const CACHE_ERRORS = {
  DB_INIT_FAILED: 'CACHE_DB_INIT_FAILED',
  QUOTA_EXCEEDED: 'CACHE_QUOTA_EXCEEDED',
  ENTRY_TOO_LARGE: 'CACHE_ENTRY_TOO_LARGE',
  TRANSACTION_FAILED: 'CACHE_TRANSACTION_FAILED',
  CORRUPTED_DATA: 'CACHE_CORRUPTED_DATA',
  KEY_GENERATION_FAILED: 'CACHE_KEY_GENERATION_FAILED',
};
