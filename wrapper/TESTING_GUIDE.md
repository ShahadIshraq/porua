# Overlay Feature Testing Guide

This guide provides comprehensive instructions for testing the screen reading overlay prototype.

## Prerequisites

1. **Platform**: macOS 12.3 or later (recommended)
2. **Permissions**: Screen recording permission granted
3. **Build**: Successful compilation of the wrapper with Swift library
4. **Server**: TTS server built and bundled in resources

## Pre-Testing Validation

Run the automated validation script first:

```bash
cd wrapper
./test-overlay.sh
```

Ensure all tests pass before proceeding with manual testing.

## Test Environment Setup

### Option 1: Use Test Page

1. Open `test-page.html` in a web browser
2. This provides standardized test content for OCR validation

### Option 2: Use Real Content

Test with actual applications:
- PDF documents
- Web pages
- Text editors
- Terminal windows
- System dialogs

## Test Cases

### TC1: Permission Management

**Objective**: Verify screen recording permission flow

**Steps**:
1. Launch Porua for the first time
2. Click "Read from Screen..." from system tray
3. System should prompt for screen recording permission
4. Grant permission in System Preferences
5. Restart Porua
6. Click "Read from Screen..." again

**Expected Results**:
- Clear permission dialog on first attempt
- No errors after permission granted
- Selection window opens immediately after restart

**Pass Criteria**: ✓ Permission granted, selection opens without errors

---

### TC2: Selection Window Behavior

**Objective**: Test selection window UI and interactions

**Steps**:
1. Open selection window
2. Move mouse without clicking (should show crosshair cursor)
3. Click and drag to create selection rectangle
4. Observe selection box appearance
5. Check coordinate display updates
6. Press ESC to cancel
7. Reopen and create valid selection
8. Press Enter to confirm

**Expected Results**:
- Full-screen dark overlay appears
- Crosshair cursor visible
- Selection box draws correctly during drag
- Coordinates update in real-time
- ESC cancels and closes window
- Enter confirms selection

**Pass Criteria**: ✓ All interactions work smoothly

---

### TC3: Screen Capture Quality

**Objective**: Verify captured image quality

**Steps**:
1. Open test-page.html in browser
2. Select "Test 1: Standard Paragraph" section
3. Confirm selection
4. Check extracted text in overlay window

**Test Variations**:
- Small region (100x100px)
- Large region (full screen)
- Narrow horizontal strip
- Narrow vertical strip

**Expected Results**:
- Sharp, clear capture
- No pixelation or artifacts
- Correct dimensions
- Fast capture (<500ms)

**Pass Criteria**: ✓ Images are clear and dimensions correct

---

### TC4: OCR Accuracy - Standard Text

**Objective**: Test OCR with common text formats

**Test Data**: Use Test 1 from test-page.html

**Steps**:
1. Select the standard paragraph section
2. Confirm selection
3. Compare extracted text with original

**Metrics**:
- Character accuracy: >95%
- Word accuracy: >98%
- Confidence score: >0.9

**Expected Results**:
```
Original: "The quick brown fox jumps over the lazy dog."
Extracted: "The quick brown fox jumps over the lazy dog."
Accuracy: 100%
```

**Pass Criteria**: ✓ Accuracy >95%, confidence >0.9

---

### TC5: OCR Accuracy - Font Variations

**Objective**: Test different fonts and sizes

**Test Data**: Use Tests 2-3 from test-page.html

**Steps**:
1. Select large text section → verify extraction
2. Select normal text → verify extraction
3. Select small text → verify extraction
4. Select mixed fonts section → verify extraction

**Expected Results**:
- Large text (24px): 100% accuracy
- Normal text (16px): >95% accuracy
- Small text (12px): >90% accuracy
- All fonts recognized correctly

**Pass Criteria**: ✓ All font variations extracted accurately

---

### TC6: OCR Accuracy - Special Characters

**Objective**: Test special character recognition

**Test Data**: Use Test 5 from test-page.html

**Steps**:
1. Select numbers section: "0123456789"
2. Select special characters: "!@#$%^&*()"
3. Select email: "test@example.com"
4. Select URL: "https://www.example.com"

**Expected Results**:
- Numbers: 100% accuracy
- Common symbols: >90% accuracy
- Email format preserved
- URL format preserved

**Pass Criteria**: ✓ Numbers perfect, symbols >90%

---

### TC7: OCR Accuracy - Code Blocks

**Objective**: Test monospace code recognition

**Test Data**: Use Test 4 from test-page.html

**Steps**:
1. Select code block section
2. Verify function structure preserved
3. Check indentation and special characters

**Expected Results**:
```javascript
function greet(name) {
    console.log(`Hello, ${name}!`);
    return true;
}
```

**Pass Criteria**: ✓ Code structure and syntax preserved

---

### TC8: OCR Accuracy - Colored Backgrounds

**Objective**: Test text on colored backgrounds

**Test Data**: Use Test 7 from test-page.html

**Steps**:
1. Select gradient background section
2. Verify white text extracted correctly

**Expected Results**:
- Text fully extracted
- Confidence score >0.8
- No color bleeding

**Pass Criteria**: ✓ White-on-color text readable

---

### TC9: Overlay Window Functionality

**Objective**: Test reader overlay controls and display

**Steps**:
1. Complete a selection (any test section)
2. Verify overlay window appears
3. Check text display matches extracted content
4. Test window dragging (click header, drag)
5. Test window resizing (drag edges)
6. Check all buttons enabled/disabled correctly

**Expected Results**:
- Window appears near selected region
- Text displayed correctly
- Window is draggable
- Window is resizable
- Controls in correct initial states

**Pass Criteria**: ✓ All window functions work

---

### TC10: Keyboard Shortcuts

**Objective**: Test all keyboard shortcuts

**Setup**: Have overlay window open with extracted text

**Test Matrix**:

| Shortcut | Expected Action | Result |
|----------|----------------|--------|
| Space | Toggle play/pause | ✓/✗ |
| ← | Previous phrase | ✓/✗ |
| → | Next phrase | ✓/✗ |
| S | Stop playback | ✓/✗ |
| Cmd+R | Recapture region | ✓/✗ |
| ESC | Close overlay | ✓/✗ |

**Pass Criteria**: ✓ All shortcuts work as expected

---

### TC11: Multi-Monitor Support

**Objective**: Test on multiple displays (if available)

**Setup**: Connect second monitor

**Steps**:
1. Move test content to secondary display
2. Open selection window
3. Verify crosshair appears on correct screen
4. Select region on secondary display
5. Confirm selection

**Expected Results**:
- Selection works on all displays
- Correct screen captured
- Overlay appears on correct display

**Pass Criteria**: ✓ Works on all connected displays

---

### TC12: Error Handling

**Objective**: Test error scenarios

**Test Scenarios**:

1. **No Text in Selection**:
   - Select blank area
   - Expected: Warning message, empty state UI

2. **Very Small Selection**:
   - Select <10x10px area
   - Expected: "Selection too small" or empty result

3. **Permission Denied Mid-Session**:
   - Revoke permission while app running
   - Expected: Graceful error, permission prompt

4. **Rapid Repeated Selections**:
   - Open/close selection 10 times rapidly
   - Expected: No crashes, clean state

**Pass Criteria**: ✓ No crashes, clear error messages

---

### TC13: Performance Testing

**Objective**: Measure system performance

**Metrics**:

| Operation | Target | Actual | Pass |
|-----------|--------|--------|------|
| Open selection window | <200ms | ___ | ✓/✗ |
| Screen capture | <500ms | ___ | ✓/✗ |
| OCR processing | <2000ms | ___ | ✓/✗ |
| Total time to ready | <3000ms | ___ | ✓/✗ |
| CPU usage (idle) | <5% | ___ | ✓/✗ |
| Memory usage | <100MB | ___ | ✓/✗ |

**Measurement Tools**:
- Activity Monitor (macOS)
- Console timestamps
- Built-in logging

**Pass Criteria**: ✓ All metrics within target range

---

### TC14: Integration Test

**Objective**: End-to-end workflow validation

**Scenario**: Read article from web browser

**Steps**:
1. Open web browser with article
2. Launch Porua from system tray
3. Click "Read from Screen..."
4. Select article title and first paragraph
5. Confirm selection
6. Verify text extraction accuracy
7. (Future) Click Play button
8. (Future) Verify TTS playback
9. (Future) Check text highlighting sync
10. Close overlay

**Expected Results**:
- Smooth workflow, no interruptions
- Accurate text extraction
- (Future) Clear audio playback
- (Future) Perfect highlight sync

**Pass Criteria**: ✓ Complete workflow without errors

---

## Validation Command Testing

Run the built-in validation from the app:

```javascript
// Open overlay window, then in browser DevTools console:
await invoke('overlay_run_validation')
```

Expected output:
```
✓ Permission check: true
✓ Found 1 display(s)
  - Display 0: 1920x1080
✓ Test capture successful (XXXXX bytes)
✓ OCR successful: XX chars, XX.X% confidence
```

## Regression Testing

When making changes, re-run:

1. All test cases marked as critical (TC1-TC10)
2. Automated validation: `./test-overlay.sh`
3. Quick smoke test: Select test-page.html Test 1

## Known Issues & Limitations

Document any issues found:

| Issue | Severity | Workaround | Status |
|-------|----------|------------|--------|
| Example: Emoji not recognized | Low | Expected behavior | Known |
| | | | |

## Test Report Template

```markdown
## Test Session Report

**Date**: YYYY-MM-DD
**Tester**: [Name]
**Build**: [Version/Commit]
**Platform**: macOS [Version]

### Summary
- Tests Passed: X/Y
- Critical Issues: N
- Minor Issues: M

### Test Results
- TC1: ✓ PASS
- TC2: ✓ PASS
- TC3: ✗ FAIL - [Description]
...

### Issues Found
1. [Description]
   - Severity: High/Medium/Low
   - Steps to reproduce
   - Expected vs Actual

### Recommendations
- [Action items]

### Sign-off
Tested by: [Name]
Approved: Yes/No
```

## Continuous Testing

For ongoing development:

1. Run `./test-overlay.sh` before each commit
2. Perform TC1-TC4 weekly
3. Full test suite before releases
4. User acceptance testing with real content

## Resources

- Test page: `wrapper/test-page.html`
- Validation script: `wrapper/test-overlay.sh`
- Logs: Check Console.app for Porua logs
- Screenshots: Save evidence of issues

---

**Questions or Issues?**
- Review OVERLAY_PROTOTYPE_README.md
- Check console logs for errors
- Run validation tests
- Verify permissions in System Preferences
