/**
 * Input validation utilities for TTS text and speed parameters
 */

/**
 * Validates TTS text input
 * @param {string} text - Text to validate
 * @returns {string} Trimmed text if valid
 * @throws {Error} If text is invalid
 */
export function validateTTSText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('Text cannot be empty');
  }

  if (trimmed.length > 10000) {
    throw new Error('Text exceeds maximum length');
  }

  return trimmed;
}

/**
 * Validates TTS speed parameter
 * @param {number} speed - Speed value to validate
 * @returns {number} Speed value if valid
 * @throws {Error} If speed is invalid
 */
export function validateSpeed(speed) {
  const MIN_SPEED = 0.5;
  const MAX_SPEED = 2.0;

  if (typeof speed !== 'number' || isNaN(speed)) {
    throw new Error('Speed must be a valid number');
  }

  if (speed < MIN_SPEED || speed > MAX_SPEED) {
    throw new Error(`Speed must be between ${MIN_SPEED} and ${MAX_SPEED}`);
  }

  return speed;
}
