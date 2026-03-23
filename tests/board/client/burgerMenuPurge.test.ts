/**
 * @vitest-environment jsdom
 *
 * Tests for purge tasks behavior in burger menu
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initBurgerMenu } from '../../../src/board/client/burgerMenu';

vi.mock('../../../src/board/client/boardPolling', () => ({
  refreshBoardCards: vi.fn().mockResolvedValue(undefined),
}));

import { refreshBoardCards } from '../../../src/board/client/boardPolling';

function setupDOM(): void {
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
  vi.clearAllMocks();
  vi.mocked(refreshBoardCards).mockResolvedValue(undefined);
  setupDOM();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('burger menu purge tasks', () => {
  it('closes the purge modal immediately when confirm button is clicked', () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    initBurgerMenu();

    const purgeModal = document.getElementById('purge-confirm-modal')!;
    const purgeConfirmBtn = document.getElementById('purge-confirm-btn')!;

    purgeModal.classList.add('show');
    purgeConfirmBtn.click();

    expect(purgeModal.classList.contains('show')).toBe(false);
  });

  it('does not call location.reload() when confirm button is clicked', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    initBurgerMenu();

    const purgeConfirmBtn = document.getElementById('purge-confirm-btn')!;
    purgeConfirmBtn.click();

    await vi.waitFor(() => {
      expect(reloadMock).not.toHaveBeenCalled();
    });
  });

  it('calls refreshBoardCards after successful purge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    initBurgerMenu();

    const purgeConfirmBtn = document.getElementById('purge-confirm-btn')!;
    purgeConfirmBtn.click();

    await vi.waitFor(() => {
      expect(refreshBoardCards).toHaveBeenCalled();
    });
  });

  it('does not call refreshBoardCards when purge API returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Server error' }),
    } as unknown as Response);

    initBurgerMenu();

    const purgeConfirmBtn = document.getElementById('purge-confirm-btn')!;
    purgeConfirmBtn.click();

    // Wait a tick for the async execution
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(refreshBoardCards).not.toHaveBeenCalled();
  });

  it('does not call refreshBoardCards when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    initBurgerMenu();

    const purgeConfirmBtn = document.getElementById('purge-confirm-btn')!;
    purgeConfirmBtn.click();

    // Wait a tick for the async execution
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(refreshBoardCards).not.toHaveBeenCalled();
  });

  it('does not display purge count after successful purge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 5 }),
    } as unknown as Response);

    initBurgerMenu();

    const purgeConfirmBtn = document.getElementById('purge-confirm-btn')!;
    const purgeResultEl = document.getElementById('purge-result')!;
    purgeConfirmBtn.click();

    await vi.waitFor(() => {
      expect(purgeResultEl.textContent).toBe('');
    });
  });
});
