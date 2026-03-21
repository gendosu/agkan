/**
 * @vitest-environment jsdom
 *
 * Tests for dark mode integration in burger menu
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initBurgerMenu } from '../../../src/board/client/burgerMenu';

function setupDOM(): void {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = `
    <button id="burger-menu-btn">Menu</button>
    <div id="burger-menu-dropdown">
      <div class="burger-menu-item danger" id="burger-purge-tasks">Purge Tasks</div>
      <div class="burger-menu-item" id="burger-version-info">Version Info</div>
      <div class="burger-menu-separator"></div>
      <div class="burger-menu-item" id="burger-theme-dark">Dark Mode</div>
      <div class="burger-menu-item" id="burger-theme-light">Light Mode</div>
      <div class="burger-menu-item" id="burger-theme-system">&#10003; System Setting</div>
    </div>
    <div class="modal-overlay" id="purge-confirm-modal">
      <div class="modal">
        <p id="purge-result"></p>
        <div class="modal-actions">
          <button id="purge-cancel-btn">Cancel</button>
          <button id="purge-confirm-btn">Purge</button>
        </div>
      </div>
    </div>
    <div class="modal-overlay" id="version-info-modal">
      <div class="modal">
        <p id="version-info-text"></p>
        <div class="modal-actions">
          <button id="version-info-close">Close</button>
        </div>
      </div>
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

describe('burger menu dark mode items', () => {
  it('clicking Dark Mode sets data-theme to dark', () => {
    initBurgerMenu();
    document.getElementById('burger-theme-dark')!.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('clicking Light Mode sets data-theme to light', () => {
    initBurgerMenu();
    document.getElementById('burger-theme-light')!.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('clicking System Setting removes data-theme attribute', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    initBurgerMenu();
    document.getElementById('burger-theme-system')!.click();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('clicking Dark Mode does not save to localStorage', () => {
    initBurgerMenu();
    document.getElementById('burger-theme-dark')!.click();
    expect(localStorage.getItem('agkan-theme')).toBeNull();
  });

  it('clicking Light Mode does not save to localStorage', () => {
    initBurgerMenu();
    document.getElementById('burger-theme-light')!.click();
    expect(localStorage.getItem('agkan-theme')).toBeNull();
  });

  it('clicking System Setting does not modify localStorage', () => {
    initBurgerMenu();
    document.getElementById('burger-theme-system')!.click();
    expect(localStorage.getItem('agkan-theme')).toBeNull();
  });
});
