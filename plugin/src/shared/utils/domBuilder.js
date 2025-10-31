/**
 * Safe DOM building utilities to replace innerHTML
 */

/**
 * Create an element with optional className, attributes, and children
 * @param {string} tag - HTML tag name
 * @param {string|Object} classNameOrOptions - Class name string or options object
 * @param {Array|Element|string} children - Child elements or text content
 * @returns {HTMLElement}
 */
export function createElement(tag, classNameOrOptions, children) {
  const element = document.createElement(tag);

  // Handle className as string or options object
  if (typeof classNameOrOptions === 'string') {
    if (classNameOrOptions) {
      element.className = classNameOrOptions;
    }
  } else if (classNameOrOptions && typeof classNameOrOptions === 'object') {
    const { className, id, type, ...attrs } = classNameOrOptions;

    if (className) element.className = className;
    if (id) element.id = id;
    if (type) element.type = type;

    // Set other attributes
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) {
        element.setAttribute(key, value);
      }
    }
  }

  // Handle children
  if (children !== undefined) {
    appendChildren(element, children);
  }

  return element;
}

/**
 * Append children to an element
 * @param {HTMLElement} parent
 * @param {Array|Element|string|number} children
 */
export function appendChildren(parent, children) {
  if (Array.isArray(children)) {
    children.forEach(child => appendChildren(parent, child));
  } else if (children instanceof Element) {
    parent.appendChild(children);
  } else if (children !== null && children !== undefined) {
    parent.appendChild(document.createTextNode(String(children)));
  }
}

/**
 * Clear all children from an element
 * @param {HTMLElement} element
 */
export function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Replace element content with new children
 * @param {HTMLElement} element
 * @param {Array|Element|string} children
 */
export function replaceContent(element, children) {
  clearElement(element);
  appendChildren(element, children);
}
