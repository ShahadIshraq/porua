# Test Coverage Gap Summary

## Executive Summary

Current coverage: **77.4%** | Target: **80%+** | Gap: **2.6%**

Three documents have been created to guide the test implementation:
1. **TEST_COVERAGE_ANALYSIS.md** - Identifies all gaps, prioritizes by impact
2. **TEST_IMPLEMENTATION_GUIDE.md** - Detailed test structure for each file
3. **COVERAGE_SUMMARY.md** - This document

---

## Quick Facts

- **Total source files:** 41
- **Files at 0% coverage:** 3 (PlaybackSessionManager, SkipControl, Logger)
- **Files <50% coverage:** 3 (PersistentCache, AudioCacheManager, WarmCache)
- **Files with existing but incomplete tests:** 2 (AudioPlayer, AudioRegistry)
- **Total uncovered lines:** 822
- **Lines to gain 80% coverage:** ~1,008

---

## Prioritized Files to Test

### MUST TEST (0% coverage - 450 lines)

| # | File | Lines | Difficulty | Time | Note |
|---|------|-------|-----------|------|------|
| 1 | Logger.js | 22 | EASY | 30min | Static logging methods |
| 2 | SkipControl.js | 119 | EASY | 1-2h | DOM component, no complex deps |
| 3 | PlaybackSessionManager.js | 309 | HARD | 4-6h | Complex controller, highest impact |

### SHOULD TEST (Very low coverage <50% - 372 lines)

| # | File | Lines | Difficulty | Time | Note |
|---|------|-------|-----------|------|------|
| 4 | AudioCacheManager.js | 81 uncov | MEDIUM | 1.5-2h | L2 cache coordinator |
| 5 | PersistentCache.js | 179 uncov | MEDIUM | 2-3h | IndexedDB backend |
| 6 | WarmCache.js | 112 uncov | MEDIUM | 1.5-2h | Chunk-level cache |

### SHOULD EXPAND (Existing tests, gaps - 186 lines)

| # | File | Lines | Difficulty | Time | Note |
|---|------|-------|-----------|------|------|
| 7 | AudioPlayer.js | 103 uncov | MEDIUM | 1-2h | Expand existing test |
| 8 | AudioRegistry.js | 83 uncov | MEDIUM | 1-2h | Expand existing test |

---

## Implementation Roadmap

### Phase 1: Quick Wins (2 hours)
Tests for Logger.js and SkipControl.js
- **Impact:** +0.35% coverage
- **Difficulty:** Easy DOM and console operations
- **Blocker:** None

### Phase 2: Cache Layer (5 hours)
Tests for AudioCacheManager, PersistentCache, WarmCache
- **Impact:** +0.92% coverage
- **Difficulty:** Medium - IndexedDB mocking required
- **Dependency:** Phase 1 complete (for confidence)

### Phase 3: Playback Logic (3-4 hours)
Expand AudioPlayer and AudioRegistry tests
- **Impact:** +0.46% coverage
- **Difficulty:** Medium - multiple async operations
- **Dependency:** Phase 1 complete

### Phase 4: Session Manager (6 hours)
Full test suite for PlaybackSessionManager
- **Impact:** +0.77% coverage
- **Difficulty:** Hard - many mocked dependencies
- **Dependency:** Phase 2 complete (cache tests first)

**Total effort: 16-19 hours | Expected result: 80-80.5% coverage**

---

## File Dependencies Graph

```
PlaybackSessionManager (0%)
  └── Requires: AudioRegistry (72.99%), AudioPlayer (66.99%)
      └── Requires: HotCache (96.69%), WarmCache (48.39%)
          └── Requires: AudioCacheManager (42.96%)
              └── Requires: PersistentCache (34.43%), LRUCache (100%)

SkipControl (0%)
  └── Pure DOM, no dependencies

Logger (0%)
  └── Pure console, no dependencies
```

---

## Key Metrics

### Coverage Breakdown by Tier

| Tier | Files | Avg Coverage | Status |
|------|-------|--------------|--------|
| 100% Complete | 13 | 100% | Complete |
| 90-99% | 5 | 96.5% | High |
| 80-89% | 7 | 85.7% | Acceptable |
| 50-79% | 6 | 69.5% | **Needs work** |
| <50% | 6 | 35.6% | **Critical** |
| **TOTALS** | **41** | **77.4%** | |

### Files by Test Requirement

| Category | Count | Lines | % of Total |
|----------|-------|-------|-----------|
| Already fully tested | 13 | 1,347 | 33.3% |
| Needs significant work | 3 | 450 | 11.1% |
| Needs moderate work | 3 | 372 | 9.2% |
| Needs expansion | 2 | 186 | 4.6% |
| Acceptable coverage | 20 | 1,510 | 37.3% |

---

## Testing Approach

### Technology Stack
- **Framework:** Vitest (already configured)
- **Mocking:** vi.mock(), vi.spyOn()
- **DOM:** jsdom (automatic with vitest)
- **IndexedDB:** vi.mock('idb') pattern (see AudioPlayer.test.js)

### Test File Organization
```
tests/
  unit/
    shared/
      utils/
        logger.test.js (NEW)
      cache/
        AudioCacheManager.test.js (NEW)
        PersistentCache.test.js (NEW)
    popup/
      SkipControl.test.js (NEW)
    content/
      audio/
        WarmCache.test.js (NEW)
        AudioPlayer.test.js (EXPAND)
        AudioRegistry.test.js (EXPAND)
      controllers/
        PlaybackSessionManager.test.js (NEW)
```

---

## Success Criteria

- [x] Identified all files with <75% coverage
- [x] Prioritized by effort and impact
- [x] Created implementation guides
- [ ] Implement Logger.js tests (30 min)
- [ ] Implement SkipControl.js tests (2 hours)
- [ ] Implement cache layer tests (5 hours)
- [ ] Expand AudioPlayer/Registry tests (3 hours)
- [ ] Implement PlaybackSessionManager tests (6 hours)
- [ ] **Achieve 80%+ coverage**

---

## Estimated Timeline

| Phase | Files | Effort | Date |
|-------|-------|--------|------|
| Phase 1 | 2 | 2h | Quick |
| Phase 2 | 3 | 5h | Next |
| Phase 3 | 2 | 3h | Following |
| Phase 4 | 1 | 6h | Final |
| **TOTAL** | **8** | **16-19h** | **~1 week** |

---

## References

- See TEST_COVERAGE_ANALYSIS.md for detailed gap analysis
- See TEST_IMPLEMENTATION_GUIDE.md for step-by-step test implementations
- Existing tests: tests/unit/content/audio/AudioPlayer.test.js
- Existing tests: tests/unit/content/audio/AudioRegistry.test.js

