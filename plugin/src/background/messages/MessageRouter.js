/**
 * MessageRouter - Routes incoming messages to appropriate handlers
 *
 * Provides centralized message routing with validation and error handling.
 * All handlers are async and return structured responses.
 */

import {
  MESSAGE_TYPES,
  validateMessage,
  createSuccessResponse,
  createErrorResponse,
  ERROR_TYPES,
} from './protocol.js';

export class MessageRouter {
  constructor() {
    this.handlers = new Map();
  }

  /**
   * Register a handler for a message type
   * @param {string} messageType - Message type from MESSAGE_TYPES
   * @param {Function} handler - Async handler function (payload, sender) => data
   */
  registerHandler(messageType, handler) {
    if (!Object.values(MESSAGE_TYPES).includes(messageType)) {
      throw new Error(`Invalid message type: ${messageType}`);
    }

    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    this.handlers.set(messageType, handler);
  }

  /**
   * Handle incoming message
   * @param {object} message - Message object with type and payload
   * @param {object} sender - Chrome runtime sender object
   * @returns {Promise<object>} Response object (success or error)
   */
  async handleMessage(message, sender) {
    try {
      // Validate message structure
      validateMessage(message);

      const { type, payload } = message;

      // Get handler
      const handler = this.handlers.get(type);
      if (!handler) {
        return createErrorResponse(
          ERROR_TYPES.UNKNOWN_ERROR,
          `No handler registered for message type: ${type}`
        );
      }

      // Execute handler
      const data = await handler(payload, sender);

      // Return success response
      return createSuccessResponse(data);
    } catch (error) {
      // Determine error type
      let errorType = ERROR_TYPES.UNKNOWN_ERROR;
      let status;

      if (error.name === 'ValidationError' || error.message.includes('payload')) {
        errorType = ERROR_TYPES.VALIDATION_ERROR;
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorType = ERROR_TYPES.NETWORK_ERROR;
      } else if (error.status) {
        errorType = ERROR_TYPES.API_ERROR;
        status = error.status;
      }

      return createErrorResponse(
        errorType,
        error.message,
        status,
        {
          stack: error.stack,
        }
      );
    }
  }

  /**
   * Get registered handler count (for testing)
   * @returns {number}
   */
  getHandlerCount() {
    return this.handlers.size;
  }
}
