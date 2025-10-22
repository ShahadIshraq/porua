# Background Script Migration Plan - Mixed Content Fix

## Executive Summary

**Problem:** The TTS plugin's stream endpoint fails when accessed from HTTPS pages due to mixed content blocking (HTTPS→HTTP requests blocked by browsers).

**Root Cause:** Content scripts make direct HTTP fetch() calls to the TTS server. Browsers block HTTP requests from HTTPS contexts for security.

**Solution:** Implement a background script that acts as a privileged proxy for all API calls. Background scripts can make HTTP requests regardless of page context.

**Cross-Browser Support:** Chrome (Service Worker) + Firefox (Event Page) with unified codebase.

---

## Browser Compatibility Strategy

### Firefox vs Chrome: Critical Differences

| Aspect | Chrome MV3 | Firefox MV3 | Our Solution |
|--------|-----------|-------------|--------------|
| **Background Type** | Service Worker only | Event Page (non-persistent script) | Dual manifest with both |
| **Manifest Key** | `background.service_worker` | `background.scripts` | Include both keys |
| **Browser Support** | Chrome 121+ ignores `.scripts` | Firefox 121+ ignores `.service_worker` | Works on both 121+ |
| **API Namespace** | `chrome.*` only | `browser.*` (Promises) + `chrome.*` (callbacks) | Use polyfill or chrome.* with Promise wrapper |
| **Message Return** | Callback-based | Promise-based | Return `true` + `sendResponse()` for both |
| **Lifecycle** | Terminate after idle | Non-persistent but different timing | Design for both lifecycles |

### Implementation Strategy: Write Once, Run Everywhere

**Approach**: Single codebase with cross-browser compatibility layer

1. **Use `chrome.*` namespace everywhere** (Firefox supports it too)
2. **Return `true` + use `sendResponse()`** (Works on both browsers)
3. **Dual manifest keys** for background script registration
4. **Test on both browsers** during development

### Manifest Configuration

**Chrome manifest.json**:
```json
{
  "background": {
    "service_worker": "dist/background.js"
  }
}
```

**Firefox manifest.firefox.json**:
```json
{
  "background": {
    "scripts": ["dist/background.js"]
  }
}
```

**Universal manifest (Chrome 121+ and Firefox 121+)**:
```json
{
  "background": {
    "service_worker": "dist/background.js",
    "scripts": ["dist/background.js"]
  }
}
```

**Decision**: Use universal manifest to reduce maintenance overhead.

### Code Compatibility Patterns

#### Message Listener (Works on Both)
```javascript
// ✅ Cross-browser compatible
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(result => sendResponse({ success: true, data: result }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // Keep channel open for async response (required for both)
});
```

#### Port-based Streaming (Works on Both)
```javascript
// ✅ Cross-browser compatible
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'tts-stream') {
    handleStreamConnection(port);
  }
});
```

#### Storage API (Works on Both)
```javascript
// ✅ Firefox supports chrome.storage with callbacks
chrome.storage.sync.get(['apiUrl'], (result) => {
  // Works on both browsers
});
```

### Testing Strategy

1. **Development**: Test on both browsers alternately
2. **CI/CD**: Run automated tests on both Chrome and Firefox
3. **Build**: Generate separate manifests if needed (or use universal)
4. **Release**: Package for both Chrome Web Store and Firefox Add-ons

### Known Edge Cases

1. **Import Statements**: Firefox Event Pages support ES6 modules, Chrome Service Workers require `importScripts()` or bundling
   - **Solution**: Use webpack to bundle everything

2. **DOM Access**: Neither can access DOM (same restriction)
   - **Solution**: Not an issue for our use case

3. **Worker Lifecycle**: Firefox Event Pages persist longer than Chrome Service Workers
   - **Solution**: Design for shortest lifecycle (Chrome's)

4. **Debugging**: Different DevTools experience
   - **Solution**: Document debugging for both browsers

---

## Current Architecture Assessment

### API Call Inventory

#### **Content Script Context** (Blocked on HTTPS pages ❌)
1. `content/index.js:120` - `ttsService.synthesizeStream(text)`
2. `content/prefetch/PrefetchManager.js:38` - `ttsService.synthesizeStream(text, {signal})`

#### **Popup Context** (Works - popup is extension page ✅)
3. `popup/SettingsForm.js:198` - `ttsService.checkHealth()`
4. `popup/VoiceSelector.js:104` - `ttsService.getVoices()`
5. `popup/VoiceSelector.js:379` - `ttsService.fetchVoiceSample(voiceId)`
6. `popup/SpeedControl.js:292` - `ttsService.synthesize(text, {voice, speed})`

### Current Data Flow

```
┌─────────────────┐
│  Content Script │──┐
│   (HTTPS page)  │  │
└─────────────────┘  │
                     │ Direct fetch() ❌
                     │ (Mixed Content Block)
┌─────────────────┐  │
│  Popup Script   │──┤
│ (Extension ctx) │  │
└─────────────────┘  │
                     ↓
            ┌────────────────┐         ┌──────────────┐
            │  TTSService    │────────>│  HTTP Server │
            │ (shared/...)   │ HTTP    │  (192.168.x) │
            └────────────────┘         └──────────────┘
```

### Key Components

1. **TTSService** (`shared/services/TTSService.js`)
   - Singleton service managing TTSClient instances
   - Handles settings changes and client re-initialization
   - Provides: `synthesizeStream()`, `synthesize()`, `checkHealth()`, `getVoices()`, `fetchVoiceSample()`

2. **TTSClient** (`shared/api/TTSClient.js`)
   - Low-level HTTP client
   - Handles authentication headers
   - Wraps native fetch() API

3. **MultipartStreamHandler** (`shared/api/MultipartStreamHandler.js`)
   - Parses streaming multipart responses
   - Extracts audio blobs and metadata
   - Used by content script after fetch

4. **SettingsStore** (`shared/storage/SettingsStore.js`)
   - Manages chrome.storage API
   - Stores: apiUrl, apiKey (encrypted), voice, speed
   - Used by all contexts

---

## Target Architecture (Clean Design)

### Architectural Principles

1. **Single Responsibility**: Each layer has one clear purpose
2. **No Duplication**: Unified message protocol for all contexts
3. **Future-Proof**: Designed for Manifest V3 service worker lifecycle
4. **Security First**: API keys only in background, never in content scripts
5. **Type Safety**: Strong message contracts with validation

### New Data Flow

```
┌─────────────────┐                  ┌──────────────────────┐
│  Content Script │───────────┐      │  Service Worker      │
│   (HTTPS page)  │ Messages  │      │  (Privileged Context)│
└─────────────────┘           │      └──────────────────────┘
                              │                 │
┌─────────────────┐           │                 │
│  Popup Script   │───────────┤                 │
│ (Extension ctx) │ Messages  │                 │
└─────────────────┘           │                 │
                              │                 │
                              ↓                 ↓
                    ┌───────────────────────────────┐
                    │   Background Message Router   │
                    │  (chrome.runtime.onMessage)   │
                    └───────────────────────────────┘
                                     │
                                     ↓
                            ┌─────────────────┐
                            │  TTSService     │
                            │  (Background)   │
                            └─────────────────┘
                                     │
                                     ↓ HTTP (Allowed)
                            ┌─────────────────┐
                            │   TTS Server    │
                            │  (192.168.x.x)  │
                            └─────────────────┘
```

### Layer Breakdown

#### **Layer 1: Service Worker (NEW)**
- **File**: `plugin/src/background/service-worker.js`
- **Responsibilities**:
  - Register message listeners at top level (MV3 requirement)
  - Route messages to appropriate handlers
  - Manage TTSService instance lifecycle
  - Handle streaming responses and forward to requestor

#### **Layer 2: Message Protocol (NEW)**
- **File**: `plugin/src/background/messages/protocol.js`
- **Purpose**: Define strict message contracts
- **Messages**:
  ```javascript
  {
    type: 'TTS_SYNTHESIZE_STREAM',
    payload: { text: string, voice?: string, speed?: number }
  }

  {
    type: 'TTS_SYNTHESIZE',
    payload: { text: string, voice?: string, speed?: number }
  }

  {
    type: 'TTS_GET_VOICES',
    payload: null
  }

  {
    type: 'TTS_CHECK_HEALTH',
    payload: null
  }

  {
    type: 'TTS_FETCH_VOICE_SAMPLE',
    payload: { voiceId: string }
  }
  ```

#### **Layer 3: API Proxy (NEW)**
- **File**: `plugin/src/background/api/APIProxy.js`
- **Purpose**: Handle all TTS API operations in background
- **Methods**: Mirror TTSService but run in service worker context

#### **Layer 4: Stream Handler (NEW)**
- **File**: `plugin/src/background/api/StreamHandler.js`
- **Purpose**: Convert streaming responses to transferable format
- **Approach**:
  - Read stream chunks
  - Parse multipart boundaries
  - Convert to serializable objects (ArrayBuffer)
  - Return structured data

#### **Layer 5: Client Abstraction (NEW)**
- **File**: `plugin/src/shared/api/BackgroundTTSClient.js`
- **Purpose**: Provide same interface as TTSService but use messages
- **Usage**: Drop-in replacement for `ttsService` in content scripts

#### **Layer 6: Keep Existing (Popup)**
- **Files**: Popup scripts keep using TTSService directly
- **Reason**: Popup is privileged context, no mixed content issues
- **Optimization**: Popup could optionally use background for consistency

---

## Message Passing Strategy

### Approach Selection: Hybrid

Based on research findings:

1. **For Simple Operations** (health, voices, voice samples):
   - Use `chrome.runtime.sendMessage()` (one-time messages)
   - Clean request/response pattern
   - Automatic service worker wakeup

2. **For Streaming Operations** (synthesizeStream):
   - Use `chrome.runtime.connect()` (long-lived port)
   - Keep service worker alive during stream
   - Allow chunked data transfer
   - Close port when stream completes

### Why Hybrid?

- **Efficiency**: Don't keep worker alive for simple requests
- **Reliability**: Long-lived connections for streams prevent worker shutdown mid-stream
- **Best Practices**: Aligns with Chrome recommendations
- **Memory**: Cleanup ports after use to prevent leaks

### Service Worker Lifecycle Management

```javascript
// Top-level registration (MV3 requirement)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

// Long-lived connection for streams
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'tts-stream') {
    handleStreamConnection(port);
  }
});
```

---

## Implementation Phases

### Phase 1: Background Infrastructure ✅
**Goal**: Create service worker foundation

**Files to Create**:
1. `plugin/src/background/service-worker.js` - Main entry point
2. `plugin/src/background/messages/protocol.js` - Message type definitions
3. `plugin/src/background/messages/MessageRouter.js` - Route messages to handlers
4. `plugin/src/background/messages/handlers/index.js` - Handler exports

**Manifest Changes (Both Chrome and Firefox)**:
```json
{
  "background": {
    "service_worker": "dist/background.js",
    "scripts": ["dist/background.js"]
  }
}
```

**Note**: Chrome 121+ ignores `scripts`, Firefox 121+ ignores `service_worker`. Both keys allow universal compatibility.

### Phase 2: API Proxy Layer ✅
**Goal**: Implement background API operations

**Files to Create**:
1. `plugin/src/background/api/APIProxy.js` - Main proxy class
2. `plugin/src/background/api/StreamHandler.js` - Stream processing
3. `plugin/src/background/messages/handlers/TTSHandlers.js` - TTS message handlers

**Key Challenges**:
- **Stream Serialization**: Convert Response.body streams to ArrayBuffer
- **Metadata Preservation**: Keep chunk metadata intact
- **Error Propagation**: Pass errors back to caller with context

### Phase 3: Client Abstraction ✅
**Goal**: Create drop-in replacement for content scripts

**Files to Create**:
1. `plugin/src/shared/api/BackgroundTTSClient.js` - Message-based client
2. `plugin/src/shared/api/StreamMessageHandler.js` - Port-based streaming

**Interface**:
```javascript
export class BackgroundTTSClient {
  async synthesizeStream(text, options) {
    // Use port for streaming
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'tts-stream' });
      // ... handle stream chunks via port
    });
  }

  async synthesize(text, options) {
    // Use sendMessage for simple request
    return chrome.runtime.sendMessage({
      type: 'TTS_SYNTHESIZE',
      payload: { text, ...options }
    });
  }

  // ... other methods
}
```

### Phase 4: Content Script Migration ✅
**Goal**: Replace TTSService with BackgroundTTSClient

**Files to Modify**:
1. `plugin/src/content/index.js` - Replace ttsService import
2. `plugin/src/content/prefetch/PrefetchManager.js` - Replace ttsService import

**Changes**:
```javascript
// BEFORE
import { ttsService } from '../shared/services/TTSService.js';
const response = await ttsService.synthesizeStream(text);

// AFTER
import { backgroundTTSClient } from '../shared/api/BackgroundTTSClient.js';
const response = await backgroundTTSClient.synthesizeStream(text);
```

**Testing Strategy**:
- Test on localhost (should still work)
- Test on HTTPS page (should now work!)
- Test prefetching with abort signals
- Test error handling

### Phase 5: Cleanup & Optimization ✅
**Goal**: Remove unused code, optimize

**Actions**:
1. Keep TTSService for popup (no changes needed)
2. Remove TTSClient direct usage from content scripts
3. Add comprehensive error handling
4. Add logging/debugging aids
5. Document architecture in README

---

## Data Serialization Strategy

### Challenge: Streaming Binary Data

**Problem**: `chrome.runtime.sendMessage()` only supports JSON-serializable data. Binary audio data (Blob) is not serializable.

**Solution Options**:

#### Option A: ArrayBuffer Transfer ✅ **RECOMMENDED**
```javascript
// Background: Convert Blob → ArrayBuffer
const arrayBuffer = await blob.arrayBuffer();
sendResponse({ audioData: arrayBuffer });

// Content: Convert ArrayBuffer → Blob
const blob = new Blob([response.audioData], { type: 'audio/wav' });
```

**Pros**:
- Native support in structured clone algorithm
- Efficient memory transfer
- Preserves binary data integrity

**Cons**:
- Slightly more conversion code
- Need to track content type separately

#### Option B: Base64 Encoding ❌ **NOT RECOMMENDED**
```javascript
// 33% size overhead, slow encode/decode
const base64 = await blobToBase64(blob);
```

**Decision**: Use ArrayBuffer transfer for all binary data.

### Metadata Handling

**Approach**: Send metadata alongside binary data

```javascript
{
  type: 'TTS_STREAM_CHUNK',
  data: {
    audioData: ArrayBuffer,
    metadata: {
      chunk_index: number,
      duration_ms: number,
      // ... rest of metadata
    }
  }
}
```

---

## Error Handling Design

### Error Propagation Chain

```
Content Script
    ↓ (sendMessage)
Service Worker
    ↓ (try/catch)
TTSService
    ↓ (HTTP fetch)
TTS Server
    ↓ (error)
TTSService (catch)
    ↓ (structured error)
Service Worker (catch)
    ↓ (sendResponse with error)
Content Script (throw)
    ↓
UI Error Display
```

### Error Message Format

```javascript
{
  success: false,
  error: {
    type: 'API_ERROR' | 'NETWORK_ERROR' | 'VALIDATION_ERROR',
    message: string,
    status?: number,
    details?: any
  }
}
```

### Retry Strategy

- **Network Errors**: Let caller decide (content script may retry)
- **Auth Errors (401/403)**: No retry, prompt user to update API key
- **Server Errors (5xx)**: No auto-retry, log for debugging
- **Timeout**: Implement in service worker, configurable per operation

---

## Testing Strategy

### Unit Tests

**New test files**:
1. `plugin/tests/background/MessageRouter.test.js`
2. `plugin/tests/background/APIProxy.test.js`
3. `plugin/tests/shared/BackgroundTTSClient.test.js`

**Test scenarios**:
- Message routing to correct handlers
- Stream chunk serialization/deserialization
- Error propagation through layers
- Port lifecycle management

### Integration Tests

**Test scenarios**:
1. **Localhost (HTTP)**: Verify no regression
2. **HTTPS Page**: Verify mixed content fix works
3. **Prefetch with abort**: Verify signal propagation
4. **Multiple concurrent requests**: Verify service worker handles load
5. **Service worker restart**: Verify message handlers re-register

### Manual Testing Checklist

#### Chrome Testing
- [ ] Play paragraph on HTTP page
- [ ] Play paragraph on HTTPS page (Wikipedia, Medium, etc.)
- [ ] Test continuous playback across multiple paragraphs
- [ ] Test prefetching during playback
- [ ] Test voice selection in popup
- [ ] Test speed control in popup
- [ ] Test API key authentication
- [ ] Test network error handling
- [ ] Test server timeout scenarios
- [ ] Verify service worker doesn't crash
- [ ] Verify service worker auto-restarts after idle

#### Firefox Testing
- [ ] Play paragraph on HTTP page (Firefox)
- [ ] Play paragraph on HTTPS page (Firefox)
- [ ] Test continuous playback (Firefox)
- [ ] Test prefetching during playback (Firefox)
- [ ] Test voice selection in popup (Firefox)
- [ ] Test speed control in popup (Firefox)
- [ ] Test API key authentication (Firefox)
- [ ] Test network error handling (Firefox)
- [ ] Verify event page lifecycle
- [ ] Test with strict tracking protection enabled

#### Cross-Browser Edge Cases
- [ ] Rapid page navigation (worker/event page cleanup)
- [ ] Extension reload during active playback
- [ ] Multiple tabs playing simultaneously
- [ ] Long-running stream (30+ seconds)
- [ ] Network disconnect/reconnect during stream

---

## Migration Checklist

### Pre-Migration
- [ ] Create feature branch: `feature/background-script-proxy`
- [ ] Document current behavior with screenshots
- [ ] Backup current working build
- [ ] Set up test environment with HTTPS page

### Implementation
- [ ] Phase 1: Background infrastructure (2-3 hours)
- [ ] Phase 2: API Proxy layer (3-4 hours)
- [ ] Phase 3: Client abstraction (2-3 hours)
- [ ] Phase 4: Content script migration (1-2 hours)
- [ ] Phase 5: Cleanup & optimization (2 hours)

### Post-Migration
- [ ] Run all unit tests
- [ ] Run integration tests
- [ ] Manual testing on 5+ HTTPS sites
- [ ] Performance comparison (measure latency)
- [ ] Update README with architecture diagrams
- [ ] Update plugin/README.md with new architecture
- [ ] Create PR with detailed description

---

## Performance Considerations

### Latency Analysis

**Current (Direct fetch from content script)**:
```
Content Script → HTTP Server → Content Script
Latency: ~50-200ms (network only)
```

**New (Via background script)**:
```
Content Script → Background → HTTP Server → Background → Content Script
Latency: ~50-200ms (network) + ~5-10ms (message passing) + ~10-20ms (serialization)
Total: ~65-230ms
```

**Impact**: +15-30ms overhead (acceptable for UX)

### Optimization Strategies

1. **Minimize Serialization**: Use ArrayBuffer directly, avoid extra conversions
2. **Stream Early**: Send first chunk ASAP, don't wait for full response
3. **Keep Worker Alive**: Use port for streaming to prevent worker shutdown
4. **Batch Metadata**: Send metadata with audio, don't send separately

### Memory Management

1. **Cleanup Ports**: Close ports after stream complete
2. **Release Buffers**: Don't hold references to large ArrayBuffers
3. **Cache Strategy**: Keep prefetch cache in content script, not background

---

## Backward Compatibility

**Policy**: **No backward compatibility needed**

**Rationale**:
- Fresh implementation with no legacy users depending on internals
- Clean architecture more valuable than gradual migration
- All changes internal to plugin, no API changes

**Migration Path for Popup**:
- Keep using TTSService (works fine in popup context)
- Optional: Migrate popup to use BackgroundTTSClient for consistency
- Decision: Keep popup as-is to minimize changes

---

## Security Improvements

### Before (Current)
- API keys in content script context (exposed to page via extension APIs)
- HTTP requests from content script (can be intercepted)

### After (Background Script)
- API keys only in service worker (not accessible from page)
- HTTP requests from privileged service worker
- Content scripts only receive processed data

**Result**: Improved security posture even beyond fixing mixed content issue.

---

## File Structure

### New Files
```
plugin/src/
├── background/
│   ├── service-worker.js              # Main entry point
│   ├── api/
│   │   ├── APIProxy.js                # TTS API operations
│   │   └── StreamHandler.js           # Stream processing
│   └── messages/
│       ├── protocol.js                # Message type definitions
│       ├── MessageRouter.js           # Route messages to handlers
│       └── handlers/
│           ├── index.js               # Export all handlers
│           └── TTSHandlers.js         # TTS operation handlers
│
├── shared/
│   └── api/
│       ├── BackgroundTTSClient.js     # Message-based client
│       └── StreamMessageHandler.js    # Port-based streaming
│
└── build/
    └── background.js                  # Webpack output
```

### Modified Files
```
plugin/
├── manifest.json                      # Add background.service_worker + scripts
├── manifest.firefox.json              # Add background.scripts
├── webpack.config.js                  # Add background entry point
├── src/
│   └── content/
│       ├── index.js                   # Use BackgroundTTSClient
│       └── prefetch/
│           └── PrefetchManager.js     # Use BackgroundTTSClient
```

### Unchanged Files (Keep Using TTSService)
```
plugin/src/popup/
├── SettingsForm.js
├── VoiceSelector.js
└── SpeedControl.js
```

---

## Success Criteria

### Functional
- ✅ Content scripts can fetch from HTTP server on HTTPS pages
- ✅ All existing features work (play, prefetch, voice selection, etc.)
- ✅ No console errors or warnings
- ✅ Error messages displayed correctly to user

### Non-Functional
- ✅ Latency increase < 30ms average
- ✅ No memory leaks during extended use
- ✅ Service worker restarts handled gracefully
- ✅ Code coverage > 80% for new modules

### Quality
- ✅ Clean separation of concerns
- ✅ No code duplication
- ✅ Well-documented architecture
- ✅ Type-safe message protocol

---

## Rollout Plan

### Phase 1: Development (5-7 days)
- Implement all phases
- Unit and integration testing
- Local HTTPS testing
- **Cross-browser testing on Chrome AND Firefox**

### Phase 2: Testing (2-3 days)
- Test on production HTTPS sites (both browsers)
- Performance testing (both browsers)
- Edge case testing (both browsers)
- Test with different Firefox tracking protection levels

### Phase 3: Release (1 day)
- Create release build for Chrome
- Create release build for Firefox (separate manifest)
- Update version in both manifests
- Tag release in git
- Deploy to Chrome Web Store
- Deploy to Firefox Add-ons (AMO)

### Build Process

**Current build system**: Uses esbuild via `build/bundle.js`

**Required Changes**:
1. Update `build/bundle.js` to add background entry point
2. Update packaging scripts to handle both manifests
3. Ensure cross-browser compatible bundle

```bash
# Development (with watch)
npm run dev

# Production build
npm run build

# Package for Chrome
npm run package:chrome

# Package for Firefox
npm run package:firefox

# Full release (both browsers)
npm run release
```

**Build Configuration Changes Needed**:
- Add `src/background/service-worker.js` as entry point
- Configure to output `dist/background.js`
- Ensure ES modules are bundled for Chrome compatibility
- Keep manifest.json for Chrome, manifest.firefox.json for Firefox

---

## Future Enhancements

### Potential Optimizations
1. **Request Deduplication**: If same text requested multiple times, dedupe in background
2. **Background Cache**: Move prefetch cache to service worker for shared access
3. **Offline Support**: Cache common phrases for offline playback
4. **Compression**: Compress audio data before transfer (if latency becomes issue)

### Architectural Evolution
1. **Background as Single Source of Truth**: Move all state to service worker
2. **Unified Client**: Make popup also use BackgroundTTSClient
3. **WebSocket Support**: If server adds WebSocket, use for streaming

---

## Conclusion

This migration transforms the plugin architecture to properly handle mixed content restrictions while improving security and maintainability. The clean layer separation ensures future changes are isolated and testable.

**Total Estimated Effort**: 12-16 hours development + 2-3 hours testing = ~20 hours

**Risk Level**: Medium (new architecture, but well-researched and planned)

**Benefits**:
- ✅ Fixes mixed content blocking (primary goal)
- ✅ Improves security (API keys in background only)
- ✅ Better architecture (clean separation of concerns)
- ✅ Future-proof (ready for MV3 service worker lifecycle)
- ✅ No code duplication (unified message protocol)

**Next Step**: Proceed with Phase 1 implementation after approval.

---

## Firefox-Specific Considerations Summary

### What's Different
1. **Event Page vs Service Worker**: Firefox uses non-persistent background scripts, not service workers
2. **Lifecycle**: Event page persists longer than Chrome's aggressive service worker termination
3. **API Support**: Both `chrome.*` and `browser.*` namespaces work
4. **Promise Support**: Firefox natively returns Promises from messaging APIs

### What's The Same
1. **Message Passing**: `chrome.runtime.sendMessage()` and `chrome.runtime.connect()` work identically
2. **Mixed Content**: Both browsers block HTTP from HTTPS in content scripts
3. **Background Bypass**: Both allow background scripts to make HTTP requests
4. **Storage API**: `chrome.storage` works the same way

### Why Our Plan Works for Both
1. **Single codebase**: Using `chrome.*` namespace + callbacks works on both
2. **Universal manifest**: Both `service_worker` and `scripts` keys in manifest
3. **Same architecture**: Message routing, API proxy, stream handling all identical
4. **Same testing**: Same test suite runs on both browsers

### Build Output
- **Chrome**: Uses `manifest.json` with `service_worker` key (ignores `scripts`)
- **Firefox**: Uses `manifest.firefox.json` with `scripts` key (ignores `service_worker`)
- **Or**: Single universal manifest works on both (Chrome 121+, Firefox 121+)

**Recommendation**: Use universal manifest for simplicity, separate manifests if targeting older browsers.
