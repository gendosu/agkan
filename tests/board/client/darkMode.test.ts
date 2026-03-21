/**
 * @vitest-environment jsdom
 *
 * Tests for board client darkMode module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyTheme, getCurrentEffectiveTheme, loadThemeFromServer } from '../../../src/board/client/darkMode';

function setupDOM(): void {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = `
    <div id="burger-menu-dropdown">
      <div class="burger-menu-item" id="burger-theme-dark">Dark Mode</div>
      <div class="burger-menu-item" id="burger-theme-light">Light Mode</div>
      <div class="burger-menu-item" id="burger-theme-system">System Setting</div>
    </div>
  `;
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  setupDOM();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('applyTheme', () => {
  it('sets data-theme="dark" on html element for dark mode', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-theme="light" on html element for light mode', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes data-theme attribute for system mode', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('loadThemeFromServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns dark theme from server config', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ board: { theme: 'dark' } }), { status: 200 })
    );
    const result = await loadThemeFromServer();
    expect(result).toBe('dark');
  });

  it('returns light theme from server config', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ board: { theme: 'light' } }), { status: 200 })
    );
    const result = await loadThemeFromServer();
    expect(result).toBe('light');
  });

  it('returns system theme from server config', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ board: { theme: 'system' } }), { status: 200 })
    );
    const result = await loadThemeFromServer();
    expect(result).toBe('system');
  });

  it('returns null when theme is not set in server config', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ board: {} }), { status: 200 }));
    const result = await loadThemeFromServer();
    expect(result).toBeNull();
  });

  it('returns null when server returns invalid theme', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ board: { theme: 'invalid' } }), { status: 200 })
    );
    const result = await loadThemeFromServer();
    expect(result).toBeNull();
  });

  it('returns null when server request fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const result = await loadThemeFromServer();
    expect(result).toBeNull();
  });

  it('returns null when server returns non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
    );
    const result = await loadThemeFromServer();
    expect(result).toBeNull();
  });
});

describe('getCurrentEffectiveTheme', () => {
  it('returns dark when data-theme is set to dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(getCurrentEffectiveTheme()).toBe('dark');
  });

  it('returns light when data-theme is set to light', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(getCurrentEffectiveTheme()).toBe('light');
  });

  it('returns system preference dark when no data-theme and system is dark', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    expect(getCurrentEffectiveTheme()).toBe('dark');
  });

  it('returns system preference light when no data-theme and system is light', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    expect(getCurrentEffectiveTheme()).toBe('light');
  });
});
