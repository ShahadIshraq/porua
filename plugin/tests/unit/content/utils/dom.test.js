import { describe, it, expect, beforeEach } from 'vitest';
import { escapeHtml, createElement, getScrollPosition } from '../../../../src/content/utils/dom.js';

describe('escapeHtml', () => {
  it('should escape script tags', () => {
    const input = '<script>alert("xss")</script>';
    const output = escapeHtml(input);
    expect(output).not.toContain('<script>');
    expect(output).toContain('&lt;script&gt;');
  });

  it('should escape HTML entities', () => {
    const input = '<div class="test">Hello & goodbye</div>';
    const output = escapeHtml(input);
    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
    expect(output).toContain('&amp;');
  });

  it('should escape angle brackets', () => {
    const input = '5 < 10 && 20 > 15';
    const output = escapeHtml(input);
    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
  });

  it('should handle text with quotes', () => {
    const input = 'He said "hello"';
    const output = escapeHtml(input);
    // textContent doesn't escape quotes, only innerHTML special chars
    expect(output).toBe('He said "hello"');
  });

  it('should handle empty strings', () => {
    const output = escapeHtml('');
    expect(output).toBe('');
  });

  it('should handle plain text without special characters', () => {
    const input = 'Hello World';
    const output = escapeHtml(input);
    expect(output).toBe('Hello World');
  });
});

describe('createElement', () => {
  it('should create element with tag name', () => {
    const element = createElement('div');
    expect(element.tagName).toBe('DIV');
  });

  it('should create element with className', () => {
    const element = createElement('div', 'test-class');
    expect(element.className).toBe('test-class');
  });

  it('should create element without className when not provided', () => {
    const element = createElement('div');
    expect(element.className).toBe('');
  });

  it('should set attributes correctly', () => {
    const element = createElement('div', 'test', {
      id: 'my-id',
      'data-test': 'value'
    });
    expect(element.getAttribute('id')).toBe('my-id');
    expect(element.getAttribute('data-test')).toBe('value');
  });

  it('should create element with multiple attributes', () => {
    const element = createElement('a', '', {
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener'
    });
    expect(element.getAttribute('href')).toBe('https://example.com');
    expect(element.getAttribute('target')).toBe('_blank');
    expect(element.getAttribute('rel')).toBe('noopener');
  });

  it('should handle empty attributes object', () => {
    const element = createElement('div', 'test', {});
    expect(element.className).toBe('test');
    expect(element.tagName).toBe('DIV');
  });

  it('should create different element types', () => {
    const div = createElement('div');
    const span = createElement('span');
    const button = createElement('button');

    expect(div.tagName).toBe('DIV');
    expect(span.tagName).toBe('SPAN');
    expect(button.tagName).toBe('BUTTON');
  });
});

describe('getScrollPosition', () => {
  beforeEach(() => {
    // Reset scroll position
    Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true });
    Object.defineProperty(window, 'pageXOffset', { value: 0, writable: true });
    Object.defineProperty(document.documentElement, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(document.documentElement, 'scrollLeft', { value: 0, writable: true });
  });

  it('should return scroll position object', () => {
    const position = getScrollPosition();
    expect(position).toHaveProperty('top');
    expect(position).toHaveProperty('left');
  });

  it('should return pageYOffset and pageXOffset when available', () => {
    Object.defineProperty(window, 'pageYOffset', { value: 100, writable: true });
    Object.defineProperty(window, 'pageXOffset', { value: 50, writable: true });

    const position = getScrollPosition();
    expect(position.top).toBe(100);
    expect(position.left).toBe(50);
  });

  it('should fallback to documentElement scroll values', () => {
    Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true });
    Object.defineProperty(window, 'pageXOffset', { value: 0, writable: true });
    Object.defineProperty(document.documentElement, 'scrollTop', { value: 200, writable: true });
    Object.defineProperty(document.documentElement, 'scrollLeft', { value: 150, writable: true });

    const position = getScrollPosition();
    expect(position.top).toBe(200);
    expect(position.left).toBe(150);
  });

  it('should return zero values when not scrolled', () => {
    const position = getScrollPosition();
    expect(position.top).toBe(0);
    expect(position.left).toBe(0);
  });
});
