# Phase 8: End-to-End Integration Testing

## Overview

This document provides comprehensive end-to-end testing scenarios for the complete screen capture feature, validating the integration of all components:
- Phase 5: Overlay UI
- Phase 6: Preview UI
- Phase 7: Keyboard Shortcut & Tray Integration

---

## Prerequisites

- Application fully installed and running
- All 68 automated tests passing
- System tray icon visible and server running
- Test environment: Clean state, no other capture windows open

---

## Complete Workflow Tests

### E2E-1: Full Capture Workflow via Keyboard Shortcut
**Objective:** Validate complete workflow from shortcut to saved file

**Steps:**
1. Press Ctrl+Shift+S
2. Verify overlay appears (fullscreen, dark background, crosshair cursor)
3. Click at (500, 500)
4. Drag to (700, 700) - 200×200 selection
5. Verify blue selection box and dimensions tooltip "200 × 200"
6. Release mouse
7. Verify overlay closes
8. Verify preview window opens (800×600, centered)
9. Verify image displays correctly (200×200)
10. Verify info bar shows "200 × 200 pixels" and filename
11. Click "Save As..."
12. Choose Desktop/test_screenshot.png
13. Click Save
14. Verify button shows "✓ Saved!" for 2 seconds
15. Verify file exists on Desktop
16. Open saved file and verify it's correct
17. Click Close
18. Verify preview closes

**Expected Result:**
- ✓ Smooth workflow from trigger to saved file
- ✓ All UI transitions work correctly
- ✓ Saved file matches captured region
- ✓ No errors or glitches

**Time Estimate:** 2-3 minutes

---

### E2E-2: Full Capture Workflow via Tray Menu
**Objective:** Validate complete workflow from tray to saved file

**Steps:**
1. Click system tray icon
2. Click "Capture Screen Area"
3. Verify overlay appears
4. Select 300×300 region
5. Verify preview opens with correct image
6. Click "Save As..."
7. Save to Documents/screenshot2.png
8. Verify save succeeds
9. Click Close

**Expected Result:**
- ✓ Identical workflow to shortcut trigger
- ✓ Tray menu closes when overlay opens
- ✓ File saved correctly

**Time Estimate:** 2-3 minutes

---

### E2E-3: Recapture Chain with Multiple Saves
**Objective:** Test multiple sequential captures with recapture feature

**Steps:**
1. Press Ctrl+Shift+S
2. Capture region A (100×100)
3. Preview opens → Save as capture_a.png
4. Click "Recapture"
5. Verify overlay reopens
6. Capture region B (200×200)
7. Preview opens → Save as capture_b.png
8. Click "Recapture"
9. Capture region C (300×300)
10. Preview opens → Save as capture_c.png
11. Click Close
12. Verify all 3 files exist and are different sizes

**Expected Result:**
- ✓ Can chain captures without closing app
- ✓ Each capture creates unique temp file
- ✓ All saved files are correct
- ✓ No memory leaks or slowdowns

**Time Estimate:** 5 minutes

---

### E2E-4: Cancel and Retry Workflow
**Objective:** Test cancellation at various stages

**Steps:**
1. Press Ctrl+Shift+S
2. Start dragging selection
3. Press ESC (cancel during drag)
4. Verify overlay closes
5. Press Ctrl+Shift+S again
6. Complete selection (150×150)
7. Preview opens
8. Press ESC
9. Verify preview closes
10. Tray menu → Capture Screen Area
11. Complete selection
12. Save successfully

**Expected Result:**
- ✓ ESC works during selection
- ✓ ESC closes preview
- ✓ Can retry after cancel
- ✓ No state corruption

**Time Estimate:** 3 minutes

---

### E2E-5: Error Recovery - Small Selection
**Objective:** Test error handling and recovery

**Steps:**
1. Press Ctrl+Shift+S
2. Select 5×5 region (too small)
3. Verify error message: "Selection too small (min 10×10)"
4. Verify red coloring
5. Wait for timeout (1.5 sec)
6. Verify overlay remains open
7. Select valid 100×100 region
8. Verify capture succeeds

**Expected Result:**
- ✓ Error shown clearly
- ✓ Overlay doesn't close on error
- ✓ Can immediately retry
- ✓ Valid selection works after error

**Time Estimate:** 2 minutes

---

### E2E-6: Multi-Monitor Capture (If Available)
**Objective:** Validate multi-monitor support

**Steps:**
1. Connect second monitor
2. Press Ctrl+Shift+S
3. Verify overlay spans both monitors
4. Capture region on monitor 1
5. Save as monitor1_capture.png
6. Press Ctrl+Shift+S
7. Capture region on monitor 2
8. Save as monitor2_capture.png
9. Press Ctrl+Shift+S
10. Capture region spanning both monitors
11. Save as spanning_capture.png
12. Verify all files correct

**Expected Result:**
- ✓ Overlay covers all monitors
- ✓ Can capture from any monitor
- ✓ Can capture across monitor boundaries
- ✓ Coordinates handled correctly

**Time Estimate:** 5 minutes

---

### E2E-7: Rapid Triggering Stress Test
**Objective:** Test robustness under rapid user actions

**Steps:**
1. Press Ctrl+Shift+S rapidly 10 times
2. Observe behavior
3. If multiple overlays: Close all with ESC
4. Trigger capture normally
5. While overlay open, press Ctrl+Shift+S 5 more times
6. Cancel with ESC
7. Trigger capture, complete selection
8. While preview open, press Ctrl+Shift+S
9. Complete new capture
10. Verify no crashes or hangs

**Expected Result:**
- ✓ Application remains responsive
- ✓ No crashes or memory leaks
- ✓ Behavior is predictable
- ✓ Can recover from rapid actions

**Time Estimate:** 3 minutes

---

### E2E-8: Large Capture Test
**Objective:** Test performance with large captures

**Steps:**
1. Note monitor resolution (e.g., 1920×1080)
2. Press Ctrl+Shift+S
3. Capture entire screen
4. Verify dimensions show full resolution
5. Preview opens (may take 1-2 seconds)
6. Verify image displays correctly (scaled to fit)
7. Save as large_capture.png
8. Verify file size is reasonable (500KB - 5MB)
9. Open file externally, verify quality

**Expected Result:**
- ✓ Can capture full screen
- ✓ Preview scales image appropriately
- ✓ Save works with large files
- ✓ No performance issues

**Time Estimate:** 2 minutes

---

### E2E-9: Very Small Capture (Edge Case)
**Objective:** Test minimum viable capture

**Steps:**
1. Press Ctrl+Shift+S
2. Capture exactly 10×10 region
3. Verify accepted (minimum size)
4. Preview opens
5. Image displays (small but visible)
6. Save as tiny_capture.png
7. Verify file is valid PNG

**Expected Result:**
- ✓ 10×10 is accepted
- ✓ 9×9 is rejected
- ✓ Tiny images handle correctly

**Time Estimate:** 2 minutes

---

### E2E-10: Capture During High System Load
**Objective:** Test reliability under system stress

**Steps:**
1. Start CPU-intensive task (video encoding, compilation, etc.)
2. Press Ctrl+Shift+S
3. Make selection
4. Verify capture completes
5. Verify preview opens
6. Save file
7. Verify file integrity

**Expected Result:**
- ✓ Capture works under load
- ✓ No corruption or errors
- ✓ May be slightly slower but functional

**Time Estimate:** 3 minutes

---

### E2E-11: Integration with TTS Server
**Objective:** Verify screen capture doesn't interfere with main app functionality

**Steps:**
1. Verify TTS server is running (tray shows "Running on port 3000")
2. Test TTS endpoint (curl http://localhost:3000/health or use browser extension)
3. While TTS is processing, press Ctrl+Shift+S
4. Complete capture
5. Verify TTS still works
6. Stop TTS server via tray
7. Press Ctrl+Shift+S
8. Verify capture still works (independent of server)
9. Start TTS server
10. Verify both features work

**Expected Result:**
- ✓ Screen capture doesn't block TTS
- ✓ TTS doesn't block screen capture
- ✓ Both features independent
- ✓ No resource conflicts

**Time Estimate:** 5 minutes

---

### E2E-12: Application Lifecycle Test
**Objective:** Test capture feature through app lifecycle

**Steps:**
1. Launch app (fresh start)
2. Wait for startup (2-3 seconds)
3. Press Ctrl+Shift+S (verify shortcut registered)
4. Complete capture successfully
5. Minimize app to tray
6. Press Ctrl+Shift+S (verify works from tray)
7. Complete capture
8. Restore app window (if any)
9. Quit app via tray
10. Verify app closes cleanly
11. Relaunch app
12. Press Ctrl+Shift+S immediately
13. Verify works after restart

**Expected Result:**
- ✓ Shortcut registered on startup
- ✓ Works when minimized
- ✓ Clean shutdown
- ✓ Works immediately after restart

**Time Estimate:** 5 minutes

---

### E2E-13: Cross-Feature Integration
**Objective:** Test interaction between all app features

**Steps:**
1. Open About page (tray → About Porua)
2. While About page open, press Ctrl+Shift+S
3. Complete capture
4. Close preview
5. Stop TTS server
6. Press Ctrl+Shift+S
7. Complete capture
8. Start TTS server
9. Press Ctrl+Shift+S during server startup
10. Complete capture

**Expected Result:**
- ✓ Capture works alongside other features
- ✓ No interference or conflicts
- ✓ All features remain functional

**Time Estimate:** 4 minutes

---

### E2E-14: File System Edge Cases
**Objective:** Test file handling edge cases

**Steps:**
1. Complete capture
2. Save As → Try saving to read-only location
3. Verify error shown, can retry
4. Save As → Try saving with existing filename
5. Verify overwrite prompt or auto-rename
6. Save As → Cancel dialog
7. Verify preview stays open
8. Save As → Save with special chars in name ("test#capture!.png")
9. Verify save succeeds or sanitizes filename
10. Close preview
11. Find all temp captures in temp directory
12. Verify they exist

**Expected Result:**
- ✓ Errors handled gracefully
- ✓ Can retry after errors
- ✓ Special characters handled
- ✓ Temp files cleaned up eventually

**Time Estimate:** 5 minutes

---

### E2E-15: Accessibility & Keyboard Navigation
**Objective:** Test keyboard-only workflow

**Steps:**
1. Press Ctrl+Shift+S (keyboard trigger)
2. Use mouse to select (selection requires mouse)
3. Preview opens
4. Press Tab to navigate between buttons
5. Press Enter on "Save As"
6. Use keyboard in save dialog
7. Save file
8. Press ESC to close preview (keyboard close)
9. Tray menu → Use arrow keys to navigate
10. Press Enter on "Capture Screen Area"
11. Complete workflow

**Expected Result:**
- ✓ Keyboard shortcuts work
- ✓ ESC closes windows
- ✓ Tab navigation works in preview
- ✓ Tray menu keyboard accessible

**Time Estimate:** 4 minutes

---

## Performance Tests

### E2E-16: Memory Usage Test
**Steps:**
1. Note baseline memory usage
2. Perform 20 sequential captures (complete workflow each)
3. Monitor memory usage
4. Close all windows
5. Check memory returns to baseline

**Expected Result:**
- ✓ Memory usage remains stable
- ✓ No significant leaks
- ✓ Memory released after windows close

**Time Estimate:** 10 minutes

---

### E2E-17: Startup Time Impact
**Steps:**
1. Time cold start (quit app, relaunch)
2. Verify shortcut registration doesn't delay startup
3. Should be < 3 seconds to ready state

**Expected Result:**
- ✓ Startup time not significantly impacted
- ✓ App responsive immediately

**Time Estimate:** 2 minutes

---

## Regression Tests

### E2E-18: Existing Features Still Work
**Steps:**
1. Test TTS server start/stop
2. Test About page opens
3. Test Quit works
4. Test system tray icon updates
5. Test installer (if testing fresh install)

**Expected Result:**
- ✓ All existing features unaffected
- ✓ No regressions introduced

**Time Estimate:** 5 minutes

---

## Final Validation

### E2E-19: Complete Feature Demo
**Objective:** Run through typical user scenario

**Steps:**
1. User installs app first time
2. App starts, server running
3. User presses Ctrl+Shift+S (discovers shortcut)
4. Captures browser window
5. Saves to Desktop
6. Opens saved file, verifies quality
7. Presses Ctrl+Shift+S again
8. Captures error message from application
9. Saves to specific folder
10. Uses Recapture to get clearer shot
11. Satisfied, closes preview
12. App continues running in tray

**Expected Result:**
- ✓ Intuitive user experience
- ✓ Smooth, reliable workflow
- ✓ High-quality captures
- ✓ Feature meets requirements

**Time Estimate:** 5 minutes

---

### E2E-20: Automated Test Suite Validation
**Steps:**
1. Run `cargo test` from src-tauri directory
2. Verify all 68 tests pass
3. No warnings about failed tests
4. Check test coverage report

**Expected Result:**
- ✓ All 68 tests passing
- ✓ No flaky tests
- ✓ Good code coverage

**Time Estimate:** 2 minutes

---

## Test Summary Template

```
Date: _____________
Tester: _____________
Platform: _____________
Resolution: _____________

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| E2E-1   | Full Workflow - Shortcut | ☐ Pass ☐ Fail | |
| E2E-2   | Full Workflow - Tray | ☐ Pass ☐ Fail | |
| E2E-3   | Recapture Chain | ☐ Pass ☐ Fail | |
| E2E-4   | Cancel and Retry | ☐ Pass ☐ Fail | |
| E2E-5   | Error Recovery | ☐ Pass ☐ Fail | |
| E2E-6   | Multi-Monitor | ☐ Pass ☐ Fail ☐ N/A | |
| E2E-7   | Rapid Triggering | ☐ Pass ☐ Fail | |
| E2E-8   | Large Capture | ☐ Pass ☐ Fail | |
| E2E-9   | Small Capture | ☐ Pass ☐ Fail | |
| E2E-10  | High System Load | ☐ Pass ☐ Fail | |
| E2E-11  | TTS Integration | ☐ Pass ☐ Fail | |
| E2E-12  | Lifecycle Test | ☐ Pass ☐ Fail | |
| E2E-13  | Cross-Feature | ☐ Pass ☐ Fail | |
| E2E-14  | File System | ☐ Pass ☐ Fail | |
| E2E-15  | Accessibility | ☐ Pass ☐ Fail | |
| E2E-16  | Memory Usage | ☐ Pass ☐ Fail | |
| E2E-17  | Startup Time | ☐ Pass ☐ Fail | |
| E2E-18  | Regression | ☐ Pass ☐ Fail | |
| E2E-19  | Feature Demo | ☐ Pass ☐ Fail | |
| E2E-20  | Automated Suite | ☐ Pass ☐ Fail | |

**Total Passed:** ___ / 20
**Critical Issues:** _______________
**Minor Issues:** _______________
**Blockers:** _______________
```

---

## Exit Criteria

Phase 8 is complete when:
- ✓ All 20 E2E tests executed
- ✓ At least 18/20 tests passing (90% pass rate)
- ✓ No critical blockers
- ✓ All 68 automated tests still passing
- ✓ Performance acceptable (no significant slowdowns)
- ✓ No data loss or corruption
- ✓ Feature ready for production use

---

## Estimated Total Time

- Core Workflow Tests (E2E-1 to E2E-9): ~25 minutes
- Advanced Tests (E2E-10 to E2E-15): ~30 minutes
- Performance & Regression (E2E-16 to E2E-18): ~17 minutes
- Final Validation (E2E-19 to E2E-20): ~7 minutes

**Total:** ~80 minutes (1 hour 20 minutes)

---

## Notes

- Some tests require specific hardware (multi-monitor)
- Performance tests may vary by machine specs
- Run automated tests first to catch regressions
- Document any issues discovered for Phase 9 (Polish)
