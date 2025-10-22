/**
 * Background Service Worker / Event Page
 *
 * Entry point for background script that works on both:
 * - Chrome: Service Worker (manifest.background.service_worker)
 * - Firefox: Event Page (manifest.background.scripts)
 *
 * Handles all TTS API operations via message passing to bypass
 * mixed content restrictions in content scripts.
 */

import { MessageRouter } from './messages/MessageRouter.js';
import { PORT_NAMES } from './messages/protocol.js';
import { registerTTSHandlers, registerCacheHandlers } from './messages/handlers/index.js';

// Initialize message router
const router = new MessageRouter();

// Register all operation handlers
registerTTSHandlers(router);
registerCacheHandlers(router);

/**
 * Handle one-time messages (simple requests)
 * Used for: health check, get voices, get voice sample, non-streaming synthesis
 *
 * IMPORTANT: Listener registered at top level (MV3 requirement)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle message asynchronously
  router
    .handleMessage(message, sender)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      // Fallback error handling
      sendResponse({
        success: false,
        error: {
          type: 'UNKNOWN_ERROR',
          message: error.message,
        },
      });
    });

  // Return true to keep message channel open for async response
  // Required for both Chrome and Firefox
  return true;
});

/**
 * Handle long-lived connections (streaming requests)
 * Used for: streaming TTS synthesis with multipart response
 *
 * IMPORTANT: Listener registered at top level (MV3 requirement)
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_NAMES.TTS_STREAM) {
    handleStreamConnection(port);
  }
});

/**
 * Handle streaming TTS connection
 * @param {chrome.runtime.Port} port - Long-lived connection port
 */
async function handleStreamConnection(port) {
  // Import handler dynamically to avoid loading if not needed
  const { handleStreamRequest } = await import('./api/StreamHandler.js');

  // Set up message listener for this port
  port.onMessage.addListener(async (message) => {
    try {
      await handleStreamRequest(message, port);
    } catch (error) {
      // Send error to client
      port.postMessage({
        type: 'ERROR',
        error: {
          type: 'STREAM_ERROR',
          message: error.message,
        },
      });
      // Close port on error
      port.disconnect();
    }
  });

  // Handle port disconnection
  port.onDisconnect.addListener(() => {
    console.log('[Background] Stream port disconnected');
    // Cleanup happens automatically
  });
}

// Log initialization
console.log('[Background] Service worker initialized');
console.log(`[Background] ${router.getHandlerCount()} message handlers registered`);
