# Firefox Compatibility - Quick Reference

## TL;DR: Single Codebase Works for Both Browsers ✅

Our implementation strategy uses **cross-browser compatible patterns** that work identically on Chrome and Firefox.

---

## Key Compatibility Points

### 1. Background Script Type

| Browser | Type | Manifest Key |
|---------|------|--------------|
| Chrome | Service Worker | `background.service_worker` |
| Firefox | Event Page (non-persistent) | `background.scripts` |
| **Solution** | **Include both keys** | Chrome 121+ and Firefox 121+ support universal manifest |

```json
{
  "background": {
    "service_worker": "dist/background.js",
    "scripts": ["dist/background.js"]
  }
}
```

### 2. API Namespace

| Browser | Supported Namespaces |
|---------|---------------------|
| Chrome | `chrome.*` only |
| Firefox | `chrome.*` (callbacks) + `browser.*` (promises) |
| **Solution** | **Use `chrome.*` everywhere** (works on both) |

### 3. Message Passing

**Pattern that works on BOTH browsers:**

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(result => sendResponse({ success: true, data: result }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // CRITICAL: Keep channel open for async (both need this)
});
```

### 4. Port-based Streaming

**Identical on both browsers:**

```javascript
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'tts-stream') {
    handleStreamConnection(port);
  }
});
```

---

## What We Need to Test

### Chrome-Specific
- Service worker aggressive termination (idle timeout)
- Service worker auto-restart on message

### Firefox-Specific
- Event page lifecycle (longer persistence)
- Tracking protection interactions
- `about:debugging` for background page inspection

### Both
- Message passing reliability
- Stream handling
- Error propagation
- Performance (latency)

---

## Build Strategy

### Option A: Universal Manifest (Recommended)
**One manifest for both browsers**

**Pros:**
- Single source of truth
- Less maintenance
- Works on Chrome 121+, Firefox 121+

**Cons:**
- Doesn't support older browser versions

### Option B: Separate Manifests
**Keep `manifest.json` and `manifest.firefox.json` separate**

**Pros:**
- Full control per browser
- Can target older versions
- Browser-specific optimizations possible

**Cons:**
- Need to sync changes between two files
- More build complexity

**Decision**: Start with **Option A** (universal manifest), fall back to Option B only if needed.

---

## Implementation Impact

### Files with NO Changes Needed
All code is already cross-browser compatible:
- Message listeners
- Port handling
- Storage API usage
- Fetch API calls

### Files Requiring Manifest Update
- `manifest.json` - Add `background.scripts` alongside `background.service_worker`
- OR keep separate `manifest.firefox.json` with just `background.scripts`

### Build System Updates
- Add background script entry point to esbuild
- Update packaging to handle manifest selection
- Ensure bundled code works in both environments

---

## Why This Works

### Firefox Supports Chrome APIs
Firefox implements the **WebExtensions API** which is based on Chrome's extension API. The `chrome.*` namespace works in Firefox for compatibility.

### Same Restrictions Apply
Both browsers:
- Block mixed content in content scripts ❌
- Allow background scripts to bypass mixed content ✅
- Support message passing with same patterns ✅
- Use structured clone for message serialization ✅

### Our Architecture is Browser-Agnostic
We're not using any browser-specific features:
- Standard message passing
- Standard fetch() API
- Standard Blob/ArrayBuffer handling
- Standard chrome.storage API

---

## Testing Checklist

- [ ] Load extension in Chrome
- [ ] Load extension in Firefox
- [ ] Test on HTTPS page (Chrome)
- [ ] Test on HTTPS page (Firefox)
- [ ] Verify message passing (Chrome)
- [ ] Verify message passing (Firefox)
- [ ] Check DevTools console (both browsers)
- [ ] Inspect background script (chrome://extensions vs about:debugging)
- [ ] Test with Firefox strict tracking protection
- [ ] Performance comparison between browsers

---

## Debug Tools

### Chrome
```
chrome://extensions
→ Enable "Developer mode"
→ Click "Inspect views: service worker"
```

### Firefox
```
about:debugging#/runtime/this-firefox
→ Find extension
→ Click "Inspect" on background page
```

---

## Common Pitfalls (Avoided)

❌ **Using `browser.*` namespace** - Chrome doesn't support it
✅ **Solution**: Use `chrome.*` everywhere

❌ **Relying on Promises from messaging API** - Chrome uses callbacks
✅ **Solution**: Use `sendResponse()` callback pattern

❌ **Expecting same lifecycle timing** - Firefox event pages persist longer
✅ **Solution**: Design for shortest lifecycle (Chrome's)

❌ **Using service worker specific APIs** - Firefox uses event pages
✅ **Solution**: Stick to common extension APIs

---

## Conclusion

**Our implementation is naturally cross-browser compatible** because:

1. We use standard WebExtensions APIs
2. We follow callback patterns (not Promise-only)
3. We include both manifest keys
4. We design for most restrictive environment (Chrome service worker)

**No polyfills needed. No browser detection needed. Just works.** ✅
