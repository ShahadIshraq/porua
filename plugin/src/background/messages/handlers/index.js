/**
 * Handler Registration
 *
 * Central location for registering all message handlers with the router.
 */

import { MESSAGE_TYPES } from '../protocol.js';
import { TTSHandlers } from './TTSHandlers.js';

/**
 * Register all TTS-related message handlers
 * @param {MessageRouter} router - Message router instance
 */
export function registerTTSHandlers(router) {
  const handlers = new TTSHandlers();

  // Register each handler
  router.registerHandler(
    MESSAGE_TYPES.TTS_CHECK_HEALTH,
    (payload, sender) => handlers.handleCheckHealth(payload, sender)
  );

  router.registerHandler(
    MESSAGE_TYPES.TTS_GET_VOICES,
    (payload, sender) => handlers.handleGetVoices(payload, sender)
  );

  router.registerHandler(
    MESSAGE_TYPES.TTS_FETCH_VOICE_SAMPLE,
    (payload, sender) => handlers.handleFetchVoiceSample(payload, sender)
  );

  router.registerHandler(
    MESSAGE_TYPES.TTS_SYNTHESIZE,
    (payload, sender) => handlers.handleSynthesize(payload, sender)
  );

  // Note: TTS_SYNTHESIZE_STREAM uses port-based communication
  // handled separately in service-worker.js
}
