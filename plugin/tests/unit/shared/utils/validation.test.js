import { describe, it, expect } from 'vitest';
import { validateTTSText, validateSpeed } from '../../../../src/shared/utils/validation.js';

describe('validateTTSText', () => {
  describe('valid inputs', () => {
    it('should accept and trim valid text', () => {
      const result = validateTTSText('  Hello world  ');
      expect(result).toBe('Hello world');
    });

    it('should accept text with special characters', () => {
      const text = 'Hello! How are you? Testing 123.';
      const result = validateTTSText(text);
      expect(result).toBe(text);
    });

    it('should accept text with newlines and tabs', () => {
      const text = 'Line 1\nLine 2\tTabbed';
      const result = validateTTSText(text);
      expect(result).toBe(text);
    });

    it('should accept text exactly at max length (10000 chars)', () => {
      const longText = 'a'.repeat(10000);
      const result = validateTTSText(longText);
      expect(result).toBe(longText);
      expect(result.length).toBe(10000);
    });

    it('should accept and trim text with whitespace within max length', () => {
      const text = '  ' + 'a'.repeat(9996) + '  ';
      const result = validateTTSText(text);
      expect(result.length).toBe(9996);
    });

    it('should accept single character', () => {
      const result = validateTTSText('a');
      expect(result).toBe('a');
    });
  });

  describe('invalid inputs - type errors', () => {
    it('should throw on null', () => {
      expect(() => validateTTSText(null)).toThrow('Text must be a non-empty string');
    });

    it('should throw on undefined', () => {
      expect(() => validateTTSText(undefined)).toThrow('Text must be a non-empty string');
    });

    it('should throw on number', () => {
      expect(() => validateTTSText(123)).toThrow('Text must be a non-empty string');
    });

    it('should throw on object', () => {
      expect(() => validateTTSText({})).toThrow('Text must be a non-empty string');
    });

    it('should throw on array', () => {
      expect(() => validateTTSText([])).toThrow('Text must be a non-empty string');
    });

    it('should throw on boolean', () => {
      expect(() => validateTTSText(true)).toThrow('Text must be a non-empty string');
    });
  });

  describe('invalid inputs - empty text', () => {
    it('should throw on empty string', () => {
      expect(() => validateTTSText('')).toThrow('Text must be a non-empty string');
    });

    it('should throw on whitespace-only string', () => {
      expect(() => validateTTSText('   ')).toThrow('Text cannot be empty');
    });

    it('should throw on tabs-only string', () => {
      expect(() => validateTTSText('\t\t\t')).toThrow('Text cannot be empty');
    });

    it('should throw on newlines-only string', () => {
      expect(() => validateTTSText('\n\n\n')).toThrow('Text cannot be empty');
    });

    it('should throw on mixed whitespace-only string', () => {
      expect(() => validateTTSText('  \n\t  \n  ')).toThrow('Text cannot be empty');
    });
  });

  describe('invalid inputs - max length', () => {
    it('should throw on text exceeding max length by 1', () => {
      const longText = 'a'.repeat(10001);
      expect(() => validateTTSText(longText)).toThrow('Text exceeds maximum length');
    });

    it('should throw on text exceeding max length by 100', () => {
      const longText = 'a'.repeat(10100);
      expect(() => validateTTSText(longText)).toThrow('Text exceeds maximum length');
    });

    it('should throw on text exceeding max length by a lot', () => {
      const longText = 'a'.repeat(50000);
      expect(() => validateTTSText(longText)).toThrow('Text exceeds maximum length');
    });

    it('should throw on text with whitespace that exceeds max length after trim', () => {
      const longText = '  ' + 'a'.repeat(10001) + '  ';
      expect(() => validateTTSText(longText)).toThrow('Text exceeds maximum length');
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters', () => {
      const text = 'Hello 世界 🌍';
      const result = validateTTSText(text);
      expect(result).toBe(text);
    });

    it('should handle emojis', () => {
      const text = '😀 😃 😄 😁';
      const result = validateTTSText(text);
      expect(result).toBe(text);
    });
  });
});

describe('validateSpeed', () => {
  describe('valid inputs', () => {
    it('should accept speed exactly at MIN_SPEED (0.5)', () => {
      const result = validateSpeed(0.5);
      expect(result).toBe(0.5);
    });

    it('should accept speed exactly at MAX_SPEED (2.0)', () => {
      const result = validateSpeed(2.0);
      expect(result).toBe(2.0);
    });

    it('should accept speed at midpoint (1.25)', () => {
      const result = validateSpeed(1.25);
      expect(result).toBe(1.25);
    });

    it('should accept speed at 1.0', () => {
      const result = validateSpeed(1.0);
      expect(result).toBe(1.0);
    });

    it('should accept speed slightly above MIN_SPEED', () => {
      const result = validateSpeed(0.51);
      expect(result).toBe(0.51);
    });

    it('should accept speed slightly below MAX_SPEED', () => {
      const result = validateSpeed(1.99);
      expect(result).toBe(1.99);
    });

    it('should accept speed with many decimal places', () => {
      const result = validateSpeed(1.23456789);
      expect(result).toBe(1.23456789);
    });
  });

  describe('invalid inputs - type errors', () => {
    it('should throw on NaN', () => {
      expect(() => validateSpeed(NaN)).toThrow('Speed must be a valid number');
    });

    it('should throw on string', () => {
      expect(() => validateSpeed('1.0')).toThrow('Speed must be a valid number');
    });

    it('should throw on null', () => {
      expect(() => validateSpeed(null)).toThrow('Speed must be a valid number');
    });

    it('should throw on undefined', () => {
      expect(() => validateSpeed(undefined)).toThrow('Speed must be a valid number');
    });

    it('should throw on object', () => {
      expect(() => validateSpeed({})).toThrow('Speed must be a valid number');
    });

    it('should throw on array', () => {
      expect(() => validateSpeed([])).toThrow('Speed must be a valid number');
    });

    it('should throw on boolean', () => {
      expect(() => validateSpeed(true)).toThrow('Speed must be a valid number');
    });
  });

  describe('invalid inputs - out of range', () => {
    it('should throw on speed below MIN_SPEED', () => {
      expect(() => validateSpeed(0.49)).toThrow('Speed must be between 0.5 and 2');
    });

    it('should throw on speed above MAX_SPEED', () => {
      expect(() => validateSpeed(2.01)).toThrow('Speed must be between 0.5 and 2');
    });

    it('should throw on zero', () => {
      expect(() => validateSpeed(0)).toThrow('Speed must be between 0.5 and 2');
    });

    it('should throw on negative speed', () => {
      expect(() => validateSpeed(-1)).toThrow('Speed must be between 0.5 and 2');
    });

    it('should throw on very large speed', () => {
      expect(() => validateSpeed(100)).toThrow('Speed must be between 0.5 and 2');
    });

    it('should throw on very small speed', () => {
      expect(() => validateSpeed(0.1)).toThrow('Speed must be between 0.5 and 2');
    });
  });

  describe('edge cases', () => {
    it('should throw on Infinity', () => {
      expect(() => validateSpeed(Infinity)).toThrow('Speed must be between 0.5 and 2');
    });

    it('should throw on -Infinity', () => {
      expect(() => validateSpeed(-Infinity)).toThrow('Speed must be between 0.5 and 2');
    });

    it('should accept Number(1.5)', () => {
      const result = validateSpeed(Number(1.5));
      expect(result).toBe(1.5);
    });
  });
});
