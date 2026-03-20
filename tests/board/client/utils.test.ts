/**
 * @vitest-environment jsdom
 *
 * Tests for board client utils module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtmlClient, relativeTime, showToast } from '../../../src/board/client/utils';

describe('escapeHtmlClient', () => {
  it('returns empty string for null', () => {
    expect(escapeHtmlClient(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escapeHtmlClient(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(escapeHtmlClient('')).toBe('');
  });

  it('returns the string unchanged when no HTML entities present', () => {
    expect(escapeHtmlClient('hello world')).toBe('hello world');
  });

  it('escapes < and > characters', () => {
    const result = escapeHtmlClient('<script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  it('escapes & character', () => {
    const result = escapeHtmlClient('a & b');
    expect(result).toContain('&amp;');
  });

  it('preserves double quotes (DOM textContent does not escape them)', () => {
    // The jsdom implementation uses div.textContent + innerHTML which escapes
    // <, >, & but NOT double quotes (browsers keep them as-is in text nodes)
    const result = escapeHtmlClient('"quoted"');
    expect(result).toContain('"quoted"');
  });
});

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for null', () => {
    expect(relativeTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(relativeTime(undefined)).toBe('');
  });

  it('returns "just now" for times less than 60 seconds ago', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const iso = new Date(now - 30 * 1000).toISOString();
    expect(relativeTime(iso)).toBe('just now');
  });

  it('returns minutes ago for times between 1 and 59 minutes ago', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const iso = new Date(now - 5 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe('5m ago');
  });

  it('returns hours ago for times between 1 and 23 hours ago', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const iso = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe('3h ago');
  });

  it('returns days ago for times between 1 and 29 days ago', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const iso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe('7d ago');
  });

  it('returns months ago for times between 1 and 11 months ago', () => {
    const now = new Date('2026-06-01T12:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const iso = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe('2mo ago');
  });

  it('returns years ago for times 12 or more months ago', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const iso = new Date(now - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe('1y ago');
  });
});

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast" class="toast">Default message</div>';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds "show" class to the toast element', () => {
    showToast();
    const toast = document.getElementById('toast')!;
    expect(toast.classList.contains('show')).toBe(true);
  });

  it('updates toast text when message is provided', () => {
    showToast('Custom error message');
    const toast = document.getElementById('toast')!;
    expect(toast.textContent).toBe('Custom error message');
  });

  it('does not crash when toast element does not exist', () => {
    document.body.innerHTML = '';
    expect(() => showToast('test')).not.toThrow();
  });

  it('removes "show" class after 3 seconds', () => {
    showToast();
    const toast = document.getElementById('toast')!;
    expect(toast.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(toast.classList.contains('show')).toBe(false);
  });
});
