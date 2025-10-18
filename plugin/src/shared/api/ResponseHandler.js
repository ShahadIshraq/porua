/**
 * ResponseHandler - Unified utility for API response validation and conversion
 * Provides defensive validation and consistent error handling for all response types
 */

import { APIError } from '../utils/errors.js';

/**
 * Validate response content type matches expected type
 * @param {Response} response - Fetch API Response object
 * @param {string} expectedType - Expected content type (e.g., 'application/json', 'multipart/form-data')
 * @throws {APIError} If content type doesn't match or is missing
 */
export function validateContentType(response, expectedType) {
  const contentType = response.headers.get('Content-Type');

  if (!contentType) {
    throw new APIError(
      response.status,
      `Missing Content-Type header. Expected: ${expectedType}`
    );
  }

  if (!contentType.includes(expectedType)) {
    throw new APIError(
      response.status,
      `Invalid Content-Type. Expected: ${expectedType}, Got: ${contentType}`
    );
  }
}

/**
 * Convert response to JSON with validation and error handling
 * @param {Response} response - Fetch API Response object
 * @returns {Promise<Object>} Parsed JSON object
 * @throws {APIError} If content type is invalid or JSON parsing fails
 */
export async function toJSON(response) {
  validateContentType(response, 'application/json');

  try {
    return await response.json();
  } catch (error) {
    throw new APIError(
      response.status,
      `Failed to parse JSON response: ${error.message}`
    );
  }
}

/**
 * Convert response to Blob with validation and error handling
 * @param {Response} response - Fetch API Response object
 * @param {string} expectedType - Expected content type (e.g., 'audio/wav')
 * @returns {Promise<Blob>} Response as Blob
 * @throws {APIError} If content type is invalid or blob conversion fails
 */
export async function toBlob(response, expectedType = 'audio/wav') {
  validateContentType(response, expectedType);

  try {
    return await response.blob();
  } catch (error) {
    throw new APIError(
      response.status,
      `Failed to convert response to Blob: ${error.message}`
    );
  }
}

/**
 * Extract multipart boundary from Content-Type header
 * @param {Response} response - Fetch API Response object
 * @returns {string} Boundary string
 * @throws {APIError} If boundary is missing or invalid
 */
export function extractMultipartBoundary(response) {
  const contentType = response.headers.get('Content-Type');

  if (!contentType) {
    throw new APIError(
      response.status,
      'Missing Content-Type header for multipart response'
    );
  }

  const boundaryMatch = contentType.match(/boundary=([^;]+)/);

  if (!boundaryMatch || !boundaryMatch[1]) {
    throw new APIError(
      response.status,
      `No boundary found in Content-Type: ${contentType}`
    );
  }

  return boundaryMatch[1].trim();
}

/**
 * Validate response is valid multipart format
 * @param {Response} response - Fetch API Response object
 * @throws {APIError} If response is not valid multipart
 */
export function validateMultipartResponse(response) {
  validateContentType(response, 'multipart');
  extractMultipartBoundary(response); // Will throw if boundary missing
}
