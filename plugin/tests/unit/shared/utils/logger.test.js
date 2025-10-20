import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../../../../src/shared/utils/logger.js';

describe('Logger', () => {
  let consoleErrorSpy, consoleWarnSpy, consoleLogSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Reset to default level
    Logger.currentLevel = Logger.levels.INFO;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('levels', () => {
    it('should have correct level values', () => {
      expect(Logger.levels.ERROR).toBe(0);
      expect(Logger.levels.WARN).toBe(1);
      expect(Logger.levels.INFO).toBe(2);
      expect(Logger.levels.DEBUG).toBe(3);
    });

    it('should default to INFO level', () => {
      expect(Logger.currentLevel).toBe(Logger.levels.INFO);
    });
  });

  describe('error', () => {
    it('should log error with context and message', () => {
      Logger.error('TestContext', 'Test error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[TestContext] Test error message', '');
    });

    it('should log error with error object', () => {
      const error = new Error('Test error');
      Logger.error('TestContext', 'Something failed', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[TestContext] Something failed', error);
    });

    it('should always log errors regardless of level', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.error('TestContext', 'Error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warning when level is WARN or higher', () => {
      Logger.currentLevel = Logger.levels.WARN;
      Logger.warn('TestContext', 'Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestContext] Warning message');
    });

    it('should log warning when level is INFO', () => {
      Logger.currentLevel = Logger.levels.INFO;
      Logger.warn('TestContext', 'Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestContext] Warning message');
    });

    it('should not log warning when level is ERROR', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.warn('TestContext', 'Warning message');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info when level is INFO or higher', () => {
      Logger.currentLevel = Logger.levels.INFO;
      Logger.info('TestContext', 'Info message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] Info message');
    });

    it('should log info when level is DEBUG', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      Logger.info('TestContext', 'Info message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] Info message');
    });

    it('should not log info when level is WARN', () => {
      Logger.currentLevel = Logger.levels.WARN;
      Logger.info('TestContext', 'Info message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log info when level is ERROR', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.info('TestContext', 'Info message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log debug when level is DEBUG', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      Logger.debug('TestContext', 'Debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] Debug message', '');
    });

    it('should log debug with data object', () => {
      Logger.currentLevel = Logger.levels.DEBUG;
      const data = { key: 'value' };
      Logger.debug('TestContext', 'Debug message', data);

      expect(consoleLogSpy).toHaveBeenCalledWith('[TestContext] Debug message', data);
    });

    it('should not log debug when level is INFO', () => {
      Logger.currentLevel = Logger.levels.INFO;
      Logger.debug('TestContext', 'Debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug when level is WARN', () => {
      Logger.currentLevel = Logger.levels.WARN;
      Logger.debug('TestContext', 'Debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug when level is ERROR', () => {
      Logger.currentLevel = Logger.levels.ERROR;
      Logger.debug('TestContext', 'Debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('level changes', () => {
    it('should respect level changes', () => {
      // Start at INFO
      Logger.currentLevel = Logger.levels.INFO;
      Logger.debug('Test', 'Should not log');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Change to DEBUG
      Logger.currentLevel = Logger.levels.DEBUG;
      Logger.debug('Test', 'Should log');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should allow setting to ERROR level', () => {
      Logger.currentLevel = Logger.levels.ERROR;

      Logger.error('Test', 'Error');
      Logger.warn('Test', 'Warn');
      Logger.info('Test', 'Info');
      Logger.debug('Test', 'Debug');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
