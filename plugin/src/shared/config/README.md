# Readable Elements Configuration

This module provides centralized configuration for HTML elements that can be read aloud by the TTS system.

## Current Supported Tags

- **Paragraphs**: `<p>`
- **Headings**: `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`
- **List Items**: `<li>` (both ordered and unordered lists)
- **Block Quotes**: `<blockquote>`

## How to Add New Tag Types

Adding support for new HTML tags is straightforward and requires changes in only one location.

### Step 1: Update Configuration

Edit `readableElements.js` and add the new tag name (in UPPERCASE) to the `tags` array:

```javascript
export const READABLE_ELEMENTS_CONFIG = {
  tags: [
    'P',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI',
    'BLOCKQUOTE',
    'FIGCAPTION',  // ← Add new tag here
    'DD'           // ← Or here
  ],
  minTextLength: 10
};
```

### Step 2: Test Your Changes

That's it! The new tags will automatically be:
- Detected by the play button hover system
- Included in continuous playback queue
- Validated for minimum text length
- Checked for visibility

### Step 3: Add Tests (Recommended)

Add test cases to verify the new tag type works correctly:

```javascript
// In readableElements.test.js
it('should return true for figcaption elements', () => {
  const figcaption = document.createElement('figcaption');
  expect(isReadableTag(figcaption)).toBe(true);
});
```

## Configuration Options

### `minTextLength`

Minimum number of characters required for an element to trigger the play button.

**Default**: 10 characters

**Adjusting**: Change the value in `READABLE_ELEMENTS_CONFIG`:

```javascript
export const READABLE_ELEMENTS_CONFIG = {
  tags: [...],
  minTextLength: 15  // Require 15 characters instead of 10
};
```

## Helper Functions

### `isReadableTag(element)`
Checks if an element's tag type is in the readable tags list.

### `hasMinimumTextContent(element)`
Checks if an element has sufficient text content (trims whitespace).

### `isElementVisible(element)`
Checks if an element is visible (not `display: none`, `visibility: hidden`, or `aria-hidden="true"`).

### `shouldShowPlayButton(element)`
**Main validation function** - Returns true only if ALL conditions are met:
- Element is a readable tag type
- Element has minimum text content
- Element is visible

### `getReadableElementsSelector()`
Returns a CSS selector string for all readable elements (e.g., `"p, h1, h2, h3, li, blockquote"`).
Useful for `document.querySelectorAll()`.

### `filterReadableElements(elements)`
Filters an array of elements to include only readable ones with sufficient text.

## Usage Examples

### In Play Button Detection
```javascript
import { shouldShowPlayButton } from '../shared/config/readableElements.js';

element.addEventListener('mouseenter', (e) => {
  if (shouldShowPlayButton(e.target)) {
    showPlayButton(e.target);
  }
});
```

### In Continuous Playback Queue
```javascript
import { getReadableElementsSelector, filterReadableElements } from '../shared/config/readableElements.js';

const allElements = document.querySelectorAll(getReadableElementsSelector());
const readableElements = filterReadableElements(Array.from(allElements));
```

## Advanced: Tag-Specific Configuration (Future Enhancement)

The configuration can be extended to support per-tag settings:

```javascript
export const READABLE_ELEMENTS_CONFIG = {
  tags: ['P', 'H1', 'H2', 'LI', 'BLOCKQUOTE'],
  minTextLength: 10,

  // Future: Tag-specific overrides
  tagSpecificConfig: {
    'H1': { minTextLength: 5 },  // Headings can be shorter
    'DIV': {
      minTextLength: 50,          // Divs need more text
      requireClass: ['article-content', 'post-body']  // And specific classes
    }
  }
};
```

This would allow fine-grained control over different element types while maintaining a clean API.

## Testing

Run tests for the configuration module:

```bash
npm test -- readableElements.test.js
```

Run integration tests:

```bash
npm test -- readable-tags.test.js
```

Run all tests:

```bash
npm test
```
