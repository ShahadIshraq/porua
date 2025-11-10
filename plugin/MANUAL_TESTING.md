# Manual Testing Guide - Issue #60 Fix

## Test Case: Cloudflare Blog (Nested List Items)

### Objective
Verify that list items with nested paragraphs are no longer read twice.

### Test URL
https://blog.cloudflare.com/how-we-found-a-bug-in-gos-arm64-compiler/

### Setup
1. Build the extension:
   ```bash
   cd plugin
   npm install
   npm run build
   ```

2. Load the extension in your browser:
   - **Chrome**: `chrome://extensions` → Enable "Developer mode" → "Load unpacked" → select `plugin/` directory
   - **Firefox**: `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `plugin/manifest.json`

3. Configure the extension:
   - Click the Porua extension icon
   - Enter server URL: `http://localhost:3000` (ensure server is running)
   - Select a voice and save

### Test Steps

#### 1. Navigate to the Test Page
Open: https://blog.cloudflare.com/how-we-found-a-bug-in-gos-arm64-compiler/

#### 2. Locate the Ordered List
Scroll down to the section with the ordered list containing:
1. "All of the fatal panics happen within stack unwinding."
2. "We correlated an increased volume of recovered panics with these fatal panics."
3. "Recovering a panic unwinds goroutine stacks to call deferred functions."
4. (Go issue #73259 reference)
5. "Let's stop using panic/recover for error handling and wait out the upstream fix?"

#### 3. Test Single List Item
- Hover over the **first list item** ("All of the fatal panics...")
- Click the play button ▶
- **Expected**: Item is read **once**
- **Previously**: Item was read **twice** (once for `<li>`, once for nested `<p>`)

#### 4. Test Continuous Playback
- Hover over the **first list item** again
- Click play and let it continue through multiple list items
- **Expected**: Each item is read **once** in sequence
- **Previously**: Each item was read **twice** before moving to the next

#### 5. Verify Play Button Visibility
- Hover over each list item
- **Expected**: Play button appears **once** per list item (on the `<li>`)
- **Previously**: May have shown multiple buttons (one for `<li>`, one for `<p>`)

### HTML Structure Being Tested

The Cloudflare blog uses this structure:
```html
<ol>
  <li>
    <p>All of the fatal panics happen within stack unwinding.</p>
  </li>
  <li>
    <p>We correlated an increased volume of recovered panics...</p>
  </li>
  <!-- etc -->
</ol>
```

The fix ensures that when both `<li>` and nested `<p>` are selected by `querySelectorAll("p, li, ...")`, only the outer `<li>` is kept.

---

## Additional Test Cases

### Test Case 2: Blockquote with Nested Paragraph

1. Find any `<blockquote>` element on the web (or create a test page)
2. Structure: `<blockquote><p>Quote text</p></blockquote>`
3. Click play on the blockquote
4. **Expected**: Quote is read **once**

### Test Case 3: Standalone Paragraphs (Regression Test)

1. Navigate to any blog with simple `<p>` tags (e.g., Medium article)
2. Click play on a standalone paragraph
3. **Expected**: Paragraph is read **once** (should work as before)
4. **Purpose**: Ensure the fix doesn't break normal paragraph reading

### Test Case 4: Mixed Content

1. Find a page with both:
   - Standalone `<p>` elements
   - List items `<li>` with nested `<p>` elements
2. Play through multiple elements using continuous playback
3. **Expected**: Each element read exactly once, in order

---

## Success Criteria

✅ All tests pass with expected behavior
✅ No duplicate readings on Cloudflare blog
✅ Standalone paragraphs still work correctly
✅ Continuous playback flows smoothly without repeats
✅ No console errors during testing

---

## Performance Check

On pages with many readable elements (100+):
- Open browser DevTools → Performance tab
- Start recording
- Click play on an element with many following paragraphs
- Stop recording after 2-3 seconds
- Check for performance issues in the `getFollowingParagraphs()` function
- **Expected**: Should complete in < 50ms even with 100+ elements

---

## Debugging Tips

If issues occur:

1. **Check console logs**:
   ```javascript
   // In browser console, test the filter function:
   const all = document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote');
   console.log('Total elements:', all.length);
   // After filtering should be fewer if nested elements exist
   ```

2. **Inspect DOM structure**:
   - Right-click on a list item → "Inspect"
   - Verify the HTML structure matches expected nesting

3. **Verify extension is loaded**:
   - Check for play buttons appearing on hover
   - Check extension icon shows correct status

---

## Reporting Results

When reporting test results, please include:
- ✅ or ❌ for each test case
- Browser and version tested
- Any console errors encountered
- Screenshots/video if issues found
