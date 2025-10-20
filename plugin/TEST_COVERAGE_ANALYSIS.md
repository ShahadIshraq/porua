# Test Coverage Gap Analysis

**Current Coverage:** 77.4%  
**Target Coverage:** 80%+  
**Gap to Close:** 2.6%+

## Summary

This analysis identifies all source files with low test coverage and prioritizes them by impact and effort. The codebase has 41 total source files. Coverage is critically low in 3 files (0%) and significantly low in 4 additional files (<50%).

## Files Requiring Attention

### Priority 1: Critical (0% Coverage)

These files are completely untested. Prioritize by order of impact.

| File | Coverage | Lines | Uncovered | Difficulty | Test File Exists | Est. Effort |
|------|----------|-------|-----------|------------|------------------|------------|
| PlaybackSessionManager.js | 0% | 309 | 309 | **HARD** | ❌ No | 4-6h |
| SkipControl.js | 0% | 119 | 119 | **EASY** | ❌ No | 1-2h |
| Logger.js | 0% | 22 | 22 | **EASY** | ❌ No | 0.5h |

**Total uncovered lines in Priority 1:** 450 lines

---

### Priority 2: Very Low Coverage (<50%)

| File | Coverage | Lines | Uncovered | Difficulty | Test File Exists | Est. Effort |
|------|----------|-------|-----------|------------|------------------|------------|
| PersistentCache.js | 34.43% | 273 | 179 | **MEDIUM** | ❌ No | 2-3h |
| AudioCacheManager.js | 42.96% | 142 | 81 | **MEDIUM** | ❌ No | 1.5-2h |
| WarmCache.js | 48.39% | 217 | 112 | **MEDIUM** | ❌ No | 1.5-2h |

**Total uncovered lines in Priority 2:** 372 lines

---

### Priority 3: Low Coverage (50-75%)

| File | Coverage | Lines | Uncovered | Difficulty | Test File Exists | Est. Effort |
|------|----------|-------|-----------|------------|------------------|------------|
| AudioPlayer.js | 66.99% | 312 | 103 | **MEDIUM** | ✅ Yes | 1-2h |
| AudioRegistry.js | 72.99% | 311 | 83 | **MEDIUM** | ✅ Yes | 1-2h |

**Note:** Existing tests exist but are incomplete. Tests need expansion for edge cases and error paths.

---

### Priority 4: Moderate Coverage (75-90%)

These files are acceptable but could use improvement:

| File | Coverage | Lines |
|------|----------|-------|
| CacheKeyGenerator.js | 79.71% | 69 |
| PlayerControl.js | 87.14% | 241 |
| ElementValidation.js | 90.00% | 150 |
| CacheStats.js | 97.17% | 106 |
| HotCache.js | 96.69% | 151 |
| TTSService.js | 90.64% | 171 |
| AudioPreview.js | 94.89% | 176 |
| HighlightManager.js | 90.63% | 331 |

---

## Recommended Testing Strategy

### Phase 1: Quick Wins (Easy) - Estimated Impact: 0.8%
**Effort: 2 hours | Lines covered: 141**

1. **Logger.js** (22 lines)
   - Static method logging - trivial to test
   - Test console output capture
   - Test level-based filtering

2. **SkipControl.js** (119 lines)
   - DOM manipulation component - straightforward testing
   - Test UI rendering, button clicks, state changes
   - Existing tests mock similar patterns in SettingsForm.test.js

### Phase 2: Medium Effort, High Impact (Medium) - Estimated Impact: 1.8%
**Effort: 8 hours | Lines covered: 552**

3. **PersistentCache.js** (179 uncovered lines)
   - IndexedDB operations - moderate complexity
   - Similar to existing cache tests (LRUCache.test.js)
   - Mock `idb` library (pattern exists in AudioPlayer.test.js)
   - Test CRUD operations, size limits, LRU eviction

4. **AudioCacheManager.js** (81 uncovered lines)
   - Coordinates two cache layers
   - Depends on PersistentCache and LRUCache (already tested)
   - Test cache hits/misses, promotions, stats

5. **WarmCache.js** (112 uncovered lines)
   - IndexedDB chunk storage
   - Similar mock pattern available
   - Test chunk CRUD, eviction, tier management

### Phase 3: Complex (Hard) - Estimated Impact: 1.8%
**Effort: 6 hours | Lines covered: 309**

6. **PlaybackSessionManager.js** (309 lines)
   - Complex controller orchestrating multiple components
   - Dependencies: AudioRegistry, AudioPlayer, HighlightManager, TTSService, SettingsStore
   - Most complex file to test - needs heavy mocking
   - Critical for playback workflow

7. **AudioPlayer/AudioRegistry** (186 uncovered lines in existing tests)
   - Expand existing tests to cover error paths and edge cases
   - Test integration scenarios

---

## Technical Implementation Notes

### Mock Patterns Available
- **IndexedDB**: `vi.mock('idb', ...)` - see AudioPlayer.test.js (lines 7-22)
- **Audio Element**: `global.Audio = vi.fn(...)` - see AudioPlayer.test.js (lines 33-45)
- **Blob Operations**: Already mocked in tests
- **DOM**: vitest + jsdom provides automatic DOM simulation

### Testing Framework
- **Framework**: Vitest (already configured)
- **Format**: ES modules with describe/it/expect/beforeEach/afterEach
- **Assertions**: Standard expect() assertions

### File Organization
- Tests go in `tests/unit/` matching src structure
- Use `.test.js` suffix
- Import fixtures from src files as needed

---

## Coverage Impact Estimate

If all Priority 1 & 2 files are fully tested:

| Phase | Files | Lines Covered | Est. Coverage Gain |
|-------|-------|----------------|-------------------|
| Phase 1 (Easy) | 2 | 141 | +0.35% |
| Phase 2 (Medium) | 3 | 372 | +0.92% |
| Phase 3 (Hard) | 1 | 309 | +0.77% |
| Phase 3 (Expand) | 2 | 186 | +0.46% |
| **TOTAL** | **8** | **1,008** | **+2.5%** |

**Projected final coverage: 79.9-80.5%** ✅

---

## Recommended Priority Order

1. **Logger.js** - Tiny, trivial, quick win
2. **SkipControl.js** - DOM-based, can reuse SettingsForm patterns
3. **AudioCacheManager.js** - Smaller than PersistentCache, good foundation
4. **PersistentCache.js** - Build on AudioCacheManager understanding
5. **WarmCache.js** - Similar to PersistentCache
6. **Expand AudioPlayer tests** - Identify gaps in existing tests
7. **Expand AudioRegistry tests** - Identify gaps in existing tests
8. **PlaybackSessionManager.js** - Save for last (hardest)

---

## Quick Reference: Dependencies

```
PlaybackSessionManager
  ├── AudioRegistry (72.99%)
  ├── AudioPlayer (66.99%)
  ├── HighlightManager (90.63%)
  ├── TTSService (90.64%)
  └── SettingsStore (100%)

AudioPlayer
  ├── AudioRegistry (72.99%)
  └── HighlightManager (90.63%)

AudioRegistry
  ├── HotCache (96.69%)
  ├── WarmCache (48.39%)
  └── AudioCacheManager (42.96%)
      ├── LRUCache (100%)
      └── PersistentCache (34.43%)

SkipControl (0%)
  └── DOM (100%)

Logger (0%)
  └── console API
```

---

## Success Criteria

- All Priority 1 files: 100% coverage
- All Priority 2 files: 90%+ coverage
- All Priority 3 files: 80%+ coverage
- Overall project: 80%+ coverage
