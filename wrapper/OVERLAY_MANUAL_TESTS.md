# Phase 5: Overlay UI Manual Test Checklist

## Prerequisites
- Application built and running
- Overlay window can be triggered (will be added in Phase 7, for now test programmatically)

## Test Environment Setup

### Option 1: Trigger from Browser Console (Temporary)
```javascript
// In the main window console:
await window.__TAURI__.tauri.invoke('start_screen_capture');
```

### Option 2: Add Temporary Test Button (Recommended)
Add to `index.html` after the success screen:
```html
<button onclick="window.__TAURI__.tauri.invoke('start_screen_capture')" style="position: fixed; bottom: 20px; right: 20px;">Test Capture</button>
```

---

## Test Cases

### TC1: Basic Selection Display
**Steps:**
1. Trigger overlay window
2. Verify fullscreen overlay appears
3. Verify semi-transparent dark background (rgba(0, 0, 0, 0.3))
4. Verify crosshair cursor
5. Verify instructions visible in center: "Click and drag to select an area" and "Press ESC to cancel"

**Expected:**
- ✓ Overlay covers entire screen(s)
- ✓ Background is semi-transparent
- ✓ Cursor is crosshair
- ✓ Instructions centered and readable

---

### TC2: Selection Rectangle - Top-Left to Bottom-Right Drag
**Steps:**
1. Trigger overlay
2. Click at position (100, 100)
3. Drag to position (300, 300)
4. Verify selection box appears
5. Verify blue border (2px solid #0066ff)
6. Verify semi-transparent blue fill (rgba(0, 102, 255, 0.1))

**Expected:**
- ✓ Selection box starts at (100, 100)
- ✓ Selection box dimensions: 200×200
- ✓ Border is blue
- ✓ Fill is semi-transparent blue

---

### TC3: Selection Rectangle - Bottom-Right to Top-Left Drag
**Steps:**
1. Trigger overlay
2. Click at position (300, 300)
3. Drag to position (100, 100)
4. Verify selection normalized to top-left origin

**Expected:**
- ✓ Selection box starts at (100, 100)
- ✓ Selection box dimensions: 200×200
- ✓ Dragging in reverse direction produces same result

---

### TC4: Dimensions Tooltip Display
**Steps:**
1. Trigger overlay
2. Click and start dragging
3. Verify tooltip appears near cursor
4. Verify tooltip shows dimensions in format "W × H"
5. Verify tooltip updates in real-time as you drag

**Expected:**
- ✓ Tooltip appears offset from cursor (+15px X, -30px Y)
- ✓ Tooltip shows correct dimensions
- ✓ Tooltip follows cursor smoothly
- ✓ Tooltip background is dark (rgba(0, 0, 0, 0.85))
- ✓ Text is white and readable

---

### TC5: Instructions Hide During Drag
**Steps:**
1. Trigger overlay
2. Verify instructions visible
3. Click and start dragging
4. Verify instructions disappear
5. Release mouse
6. Instructions should remain hidden (selection completed)

**Expected:**
- ✓ Instructions visible before drag
- ✓ Instructions hidden during drag
- ✓ Instructions remain hidden after selection

---

### TC6: Small Selection Validation (Visual)
**Steps:**
1. Trigger overlay
2. Create selection smaller than 10×10 (e.g., 5×5)
3. Verify border turns red (#ff4444)
4. Verify fill turns red (rgba(255, 68, 68, 0.1))
5. Release mouse
6. Verify error message: "Selection too small (min 10×10)"
7. Verify error tooltip is red (rgba(255, 68, 68, 0.9))
8. Wait 1.5 seconds
9. Verify selection box and tooltip disappear

**Expected:**
- ✓ Small selection shows red color
- ✓ Error message displays
- ✓ Selection resets after delay
- ✓ Overlay remains open for retry

---

### TC7: Valid Selection Capture
**Steps:**
1. Trigger overlay
2. Create selection larger than 10×10 (e.g., 100×100)
3. Release mouse
4. Verify selection box remains blue
5. Check browser console for "Capturing region:" log
6. Verify overlay window closes after capture

**Expected:**
- ✓ Valid selection stays blue
- ✓ Console shows capture attempt
- ✓ Overlay closes (backend handles this)
- ✓ No errors in console

---

### TC8: ESC Key Cancellation
**Steps:**
1. Trigger overlay
2. Press ESC key
3. Verify console log: "Capture cancelled by user"
4. Verify overlay window closes

**Expected:**
- ✓ ESC key triggers cancellation
- ✓ Console shows cancel log
- ✓ Overlay closes immediately
- ✓ No errors

---

### TC9: ESC During Selection
**Steps:**
1. Trigger overlay
2. Click and start dragging (create partial selection)
3. Press ESC while dragging
4. Verify overlay closes

**Expected:**
- ✓ ESC works during active drag
- ✓ Overlay closes immediately
- ✓ No errors

---

### TC10: Context Menu Prevention
**Steps:**
1. Trigger overlay
2. Right-click anywhere
3. Verify no context menu appears

**Expected:**
- ✓ Context menu is suppressed
- ✓ Right-click has no effect

---

### TC11: Multi-Monitor Support (If Available)
**Steps:**
1. Connect second monitor
2. Trigger overlay
3. Verify overlay spans all monitors
4. Create selection on primary monitor
5. Create selection on secondary monitor
6. Create selection spanning both monitors

**Expected:**
- ✓ Overlay covers all monitors
- ✓ Selection works on any monitor
- ✓ Selection works across monitor boundaries

---

### TC12: High DPI Display (If Available)
**Steps:**
1. Test on high DPI display (Retina, 4K with scaling)
2. Trigger overlay
3. Create selection
4. Verify coordinates are correct
5. Verify dimensions tooltip shows logical pixels

**Expected:**
- ✓ Selection aligns with cursor perfectly
- ✓ Dimensions match visual size
- ✓ No scaling artifacts

---

### TC13: Edge Cases - Near Screen Edge
**Steps:**
1. Trigger overlay
2. Create selection near right edge of screen
3. Create selection near bottom edge of screen
4. Create selection in corner

**Expected:**
- ✓ Selection works at screen edges
- ✓ Tooltip remains visible (doesn't go off-screen)
- ✓ No clipping issues

---

### TC14: Rapid Selections
**Steps:**
1. Trigger overlay
2. Make quick selection and release
3. If overlay reopens, make another quick selection
4. Repeat 5 times

**Expected:**
- ✓ No lag or delay
- ✓ All selections captured correctly
- ✓ No memory leaks
- ✓ Smooth performance

---

### TC15: Very Large Selection
**Steps:**
1. Trigger overlay
2. Create selection covering entire screen
3. Verify dimensions show full screen resolution

**Expected:**
- ✓ Full screen selection works
- ✓ Dimensions accurate
- ✓ Capture succeeds
- ✓ No performance issues

---

## Browser Console Checks

### Expected Console Logs (Success Path):
```
Overlay loaded and ready
Capturing region: {x: 100, y: 100, width: 200, height: 200}
Capture successful: /tmp/porua_capture_1234567890_0.png
```

### Expected Console Logs (Cancel Path):
```
Overlay loaded and ready
Capture cancelled by user
```

### Expected Console Logs (Error Path):
```
Overlay loaded and ready
Capturing region: {x: 5, y: 5, width: 5, height: 5}
Capture failed: Selection is too small (minimum 10x10 pixels)
```

---

## Known Limitations (Phase 5)

1. **No Preview Window**: After capture, overlay closes but preview window doesn't open yet (Phase 6)
2. **No Keyboard Shortcut**: Must trigger programmatically (Phase 7)
3. **No Tray Integration**: No menu option to start capture (Phase 7)
4. **Image Not Saved**: Capture creates temp file but no "Save As" yet (Phase 6)

---

## Regression Checks

After completing Phase 5, verify:
- ✓ All 41 existing tests still pass
- ✓ Application still installs correctly
- ✓ Server still starts/stops correctly
- ✓ System tray still works

---

## Sign-off

**Tester:** ___________________
**Date:** ___________________
**All Tests Passed:** [ ] Yes [ ] No
**Issues Found:** ___________________

**Ready for Phase 6:** [ ] Yes [ ] No
