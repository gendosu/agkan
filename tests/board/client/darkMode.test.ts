/**
 * @vitest-environment jsdom
 *
 * Tests for board client darkMode module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getThemePreference,
  applyTheme,
  saveThemePreference,
  clearThemePreference,
  getCurrentEffectiveTheme,
} from '../../../src/board/client/darkMode';

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
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  setupDOM();
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('getThemePreference', () => {
  it('returns null when no preference is stored', () => {
    expect(getThemePreference()).toBeNull();
  });

  it('returns stored dark preference', () => {
    localStorage.setItem('agkan-theme', 'dark');
    expect(getThemePreference()).toBe('dark');
  });

  it('returns stored light preference', () => {
    localStorage.setItem('agkan-theme', 'light');
    expect(getThemePreference()).toBe('light');
  });
});

describe('saveThemePreference', () => {
  it('saves dark preference to localStorage', () => {
    saveThemePreference('dark');
    expect(localStorage.getItem('agkan-theme')).toBe('dark');
  });

  it('saves light preference to localStorage', () => {
    saveThemePreference('light');
    expect(localStorage.getItem('agkan-theme')).toBe('light');
  });
});

describe('clearThemePreference', () => {
  it('removes preference from localStorage', () => {
    localStorage.setItem('agkan-theme', 'dark');
    clearThemePreference();
    expect(localStorage.getItem('agkan-theme')).toBeNull();
  });
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

describe('getCurrentEffectiveTheme', () => {
  it('returns stored preference when set to dark', () => {
    localStorage.setItem('agkan-theme', 'dark');
    expect(getCurrentEffectiveTheme()).toBe('dark');
  });

  it('returns stored preference when set to light', () => {
    localStorage.setItem('agkan-theme', 'light');
    expect(getCurrentEffectiveTheme()).toBe('light');
  });

  it('returns system preference dark when no stored preference and system is dark', () => {
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

  it('returns system preference light when no stored preference and system is light', () => {
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
