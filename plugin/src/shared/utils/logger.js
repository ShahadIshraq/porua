export class Logger {
  static levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
  static currentLevel = this.levels.INFO;

  static error(context, message, error = null) {
    console.error(`[${context}] ${message}`, error || '');
  }

  static warn(context, message) {
    if (this.currentLevel >= this.levels.WARN) {
      console.warn(`[${context}] ${message}`);
    }
  }

  static info(context, message) {
    if (this.currentLevel >= this.levels.INFO) {
      console.log(`[${context}] ${message}`);
    }
  }

  static debug(context, message, data = null) {
    if (this.currentLevel >= this.levels.DEBUG) {
      console.log(`[${context}] ${message}`, data || '');
    }
  }
}
