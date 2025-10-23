import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../../../../src/shared/utils/logger.js';

describe('Logger', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;
  let consoleLogSpy;

  beforeEach(() => {
    // Spy on console methods
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Reset to default level
    Logger.currentLevel = Logger.levels.INFO;
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('error', () => {
    it('should always log errors regardless of level', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.error('TestContext', 'test error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[TestContext] test error message', '');
    });

    it('should log error with error object', () => {
      const error = new Error('test error');
      Logger.error('TestContext', 'error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[TestContext] error occurred', error);
    });

    it('should log error even when level is ERROR', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.error('TestContext', 'critical error');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('warn', () => {
    it('should log warning when level is WARN or higher', () => {
      Logger.currentLevel = Logger.levels.WARN;
      Logger.warn('TestContext', 'warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestContext] warning message');
    });

    it('should log warning when level is INFO', () => {
      Logger.currentLevel = Logger.levels.INFO;
      Logger.warn('TestContext', 'warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestContext] warning message');
    });

    it('should log warning when level is DEBUG', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      Logger.warn('TestContext', 'warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestContext] warning message');
    });

    it('should not log warning when level is ERROR', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.warn('TestContext', 'warning message');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info when level is INFO', () => {
      Logger.currentLevel = Logger.levels.INFO;
      Logger.info('TestContext', 'info message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] info message');
    });

    it('should log info when level is DEBUG', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      Logger.info('TestContext', 'info message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] info message');
    });

    it('should not log info when level is WARN', () => {
      Logger.currentLevel = Logger.levels.WARN;
      Logger.info('TestContext', 'info message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log info when level is ERROR', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.info('TestContext', 'info message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log debug when level is DEBUG', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      Logger.debug('TestContext', 'debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] debug message', '');
    });

    it('should log debug with data object', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      const data = { key: 'value' };
      Logger.debug('TestContext', 'debug message', data);

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] debug message', data);
    });

    it('should not log debug when level is INFO', () => {
      Logger.currentLevel = Logger.levels.INFO;
      Logger.debug('TestContext', 'debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug when level is WARN', () => {
      Logger.currentLevel = Logger.levels.WARN;
      Logger.debug('TestContext', 'debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug when level is ERROR', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.debug('TestContext', 'debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('levels', () => {
    it('should have correct level values', () => {
      expect(Logger.levels.ERROR).toBe(0);
      expect(Logger.levels.WARN).toBe(1);
      expect(Logger.levels.INFO).toBe(2);
      expect(Logger.levels.DEBUG).toBe(3);
    });

    it('should allow changing current level', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      expect(Logger.currentLevel).toBe(3);

      Logger.currentLevel = Logger.levels.ERROR;
      expect(Logger.currentLevel).toBe(0);
    });
  });
});
