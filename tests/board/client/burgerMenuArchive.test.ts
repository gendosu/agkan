/**
 * @vitest-environment jsdom
 *
 * Tests for archive tasks behavior in burger menu
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
      <div class="burger-menu-item danger" id="burger-archive-tasks">Archive Tasks</div>
      <div class="burger-menu-item danger" id="burger-purge-tasks">Purge Tasks</div>
      <div class="burger-menu-item" id="burger-version-info">Version Info</div>
      <div class="burger-menu-separator"></div>
      <div class="burger-menu-item" id="burger-theme-dark">Dark Mode</div>
      <div class="burger-menu-item" id="burger-theme-light">Light Mode</div>
      <div class="burger-menu-item" id="burger-theme-system">&#10003; System Setting</div>
    </div>
    <div class="modal-overlay" id="archive-confirm-modal">
      <div class="modal">
        <p id="archive-result"></p>
        <div class="modal-actions">
          <button id="archive-cancel-btn">Cancel</button>
          <button id="archive-confirm-btn">Archive</button>
        </div>
      </div>
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

describe('burger menu archive tasks', () => {
  it('closes the archive modal after API completes, not before', async () => {
    let resolveArchive!: () => void;
    const archivePromise = new Promise<void>((resolve) => {
      resolveArchive = resolve;
    });

    global.fetch = vi.fn().mockReturnValue(
      archivePromise.then(() => ({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 3 }),
      }))
    );

    initBurgerMenu();

    const archiveModal = document.getElementById('archive-confirm-modal')!;
    const archiveConfirmBtn = document.getElementById('archive-confirm-btn')!;

    archiveModal.classList.add('show');
    archiveConfirmBtn.click();

    // Modal should still be open while archive API is pending
    expect(archiveModal.classList.contains('show')).toBe(true);

    // Resolve the archive API
    resolveArchive();
    await vi.waitFor(() => {
      expect(archiveModal.classList.contains('show')).toBe(false);
    });
  });

  it('calls refreshBoardCards after successful archive', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 3 }),
    } as unknown as Response);

    initBurgerMenu();

    const archiveConfirmBtn = document.getElementById('archive-confirm-btn')!;
    archiveConfirmBtn.click();

    await vi.waitFor(() => {
      expect(refreshBoardCards).toHaveBeenCalled();
    });
  });

  it('displays error message in archive-result when archive API returns non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Server error' }),
    } as unknown as Response);

    initBurgerMenu();

    const archiveConfirmBtn = document.getElementById('archive-confirm-btn')!;
    const archiveResultEl = document.getElementById('archive-result')!;
    archiveConfirmBtn.click();

    await vi.waitFor(() => {
      expect(archiveResultEl.textContent).not.toBe('');
    });
    expect(archiveResultEl.style.color).toBe('rgb(220, 38, 38)');
  });

  it('displays error message in archive-result when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    initBurgerMenu();

    const archiveConfirmBtn = document.getElementById('archive-confirm-btn')!;
    const archiveResultEl = document.getElementById('archive-result')!;
    archiveConfirmBtn.click();

    await vi.waitFor(() => {
      expect(archiveResultEl.textContent).not.toBe('');
    });
    expect(archiveResultEl.style.color).toBe('rgb(220, 38, 38)');
  });

  it('does not close the archive modal when archive API fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Server error' }),
    } as unknown as Response);

    initBurgerMenu();

    const archiveModal = document.getElementById('archive-confirm-modal')!;
    const archiveConfirmBtn = document.getElementById('archive-confirm-btn')!;

    archiveModal.classList.add('show');
    archiveConfirmBtn.click();

    await vi.waitFor(() => {
      expect(document.getElementById('archive-result')!.textContent).not.toBe('');
    });
    expect(archiveModal.classList.contains('show')).toBe(true);
  });
});
