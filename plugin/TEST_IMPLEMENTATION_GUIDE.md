# Test Implementation Guide

Complete guide for implementing tests to reach 80%+ coverage.

## File-by-File Implementation Plan

### 1. Logger.js - PRIORITY 1 - EASY

**Location:** `/src/shared/utils/logger.js`  
**Lines:** 22  
**Difficulty:** EASY  
**Estimated time:** 30 minutes

**What to test:**
- Static methods: error(), warn(), info(), debug()
- Level filtering (currentLevel logic)
- Console output capture

**Implementation notes:**
- Use `vi.spyOn()` to capture console methods
- Test level thresholds (ERROR=0, WARN=1, INFO=2, DEBUG=3)
- Verify message formatting with context

**Test structure:**
```javascript
describe('Logger', () => {
  describe('error()', () => { /* always logs */ })
  describe('warn()', () => { /* logs if level >= WARN */ })
  describe('info()', () => { /* logs if level >= INFO */ })
  describe('debug()', () => { /* logs if level >= DEBUG */ })
  describe('level filtering', () => { /* test currentLevel */ })
})
```

---

### 2. SkipControl.js - PRIORITY 1 - EASY

**Location:** `/src/popup/SkipControl.js`  
**Lines:** 119  
**Difficulty:** EASY  
**Estimated time:** 1-2 hours

**What to test:**
- Constructor initialization
- init() with default/custom values
- render() creates UI correctly
- Button click handlers
- setSkipInterval() updates state and calls callback
- getSkipInterval() returns current value
- updatePresetButtons() updates active state
- onChange() callback registration
- cleanup()

**Implementation notes:**
- Create mock container div
- Trigger click events on buttons
- Verify DOM attributes (aria-pressed, classes)
- Similar pattern to SettingsForm.test.js

**Test structure:**
```javascript
describe('SkipControl', () => {
  describe('constructor', () => { /* initialization */ })
  describe('init()', () => { /* rendering and setup */ })
  describe('render()', () => { /* UI generation */ })
  describe('setupEventListeners()', () => { /* click handlers */ })
  describe('setSkipInterval()', () => { /* state update */ })
  describe('getSkipInterval()', () => { /* getter */ })
  describe('updatePresetButtons()', () => { /* active state */ })
  describe('onChange()', () => { /* callback */ })
  describe('cleanup()', () => { /* cleanup */ })
})
```

---

### 3. AudioCacheManager.js - PRIORITY 2 - MEDIUM

**Location:** `/src/shared/cache/AudioCacheManager.js`  
**Lines:** 142 (81 uncovered)  
**Difficulty:** MEDIUM  
**Estimated time:** 1.5-2 hours

**Dependencies:** LRUCache (100% tested), PersistentCache (0% tested)

**What to test:**
- Constructor initialization
- get() - hot cache hit
- get() - warm cache hit (and promotion)
- get() - cache miss
- set() - stores in both layers
- set() - handles cache full errors
- has() - checks both caches
- invalidate() - version change clears all
- invalidate() - selective invalidation
- getStats() - returns correct data
- calculateSize() - sums blob sizes
- clearAll() - resets all caches
- shutdown() - stops cleanup

**Implementation notes:**
- Mock PersistentCache similarly to AudioCacheManager.js tests
- Test multilayer cache behavior
- Verify cache statistics

**Test structure:**
```javascript
describe('AudioCacheManager', () => {
  describe('constructor', () => { /* initialization */ })
  describe('get()', () => {
    it('returns from hot cache', () => {})
    it('returns from warm cache and promotes', () => {})
    it('returns null on miss', () => {})
  })
  describe('set()', () => { /* storage in both layers */ })
  describe('has()', () => { /* existence check */ })
  describe('invalidate()', () => { /* eviction */ })
  describe('statistics', () => { /* stats/size */ })
  describe('clearAll()', () => { /* reset */ })
})
```

---

### 4. PersistentCache.js - PRIORITY 2 - MEDIUM

**Location:** `/src/shared/cache/PersistentCache.js`  
**Lines:** 273 (179 uncovered)  
**Difficulty:** MEDIUM  
**Estimated time:** 2-3 hours

**Dependencies:** idb (IndexedDB)

**What to test:**
- init() - initializes IndexedDB
- get() - retrieves and updates lastAccess
- set() - stores entry with metadata
- set() - enforces size limits
- has() - checks existence
- delete() - removes entry
- deleteMatching() - predicate-based deletion
- evictLRU() - removes least recently used
- clear() - wipes all
- size() - returns count
- getQuotaInfo() - estimates quota
- getAllEntries() - debug retrieval
- calculateTotalSize() - sums all entries
- startPeriodicCleanup() - background cleanup
- stopPeriodicCleanup() - stops cleanup
- removeStaleEntries() - time-based eviction
- enforceSizeLimit() - evicts for space

**Implementation notes:**
- Mock idb same as AudioPlayer.test.js pattern
- Test IndexedDB lifecycle (init, transaction, etc.)
- Verify metadata tracking
- Test size enforcement

**Test structure:**
```javascript
describe('PersistentCache', () => {
  describe('initialization', () => { /* init() */ })
  describe('CRUD operations', () => {
    describe('get()', () => { /* retrieval */ })
    describe('set()', () => { /* storage */ })
    describe('delete()', () => { /* deletion */ })
  })
  describe('eviction', () => {
    describe('evictLRU()', () => { /* LRU */ })
    describe('removeStaleEntries()', () => { /* time-based */ })
    describe('enforceSizeLimit()', () => { /* size limit */ })
  })
  describe('utilities', () => { /* size, quota, etc */ })
})
```

---

### 5. WarmCache.js - PRIORITY 2 - MEDIUM

**Location:** `/src/content/audio/WarmCache.js`  
**Lines:** 217 (112 uncovered)  
**Difficulty:** MEDIUM  
**Estimated time:** 1.5-2 hours

**What to test:**
- Constructor initialization
- init() - IndexedDB setup
- get() - retrieves blob and updates access time
- set() - stores chunk with metadata
- delete() - removes chunk
- has() - checks chunk existence
- shouldEvict() - checks if over limit
- selectEvictionCandidates() - selects LRU chunks
- evictToSize() - evicts to target size
- calculateSize() - sums chunk sizes
- getCurrentSize() - returns current size
- clear() - wipes cache
- getStats() - returns statistics

**Implementation notes:**
- Mock ChunkId class
- Mock idb library
- Test LRU selection
- Verify eviction process

**Test structure:**
```javascript
describe('WarmCache', () => {
  describe('initialization', () => { /* init() */ })
  describe('CRUD operations', () => {
    describe('get()', () => { /* retrieval */ })
    describe('set()', () => { /* storage */ })
    describe('delete()', () => { /* deletion */ })
  })
  describe('eviction strategy', () => {
    describe('selectEvictionCandidates()', () => { /* LRU */ })
    describe('evictToSize()', () => { /* size-based */ })
  })
  describe('size management', () => { /* size tracking */ })
  describe('statistics', () => { /* stats */ })
})
```

---

### 6. AudioPlayer.js - PRIORITY 3 - EXPAND EXISTING

**Location:** `/src/content/audio/AudioPlayer.js`  
**Current test file:** `/tests/unit/content/audio/AudioPlayer.test.js`  
**Lines:** 312 (103 uncovered)  
**Difficulty:** MEDIUM  
**Estimated time:** 1-2 hours

**What's missing:**
- More edge cases in playChunk() error handling
- playNextChunk() exhaustion scenarios
- Tier management during playback
- Cross-chunk seeking edge cases
- Progress calculation accuracy
- Audio event error paths
- URL revocation timing

**Expand tests with:**
```javascript
describe('AudioPlayer - Enhanced', () => {
  describe('playChunk error paths', () => {
    it('handles blob unavailable', () => {})
    it('handles metadata missing', () => {})
  })
  describe('playNextChunk edge cases', () => {
    it('handles end of queue', () => {})
  })
  describe('audio events', () => {
    it('handles audio onerror', () => {})
    it('handles playback errors', () => {})
  })
  describe('tier management', () => {
    it('triggers manageTiers on playback', () => {})
  })
  describe('seek edge cases', () => {
    it('clamps negative seeks', () => {})
    it('clamps seeks beyond duration', () => {})
  })
})
```

---

### 7. AudioRegistry.js - PRIORITY 3 - EXPAND EXISTING

**Location:** `/src/content/audio/AudioRegistry.js`  
**Current test file:** `/tests/unit/content/audio/AudioRegistry.test.js`  
**Lines:** 311 (83 uncovered)  
**Difficulty:** MEDIUM  
**Estimated time:** 1-2 hours

**What's missing:**
- getChunk() tier promotion paths
- reconstructFromCold() scenarios
- manageTiers() eviction logic
- prefetchChunks() error handling
- Complex multi-paragraph scenarios
- Cache tier transitions

**Expand tests with:**
```javascript
describe('AudioRegistry - Enhanced', () => {
  describe('getChunk tier promotion', () => {
    it('promotes from warm to hot', () => {})
    it('reconstructs from cold', () => {})
  })
  describe('tier management', () => {
    it('evicts from hot to warm', () => {})
    it('evicts from warm', () => {})
  })
  describe('prefetching', () => {
    it('handles prefetch errors', () => {})
  })
  describe('multi-paragraph operations', () => {
    it('handles multiple paragraphs', () => {})
  })
})
```

---

### 8. PlaybackSessionManager.js - PRIORITY 3 - HARD

**Location:** `/src/content/controllers/PlaybackSessionManager.js`  
**Lines:** 309  
**Difficulty:** HARD  
**Estimated time:** 4-6 hours

**Dependencies:** AudioRegistry, AudioPlayer, HighlightManager, TTSService, SettingsStore, Logger

**What to test:**
- Constructor initialization
- playContinuous() - setup and first paragraph load
- loadAndPlayParagraph() - loads specific paragraph
- prefetchParagraphs() - background prefetch
- prefetchNextChunks() - intelligent prefetch
- handleAudioQueueEmpty() - next paragraph transition
- transitionToNext() - paragraph transitions
- handleQueueComplete() - end of playback
- seek() - forward/backward seeking
- pause() - pause playback
- resume() - resume playback
- stop() - stop and cleanup
- clear() - full reset
- onQueueComplete() - callback registration
- setOnProgress() - progress tracking
- getStats() - session statistics

**Implementation notes:**
- Mock all dependencies heavily
- Async testing with proper await/resolve
- Test error paths and retry logic
- Verify highlight manager integration

**Test structure:**
```javascript
describe('PlaybackSessionManager', () => {
  describe('initialization', () => { /* constructor */ })
  describe('playContinuous()', () => {
    it('sets up paragraphs and starts playback', () => {})
    it('prefetches next paragraphs', () => {})
  })
  describe('loadAndPlayParagraph()', () => {
    it('loads paragraph and registers chunks', () => {})
    it('wraps phrases for highlighting', () => {})
    it('handles synthesis errors', () => {})
  })
  describe('prefetching strategy', () => {
    it('prefetches next paragraphs', () => {})
    it('handles prefetch errors gracefully', () => {})
  })
  describe('transitions and continuity', () => {
    it('transitions to next paragraph', () => {})
    it('handles on-demand loading', () => {})
    it('handles retry on error', () => {})
  })
  describe('completion', () => {
    it('completes all paragraphs', () => {})
    it('cleans up highlights', () => {})
  })
  describe('playback control', () => {
    it('pauses/resumes playback', () => {})
    it('seeks within session', () => {})
    it('stops cleanly', () => {})
  })
  describe('statistics', () => {
    it('provides session stats', () => {})
  })
})
```

---

## Mock Setup Templates

### For Logger.js
```javascript
vi.spyOn(console, 'error').mockImplementation(vi.fn());
vi.spyOn(console, 'warn').mockImplementation(vi.fn());
vi.spyOn(console, 'log').mockImplementation(vi.fn());
```

### For SkipControl.js
```javascript
const mockContainer = document.createElement('div');
mockContainer.id = 'skip-control-container';
document.body.appendChild(mockContainer);
```

### For IndexedDB-dependent files
```javascript
vi.mock('idb', () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        index: vi.fn(() => ({
          getAll: vi.fn(() => Promise.resolve([]))
        })),
        count: vi.fn(() => Promise.resolve(0)),
        getAll: vi.fn(() => Promise.resolve([]))
      }))
    }))
  }))
}));
```

---

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test Logger.test.js

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

---

## Coverage Verification

After implementing tests, verify coverage with:

```bash
npm test -- --coverage --coverage-reporters=text

# Check specific file
npm test -- --coverage --coverage-include="src/popup/SkipControl.js"
```

Expected coverage per phase:
- After Phase 1: ~77.7%
- After Phase 2: ~78.7%
- After Phase 3: ~79.9-80.5%

