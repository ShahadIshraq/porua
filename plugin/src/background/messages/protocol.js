/**
 * Message Protocol for Background Script Communication
 *
 * Defines strict message types and payloads for communication between
 * content scripts/popup and background script.
 *
 * All messages follow this structure:
 * {
 *   type: string,      // Message type (one of MESSAGE_TYPES)
 *   payload: object    // Message-specific data
 * }
 *
 * Responses follow this structure:
 * {
 *   success: boolean,
 *   data?: any,        // Present if success=true
 *   error?: {          // Present if success=false
 *     type: string,
 *     message: string,
 *     status?: number,
 *     details?: any
 *   }
 * }
 */

/**
 * Message type constants
 * @enum {string}
 */
export const MESSAGE_TYPES = {
  // TTS operations
  TTS_SYNTHESIZE_STREAM: 'TTS_SYNTHESIZE_STREAM',
  TTS_SYNTHESIZE: 'TTS_SYNTHESIZE',
  TTS_GET_VOICES: 'TTS_GET_VOICES',
  TTS_CHECK_HEALTH: 'TTS_CHECK_HEALTH',
  TTS_FETCH_VOICE_SAMPLE: 'TTS_FETCH_VOICE_SAMPLE',

  // Cache operations (admin)
  CACHE_GET_STATS: 'CACHE_GET_STATS',
  CACHE_CLEAR: 'CACHE_CLEAR',
  CACHE_CONFIGURE: 'CACHE_CONFIGURE',
};

/**
 * Port names for long-lived connections
 * @enum {string}
 */
export const PORT_NAMES = {
  TTS_STREAM: 'tts-stream',
};

/**
 * Error types
 * @enum {string}
 */
export const ERROR_TYPES = {
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  STREAM_ERROR: 'STREAM_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Validate message structure
 * @param {object} message - Message to validate
 * @returns {boolean} True if valid
 * @throws {Error} If invalid
 */
export function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new Error('Message must be an object');
  }

  if (!message.type || typeof message.type !== 'string') {
    throw new Error('Message must have a type string');
  }

  if (!Object.values(MESSAGE_TYPES).includes(message.type)) {
    throw new Error(`Unknown message type: ${message.type}`);
  }

  // payload is optional but must be object if present
  if (message.payload !== undefined && typeof message.payload !== 'object') {
    throw new Error('Message payload must be an object if present');
  }

  return true;
}

/**
 * Create success response
 * @param {any} data - Response data
 * @returns {object} Success response
 */
export function createSuccessResponse(data) {
  return {
    success: true,
    data,
  };
}

/**
 * Create error response
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @param {number} [status] - HTTP status code if applicable
 * @param {any} [details] - Additional error details
 * @returns {object} Error response
 */
export function createErrorResponse(type, message, status, details) {
  return {
    success: false,
    error: {
      type,
      message,
      ...(status !== undefined && { status }),
      ...(details !== undefined && { details }),
    },
  };
}

/**
 * Validate TTS synthesize payload
 * @param {object} payload - Payload to validate
 * @throws {Error} If invalid
 */
export function validateSynthesizePayload(payload) {
  if (!payload) {
    throw new Error('Synthesize payload is required');
  }

  if (!payload.text || typeof payload.text !== 'string') {
    throw new Error('Synthesize payload must have text string');
  }

  if (payload.text.trim().length === 0) {
    throw new Error('Synthesize text cannot be empty');
  }

  if (payload.voice !== undefined && typeof payload.voice !== 'string') {
    throw new Error('Voice must be a string if provided');
  }

  if (payload.speed !== undefined) {
    if (typeof payload.speed !== 'number') {
      throw new Error('Speed must be a number if provided');
    }
    if (payload.speed <= 0 || payload.speed > 3.0) {
      throw new Error('Speed must be between 0 and 3.0');
    }
  }
}

/**
 * Validate voice sample payload
 * @param {object} payload - Payload to validate
 * @throws {Error} If invalid
 */
export function validateVoiceSamplePayload(payload) {
  if (!payload) {
    throw new Error('Voice sample payload is required');
  }

  if (!payload.voiceId || typeof payload.voiceId !== 'string') {
    throw new Error('Voice sample payload must have voiceId string');
  }
}
