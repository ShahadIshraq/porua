## 🐛 Fix: Prevent Duplicate List Items

**Fixes #60**

---

## 🔍 Root Cause

The plugin's element selector matches **both parent and child readable elements**, causing duplicates on pages with nested structures:

- `querySelectorAll("p, li, ...")` selects both parent AND child elements
- On pages like Cloudflare blog with `<li><p>text</p></li>` structure
- Both `<li>` and nested `<p>` have identical `textContent`
- This caused the same text to appear twice in the playback queue

**Example from Cloudflare blog:**
```html
<ol>
  <li><p>All of the fatal panics happen within stack unwinding.</p></li>
  <li><p>We correlated an increased volume of recovered panics.</p></li>
</ol>
```
Both the `<li>` and `<p>` elements were being read aloud → **duplicate content** 🔄

---

## ✅ Solution

Added nested element deduplication to `filterReadableElements()`:

### New Functions

**`isNestedWithinAnother(element, elements)`**
- Checks if an element is contained within another element from the same list
- Returns `true` if nested, `false` if outermost

**`removeNestedElements(elements)`**
- Filters out elements that are nested within other readable elements
- Keeps only the outermost readable element in nested hierarchies

### Updated Behavior

`filterReadableElements()` now performs two-stage filtering:
1. ✅ Filter by readability criteria (tag type + minimum text length)
2. ✅ Remove nested elements to avoid duplicates

---

## 📝 Examples

| Structure | Before | After |
|-----------|--------|-------|
| `<li><p>text</p></li>` | Both `<li>` and `<p>` | ✅ Only `<li>` |
| `<blockquote><p>text</p></blockquote>` | Both elements | ✅ Only `<blockquote>` |
| `<p>text</p>` (standalone) | `<p>` | ✅ `<p>` (unaffected) |

---

## 🧪 Testing

### New Tests: **24 comprehensive test cases**

**`isNestedWithinAnother()`**
- ✅ Detects nested elements correctly
- ✅ Handles multiple nesting levels
- ✅ Returns false for outermost elements
- ✅ Handles edge cases (null, undefined, empty arrays)

**`removeNestedElements()`**
- ✅ Removes nested `<p>` inside `<li>`
- ✅ Removes nested `<p>` inside `<blockquote>`
- ✅ Keeps all elements when none are nested
- ✅ **Real-world Cloudflare blog scenario** (multiple `<li><p>` structures)
- ✅ Deeply nested structures
- ✅ Mix of nested and non-nested elements

**`filterReadableElements()` integration**
- ✅ End-to-end deduplication
- ✅ Real-world nested list scenarios
- ✅ Standalone paragraphs remain unaffected

### Results
```
✓ 69 tests in elementValidation.test.js
✓ 1209 tests total (all passing)
✓ No regressions
```

---

## 📁 Files Changed

| File | Changes |
|------|---------|
| `plugin/src/shared/utils/elementValidation.js` | +45 lines (new functions + updated filter) |
| `plugin/tests/unit/shared/utils/elementValidation.test.js` | +249 lines (24 new tests) |

---

## 🎯 Impact

- ✅ Fixes duplicate readings on Cloudflare blog and similar sites
- ✅ No breaking changes or regressions
- ✅ Performance: O(n²) complexity acceptable for typical page content
- ✅ Reusable, well-documented utility functions
- ✅ Comprehensive test coverage

---

## 🔗 Related

- Issue: #60
- Affected site: https://blog.cloudflare.com/how-we-found-a-bug-in-gos-arm64-compiler/
