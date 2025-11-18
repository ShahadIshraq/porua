# Screen Capture Feature

## Overview

The Porua application now includes a built-in screen capture tool that allows you to capture any rectangular area of your screen with a simple keyboard shortcut or tray menu click.

## Features

✓ **Global Keyboard Shortcut** - Press `Ctrl+Shift+S` from anywhere to start capture
✓ **System Tray Integration** - Click "Capture Screen Area" in the tray menu
✓ **Interactive Selection** - Click and drag to select any region
✓ **Real-time Feedback** - See dimensions as you select
✓ **Instant Preview** - Review your capture before saving
✓ **Save Anywhere** - Choose your own location and filename
✓ **Multi-Monitor Support** - Works across multiple displays
✓ **High-DPI Aware** - Handles different screen scaling correctly

## How to Use

### Method 1: Keyboard Shortcut (Recommended)

1. Press `Ctrl+Shift+S` from anywhere
2. Your screen will dim with a semi-transparent overlay
3. Click and drag to select the area you want to capture
4. Release the mouse to complete the capture
5. A preview window will open showing your captured image
6. Click "Save As..." to save the image to your preferred location

### Method 2: System Tray Menu

1. Click the Porua icon in your system tray
2. Select "Capture Screen Area" from the menu
3. Follow steps 2-6 from Method 1

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Start screen capture |
| `ESC` | Cancel capture / Close preview |
| `Tab` | Navigate between buttons in preview |
| `Enter` | Activate selected button |

## Preview Window Controls

Once you've captured an area, the preview window shows three buttons:

### Recapture
Click to close the preview and start a new capture. Useful if you didn't get the perfect shot.

### Save As...
Opens a file dialog to save your capture. Default filename format: `screenshot.png`

### Close
Closes the preview window without saving. The temporary capture file is retained in your system's temp folder.

## Tips & Tricks

### Precise Selection
- Hold `Shift` while dragging for more controlled selection (feature pending)
- The dimensions tooltip shows the exact size in real-time
- Minimum selection size is 10×10 pixels

### Multi-Monitor Setup
- The overlay spans all your monitors automatically
- You can capture from any monitor
- You can even capture across monitor boundaries

### Quick Recapture
- If your first capture isn't quite right, just click "Recapture"
- No need to close and restart

### Save Multiple Copies
- You can click "Save As..." multiple times to save the same capture with different names or locations
- Useful for saving to multiple destinations

## Technical Details

### File Format
- Captures are saved as PNG (Portable Network Graphics)
- Lossless compression ensures high quality
- Supports transparency (though captures are opaque by default)

### Storage Location
- Temporary captures: System temp directory (e.g., `/tmp` on macOS/Linux, `%TEMP%` on Windows)
- Saved captures: Your choice via the save dialog
- Temporary files are cleaned up periodically

### Performance
- Captures are fast and non-blocking
- Works during high system load
- Memory usage remains stable even with many captures

### Compatibility
- **Windows**: Windows 10 and later
- **macOS**: macOS 11.0 (Big Sur) and later
- **Linux**: Most modern distributions (requires X11 or Wayland)

## Troubleshooting

### "Selection too small" Error
**Problem:** You see a red error message saying the selection is too small.

**Solution:** Make sure your selection is at least 10×10 pixels. The selection box will turn red if it's too small.

### Keyboard Shortcut Not Working
**Problem:** Pressing `Ctrl+Shift+S` doesn't open the capture overlay.

**Solutions:**
- Check if another application is using the same shortcut
- Look for "Global shortcut Ctrl+Shift+S registered successfully" in the logs
- Try using the tray menu method instead
- Restart the application

### Capture Shows Wrong Area
**Problem:** The captured image doesn't match what you selected.

**Solutions:**
- This is rare but can occur on some high-DPI setups
- Try capturing at 100% display scaling
- Report the issue with your display configuration

### Preview Window Doesn't Open
**Problem:** After selecting an area, the preview window doesn't appear.

**Solutions:**
- Check console logs for errors
- Try capturing again
- Ensure sufficient disk space for temporary files
- Restart the application

### Save Dialog Doesn't Open
**Problem:** Clicking "Save As..." doesn't show the dialog.

**Solutions:**
- Check if dialogs are blocked by your OS settings
- Ensure the application has necessary permissions
- Try saving to a different location

## Privacy & Security

### What Gets Captured
- Only the visible content within your selected area
- No hidden windows or off-screen content
- No metadata about other applications

### Where Data Goes
- Temporary captures stored in system temp directory
- Saved captures go only to locations you choose
- No uploads or cloud storage - everything stays local

### Permissions Required
- Screen recording permission (on macOS)
- File system access for saving captures
- No network access required for capture feature

## Limitations

### Current Limitations
- Selection requires mouse input (no keyboard-only selection yet)
- No built-in editing or annotation tools
- No video capture (screenshots only)
- No automatic capture scheduling
- No OCR or text extraction (planned for future)

### Known Issues
- Very rare capture failures on some Linux distributions with Wayland
- Shortcut may conflict with other applications using `Ctrl+Shift+S`
- Preview window may open on wrong monitor in some multi-monitor setups

## Frequently Asked Questions

**Q: Can I change the keyboard shortcut?**

A: Not currently. The shortcut is fixed to `Ctrl+Shift+S`. Custom shortcuts may be added in a future update.

**Q: Can I capture a specific window instead of selecting a region?**

A: Not directly. You'll need to manually select the window area. Window-specific capture may be added in the future.

**Q: Are my captures saved automatically?**

A: No. Captures are stored temporarily until you explicitly save them using the "Save As..." button. This gives you control over what to keep.

**Q: Can I capture my entire screen with one click?**

A: Yes! Select from one corner of your screen to the opposite corner. Or use the preview to capture all monitors at once.

**Q: Does this work while playing full-screen games?**

A: It depends on the game. Some full-screen games block overlays. Try using windowed mode or borderless windowed mode instead.

**Q: Can I capture my cursor in the screenshot?**

A: No, the cursor is not included in captures. This is intentional to avoid cursor artifacts in screenshots.

**Q: Is there a capture history?**

A: Not currently. Each capture exists independently. You must save captures you want to keep.

## Future Enhancements

Planned features for future releases:

- **Quick Save**: Save to clipboard or predefined location with one click
- **Annotations**: Basic drawing and text tools in preview
- **OCR Integration**: Extract text from captures using the TTS engine
- **Capture History**: Recent captures panel
- **Timed Capture**: Delay before capture starts
- **Scrolling Capture**: Capture entire scrollable areas
- **Custom Shortcuts**: User-configurable keyboard shortcuts
- **Quick Edit**: Crop and basic adjustments in preview

## Getting Help

If you encounter issues or have suggestions:

1. Check this documentation first
2. Look for error messages in the application logs
3. Visit the project repository: [https://github.com/ShahadIshraq/porua](https://github.com/ShahadIshraq/porua)
4. Open an issue with details about your problem
5. Include your OS version, display configuration, and any error messages

## Version History

**Version 0.2.0** (Current)
- Initial release of screen capture feature
- Global keyboard shortcut (Ctrl+Shift+S)
- System tray integration
- Interactive selection overlay
- Preview window with save functionality
- Multi-monitor support
- High-DPI awareness

---

**Built with ❤️ by the Porua Team**
