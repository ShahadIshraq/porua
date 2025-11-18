# Phase 6: Preview UI Manual Test Checklist

## Prerequisites
- Overlay UI working (Phase 5 complete)
- Application built and running
- Can trigger screen capture

## Test Environment Setup

Use the temporary test button from Phase 5 or trigger via console:
```javascript
await window.__TAURI__.tauri.invoke('start_screen_capture');
```

---

## Test Cases

### TC1: Preview Window Opens After Capture
**Steps:**
1. Trigger screen capture overlay
2. Select a valid region (>10×10)
3. Release mouse to complete capture

**Expected:**
- ✓ Overlay window closes immediately
- ✓ Preview window opens automatically
- ✓ Preview window is centered on screen
- ✓ Preview window size is 800×600
- ✓ Preview window title is "Captured Screenshot"

---

### TC2: Image Display
**Steps:**
1. Complete a screen capture
2. Wait for preview window to open
3. Verify image displays correctly

**Expected:**
- ✓ Captured image loads and displays
- ✓ Image maintains aspect ratio
- ✓ Image is centered in display area
- ✓ Image has border and shadow
- ✓ Background is dark gray (#2d2d2d)
- ✓ No distortion or stretching

---

### TC3: Image Info Display
**Steps:**
1. Complete a screen capture
2. Check bottom info bar

**Expected:**
- ✓ Dimensions shown in format "W × H pixels"
- ✓ Dimensions match actual capture size
- ✓ Filename displayed (e.g., "porua_capture_1234567890_0.png")
- ✓ Info bar has dark background
- ✓ Text is readable

---

### TC4: Control Buttons Layout
**Steps:**
1. Complete a screen capture
2. Check control buttons in middle bar

**Expected:**
- ✓ Three buttons visible: Recapture, Save As, Close
- ✓ Buttons horizontally centered
- ✓ Buttons have icons (↻, 💾, ✕)
- ✓ "Save As" is primary (blue) button
- ✓ "Recapture" and "Close" are secondary (gray) buttons
- ✓ Buttons have hover effects

---

### TC5: Save As Button - Success Path
**Steps:**
1. Complete a screen capture
2. Click "Save As..." button
3. In save dialog, choose location and enter filename
4. Click Save

**Expected:**
- ✓ Native save dialog opens
- ✓ Default filename is "screenshot.png"
- ✓ File filter shows "PNG Image (*.png)"
- ✓ After save, button shows "✓ Saved!" briefly
- ✓ Button disabled during success feedback
- ✓ Button returns to normal after 2 seconds
- ✓ File saved to chosen location
- ✓ Saved file is identical to captured image

---

### TC6: Save As Button - Cancel Path
**Steps:**
1. Complete a screen capture
2. Click "Save As..." button
3. In save dialog, click Cancel

**Expected:**
- ✓ Dialog closes
- ✓ No error shown
- ✓ Preview window remains open
- ✓ Button remains enabled
- ✓ Console shows "Save cancelled by user"

---

### TC7: Recapture Button
**Steps:**
1. Complete a screen capture
2. Click "Recapture" button
3. Create new selection

**Expected:**
- ✓ Preview window closes
- ✓ Overlay window opens immediately
- ✓ Can create new selection
- ✓ New preview opens with new capture
- ✓ Previous capture file still exists in temp

---

### TC8: Close Button
**Steps:**
1. Complete a screen capture
2. Click "Close" button

**Expected:**
- ✓ Preview window closes immediately
- ✓ No errors in console
- ✓ Captured temp file remains (for potential future use)

---

### TC9: ESC Key to Close
**Steps:**
1. Complete a screen capture
2. Press ESC key

**Expected:**
- ✓ Preview window closes immediately
- ✓ Same behavior as Close button

---

### TC10: Window Resize
**Steps:**
1. Complete a screen capture
2. Drag window edges to resize smaller
3. Drag window edges to resize larger

**Expected:**
- ✓ Window can be resized
- ✓ Minimum size is 400×300
- ✓ Image scales proportionally
- ✓ Image remains centered
- ✓ Controls remain at bottom
- ✓ Info bar remains at very bottom

---

### TC11: Very Small Image
**Steps:**
1. Capture a 50×50 pixel region
2. Check preview window

**Expected:**
- ✓ Small image displays correctly
- ✓ Image not stretched
- ✓ Dimensions show "50 × 50 pixels"
- ✓ Window still usable
- ✓ Controls accessible

---

### TC12: Very Large Image
**Steps:**
1. Capture entire screen (e.g., 1920×1080 or larger)
2. Check preview window

**Expected:**
- ✓ Large image fits within window
- ✓ Image scaled down proportionally
- ✓ Dimensions show correct full size
- ✓ Image maintains quality
- ✓ Scrolling not required (image fits)

---

### TC13: Multiple Sequential Captures
**Steps:**
1. Complete capture → Save to location 1
2. Close preview
3. Complete capture → Save to location 2
4. Close preview
5. Complete capture → Save to location 3

**Expected:**
- ✓ Each capture creates unique temp file
- ✓ Each preview shows correct image
- ✓ All three saved files are different
- ✓ No file conflicts
- ✓ No memory leaks

---

### TC14: Recapture Chain
**Steps:**
1. Complete capture A
2. Click Recapture → Complete capture B
3. Click Recapture → Complete capture C
4. Click Recapture → Complete capture D

**Expected:**
- ✓ Each recapture closes previous preview
- ✓ Each preview shows correct new image
- ✓ Only one preview window open at a time
- ✓ All temp files created
- ✓ No window stacking issues

---

### TC15: Save Multiple Times
**Steps:**
1. Complete a capture
2. Click "Save As..." → Save to location 1
3. Click "Save As..." → Save to location 2 (different name)
4. Click "Save As..." → Save to location 3 (different name)

**Expected:**
- ✓ Can save same capture multiple times
- ✓ Each save creates separate file
- ✓ All files identical to original
- ✓ Button feedback works each time

---

### TC16: Context Menu Prevention
**Steps:**
1. Complete a capture
2. Right-click on image
3. Right-click on buttons
4. Right-click on background

**Expected:**
- ✓ No context menu appears anywhere
- ✓ Right-click has no effect

---

### TC17: High DPI Display (If Available)
**Steps:**
1. Test on high DPI display (Retina, 4K)
2. Complete a capture
3. Check preview window

**Expected:**
- ✓ UI elements sharp and clear
- ✓ Buttons render correctly
- ✓ Image displays at correct size
- ✓ Text readable
- ✓ Icons crisp

---

### TC18: Error Handling - Invalid Path
**Steps:**
1. Manually invoke with invalid path:
   ```javascript
   await invoke('open_preview_window', {
     imagePath: '/invalid/path/image.png'
   });
   ```

**Expected:**
- ✓ Preview window opens
- ✓ Error message displayed: "Error: Failed to load image"
- ✓ No crash
- ✓ Can close window

---

### TC19: Error Handling - Save Failure
**Steps:**
1. Complete a capture
2. Try to save to read-only location or invalid path
   (May need to manually trigger this scenario)

**Expected:**
- ✓ Alert shows error message
- ✓ Preview remains open
- ✓ Can retry save to valid location
- ✓ No data loss

---

### TC20: Window Focus
**Steps:**
1. Complete a capture
2. Click on another window
3. Click back on preview window

**Expected:**
- ✓ Preview window gains focus properly
- ✓ Buttons still work after regaining focus
- ✓ ESC key still works after regaining focus

---

## Browser Console Checks

### Expected Console Logs (Success Path):
```
Preview window loaded
Loading image: /tmp/porua_capture_1234567890_0.png
Image loaded successfully: 1920 1080
Save As requested
Saving to: /Users/name/Desktop/screenshot.png
Save successful
```

### Expected Console Logs (Recapture Path):
```
Preview window loaded
Loading image: /tmp/porua_capture_1234567890_0.png
Image loaded successfully: 800 600
Recapture requested
```

### Expected Console Logs (Close Path):
```
Preview window loaded
Loading image: /tmp/porua_capture_1234567890_0.png
Image loaded successfully: 640 480
Close requested
```

---

## Integration with Phase 5

Test complete overlay → preview workflow:
1. ✓ Overlay closes before preview opens
2. ✓ No gap or flicker between windows
3. ✓ Preview shows correct captured image
4. ✓ Recapture reopens overlay correctly
5. ✓ Cancel in overlay doesn't break preview flow

---

## Known Limitations (Phase 6)

1. **No Keyboard Shortcut**: Must use overlay to trigger capture (Phase 7)
2. **No Tray Menu Item**: No menu option to start capture (Phase 7)
3. **No Edit Features**: Preview is view-only, no annotations or edits
4. **Single Format**: Only PNG format supported

---

## Regression Checks

After completing Phase 6, verify:
- ✓ All 41 automated tests still pass
- ✓ Phase 5 overlay tests still work
- ✓ Application still installs correctly
- ✓ Server still starts/stops correctly
- ✓ System tray still works

---

## Sign-off

**Tester:** ___________________
**Date:** ___________________
**All Tests Passed:** [ ] Yes [ ] No
**Issues Found:** ___________________

**Ready for Phase 7:** [ ] Yes [ ] No
