/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initBurgerMenu } from '../../../src/board/client/burgerMenu';

function setupDOM(): void {
  document.body.innerHTML = `
    <button id="burger-menu-btn">Menu</button>
    <div id="burger-menu-dropdown">
      <div class="burger-menu-item danger" id="burger-purge-tasks">Purge Tasks</div>
      <div class="burger-menu-item" id="burger-export-tasks">Export Tasks</div>
      <div class="burger-menu-item" id="burger-import-tasks">Import Tasks</div>
      <div class="burger-menu-item" id="burger-settings">Settings</div>
      <div class="burger-menu-item" id="burger-version-info">Version Info</div>
      <div class="burger-menu-separator"></div>
      <div class="burger-menu-item" id="burger-theme-dark">Dark Mode</div>
      <div class="burger-menu-item" id="burger-theme-light">Light Mode</div>
      <div class="burger-menu-item" id="burger-theme-system">System Setting</div>
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
    <div class="modal-overlay" id="import-modal">
      <div class="modal">
        <div id="import-drop-zone">
          <input type="file" id="import-file-input" accept=".json" style="display:none;">
        </div>
        <p id="import-result"></p>
        <div class="modal-actions">
          <button id="import-cancel-btn">Cancel</button>
          <button id="import-confirm-btn" disabled>Import</button>
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
    <div class="modal-overlay" id="settings-modal">
      <div class="modal">
        <label for="settings-llm-select">LLM</label>
        <select id="settings-llm-select">
          <option value="codex">codex</option>
          <option value="claude" selected>claude</option>
        </select>
        <p id="settings-result"></p>
        <div class="modal-actions">
          <button id="settings-cancel-btn">Cancel</button>
          <button id="settings-save-btn">Save</button>
        </div>
      </div>
    </div>
  `;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  setupDOM();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('burger menu settings modal', () => {
  it('opens settings modal from burger menu', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ board: { llm: 'claude' } }), { status: 200 })
    );

    initBurgerMenu();
    document.getElementById('burger-settings')!.click();

    const modal = document.getElementById('settings-modal')!;
    expect(modal.classList.contains('show')).toBe(true);
  });

  it('loads llm selection from server config', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ board: { llm: 'codex' } }), { status: 200 })
    );

    initBurgerMenu();
    document.getElementById('burger-settings')!.click();

    await vi.waitFor(() => {
      expect((document.getElementById('settings-llm-select') as HTMLSelectElement).value).toBe('codex');
    });
  });

  it('uses claude as fallback when llm is missing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ board: {} }), { status: 200 }));

    initBurgerMenu();
    document.getElementById('burger-settings')!.click();

    await vi.waitFor(() => {
      expect((document.getElementById('settings-llm-select') as HTMLSelectElement).value).toBe('claude');
    });
  });

  it('saves selected llm via /api/config', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ board: { llm: 'claude' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    initBurgerMenu();
    document.getElementById('burger-settings')!.click();

    const select = document.getElementById('settings-llm-select') as HTMLSelectElement;
    select.value = 'codex';

    document.getElementById('settings-save-btn')!.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/config',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ board: { llm: 'codex' } }),
        })
      );
    });

    vi.advanceTimersByTime(300);
    expect(document.getElementById('settings-modal')!.classList.contains('show')).toBe(false);
  });
});
