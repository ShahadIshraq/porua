/**
 * Logging utility with configurable levels.
 */

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

const LEVEL_NAMES = {
  [LOG_LEVELS.ERROR]: 'ERROR',
  [LOG_LEVELS.WARN]: 'WARN',
  [LOG_LEVELS.INFO]: 'INFO',
  [LOG_LEVELS.DEBUG]: 'DEBUG',
  [LOG_LEVELS.TRACE]: 'TRACE'
};

export class Logger {
  constructor(name, level = LOG_LEVELS.INFO) {
    this.name = name;
    this.level = level;
  }

  setLevel(level) {
    this.level = level;
  }

  error(...args) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(`[${this.name}]`, ...args);
    }
  }

  warn(...args) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(`[${this.name}]`, ...args);
    }
  }

  info(...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`[${this.name}]`, ...args);
    }
  }

  debug(...args) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(`[${this.name}]`, ...args);
    }
  }

  trace(...args) {
    if (this.level >= LOG_LEVELS.TRACE) {
      console.log(`[${this.name}]`, ...args);
    }
  }
}

/**
 * Global log level configuration.
 * Can be set via: window.TTS_DEBUG = true
 */
const getGlobalLogLevel = () => {
  if (typeof window !== 'undefined' && window.TTS_DEBUG) {
    return LOG_LEVELS.DEBUG;
  }
  return LOG_LEVELS.INFO;
};

// Export pre-configured loggers
export const createLogger = (name) => {
  return new Logger(name, getGlobalLogLevel());
};
