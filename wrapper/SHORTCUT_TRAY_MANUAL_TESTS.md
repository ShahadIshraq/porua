# Phase 7: Keyboard Shortcut & Tray Integration Manual Test Checklist

## Prerequisites
- Application fully installed and running
- System tray icon visible
- Phases 5 & 6 (Overlay and Preview) working

---

## Test Cases

### TC1: System Tray Menu Item Visibility
**Steps:**
1. Launch application
2. Click on system tray icon

**Expected:**
- ✓ Tray menu opens
- ✓ Menu shows "Running on port 3000" (or configured port)
- ✓ Menu shows "Capture Screen Area" option
- ✓ "Capture Screen Area" is between server status and "About Porua"
- ✓ Separator lines before and after "Capture Screen Area"

---

### TC2: Trigger Capture from Tray Menu
**Steps:**
1. Click system tray icon
2. Click "Capture Screen Area" menu item

**Expected:**
- ✓ Overlay window opens immediately
- ✓ Fullscreen selection overlay appears
- ✓ Can select region as normal
- ✓ Preview opens after selection
- ✓ Tray menu closes when overlay opens

---

### TC3: Global Keyboard Shortcut - Ctrl+Shift+S
**Steps:**
1. Make sure application is running
2. Focus on any other application (browser, text editor, etc.)
3. Press Ctrl+Shift+S

**Expected:**
- ✓ Overlay window opens immediately
- ✓ Works from any application
- ✓ Works even when app has no visible windows
- ✓ Can complete full capture workflow
- ✓ Console shows "Global shortcut triggered: Ctrl+Shift+S"

---

### TC4: Shortcut Registration on Startup
**Steps:**
1. Quit application completely
2. Restart application
3. Wait for startup to complete
4. Press Ctrl+Shift+S

**Expected:**
- ✓ Shortcut registered automatically on startup
- ✓ Console shows "Global shortcut Ctrl+Shift+S registered successfully"
- ✓ Shortcut works immediately after startup

---

### TC5: Multiple Triggers - Tray Then Shortcut
**Steps:**
1. Click tray icon → "Capture Screen Area"
2. Press ESC to cancel overlay
3. Press Ctrl+Shift+S
4. Select region and complete capture

**Expected:**
- ✓ Both triggers work correctly
- ✓ No conflicts between triggers
- ✓ Each trigger opens new overlay
- ✓ Previous overlay closes before new one

---

### TC6: Multiple Triggers - Shortcut Then Tray
**Steps:**
1. Press Ctrl+Shift+S
2. Press ESC to cancel overlay
3. Click tray icon → "Capture Screen Area"
4. Select region and complete capture

**Expected:**
- ✓ Both triggers work correctly
- ✓ No conflicts between triggers
- ✓ Overlay opens reliably from both sources

---

### TC7: Rapid Successive Triggers
**Steps:**
1. Press Ctrl+Shift+S rapidly 5 times
2. Observe behavior

**Expected:**
- ✓ Only one overlay opens (prevents spam)
- ✓ OR each press opens new overlay (if implemented that way)
- ✓ No crashes or hangs
- ✓ Application remains responsive

---

### TC8: Shortcut While Overlay Open
**Steps:**
1. Press Ctrl+Shift+S to open overlay
2. While overlay is open, press Ctrl+Shift+S again

**Expected:**
- ✓ Behavior is defined (either no-op or close/reopen)
- ✓ No crash or unexpected behavior
- ✓ Application remains usable

---

### TC9: Shortcut While Preview Open
**Steps:**
1. Complete a capture (preview window open)
2. Press Ctrl+Shift+S

**Expected:**
- ✓ New overlay opens (or preview closes first then overlay)
- ✓ Can start new capture
- ✓ Previous preview closes
- ✓ Workflow remains smooth

---

### TC10: Tray Menu When Server Stopped
**Steps:**
1. Stop the TTS server via tray menu
2. Click tray icon to open menu

**Expected:**
- ✓ Menu shows "Stopped" status
- ✓ "Capture Screen Area" still visible
- ✓ Can still trigger screen capture
- ✓ Capture functionality works independently of server status

---

### TC11: Shortcut on macOS (If Testing on Mac)
**Steps:**
1. On macOS, press Cmd+Shift+S (note: Ctrl+Shift+S should also work)
2. Test with app in background

**Expected:**
- ✓ Shortcut works as expected
- ✓ Overlay appears on all spaces/desktops
- ✓ No interference with system screenshots

---

### TC12: Shortcut on Windows (If Testing on Windows)
**Steps:**
1. On Windows, press Ctrl+Shift+S
2. Test with app minimized to tray

**Expected:**
- ✓ Shortcut works even when minimized
- ✓ Overlay appears on current desktop
- ✓ Shortcut takes precedence over any conflicts

---

### TC13: Shortcut Conflict Detection
**Steps:**
1. Check if any other application uses Ctrl+Shift+S
2. Test shortcut with conflicting app running

**Expected:**
- ✓ Console logs registration success or failure
- ✓ If conflict, error logged clearly
- ✓ Application doesn't crash
- ✓ Tray menu still works as fallback

---

### TC14: Application Quit and Shortcut Cleanup
**Steps:**
1. Note that Ctrl+Shift+S works
2. Quit application
3. Try pressing Ctrl+Shift+S

**Expected:**
- ✓ Shortcut no longer triggers after quit
- ✓ Shortcut properly unregistered
- ✓ No ghost processes or handlers
- ✓ Clean shutdown

---

### TC15: Complete Workflow - Tray Trigger
**Steps:**
1. Click tray → "Capture Screen Area"
2. Select 200×200 region
3. Save to desktop
4. Click "Recapture"
5. Select new region
6. Close preview

**Expected:**
- ✓ Full workflow works from tray
- ✓ All features function correctly
- ✓ Can trigger again from tray
- ✓ No issues

---

### TC16: Complete Workflow - Shortcut Trigger
**Steps:**
1. Press Ctrl+Shift+S
2. Select 300×300 region
3. Save to documents folder
4. Click "Recapture"
5. Press ESC to cancel
6. Press Ctrl+Shift+S again

**Expected:**
- ✓ Full workflow works from shortcut
- ✓ Can chain multiple captures
- ✓ Shortcut remains active throughout
- ✓ No issues

---

### TC17: Tray Menu Accessibility
**Steps:**
1. Open tray menu
2. Navigate with keyboard (arrow keys)
3. Press Enter on "Capture Screen Area"

**Expected:**
- ✓ Menu is keyboard navigable
- ✓ Can select "Capture Screen Area" with keyboard
- ✓ Overlay opens on Enter
- ✓ Accessibility features work

---

### TC18: Shortcut in Full-Screen App
**Steps:**
1. Open a full-screen application (video player, game, etc.)
2. Press Ctrl+Shift+S

**Expected:**
- ✓ Overlay appears over full-screen app
- ✓ Can capture from full-screen content
- ✓ Full-screen app pauses or continues (acceptable either way)
- ✓ Capture works correctly

---

### TC19: Shortcut During System Sleep/Wake
**Steps:**
1. Press Ctrl+Shift+S (verify it works)
2. Put computer to sleep
3. Wake computer
4. Press Ctrl+Shift+S

**Expected:**
- ✓ Shortcut still works after wake
- ✓ No need to restart application
- ✓ All functionality preserved

---

### TC20: Integration with Existing Tray Menu
**Steps:**
1. Open tray menu
2. Verify all existing options still work:
   - Start/Stop Server
   - About Porua
   - Quit
3. Test "Capture Screen Area" works
4. Verify tray icon updates on server status changes

**Expected:**
- ✓ No regression in existing tray functionality
- ✓ "Capture Screen Area" integrates seamlessly
- ✓ Menu layout is clean and organized
- ✓ All features work together

---

## Console Logs to Check

### Expected on Startup:
```
Starting Porua Wrapper
Global shortcut Ctrl+Shift+S registered successfully
```

### Expected on Tray Click:
```
Tray event: capture_screen
Screen capture requested from tray
Screen capture overlay opened
```

### Expected on Shortcut Press:
```
Global shortcut triggered: Ctrl+Shift+S
Screen capture overlay opened from shortcut
```

### Expected on Shortcut Registration Failure (if conflict):
```
Failed to register global shortcut: [error message]
```

---

## Known Limitations

1. **Platform-Specific Shortcuts**: Shortcut behavior may vary between macOS/Windows/Linux
2. **Shortcut Conflicts**: If another app uses Ctrl+Shift+S, registration may fail
3. **Full-Screen Limitations**: Some full-screen apps may block overlay

---

## Regression Checks

After completing Phase 7, verify:
- ✓ All 49 automated tests still pass
- ✓ Overlay UI still works (Phase 5)
- ✓ Preview UI still works (Phase 6)
- ✓ Application still installs correctly
- ✓ Server still starts/stops correctly
- ✓ Existing tray menu items still work

---

## Sign-off

**Tester:** ___________________
**Date:** ___________________
**All Tests Passed:** [ ] Yes [ ] No
**Issues Found:** ___________________

**Ready for Phase 8:** [ ] Yes [ ] No
