/**
 * @vitest-environment jsdom
 *
 * Tests for core burger menu initialization, toggle, version info,
 * export, import, and connection status button functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initBurgerMenu } from '../../../src/board/client/burgerMenu';

vi.mock('../../../src/board/client/boardPolling', () => ({
  refreshBoardCards: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/board/client/connectionStatus', () => ({
  onConnectionStateChange: vi.fn(),
  triggerReconnectAll: vi.fn(),
}));

import { onConnectionStateChange, triggerReconnectAll } from '../../../src/board/client/connectionStatus';

function setupDOM(): void {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = `
    <button id="burger-menu-btn">Menu</button>
    <div id="burger-menu-dropdown">
      <div class="burger-menu-item danger" id="burger-purge-tasks">Purge Tasks</div>
      <div class="burger-menu-item danger" id="burger-archive-tasks">Archive Tasks</div>
      <div class="burger-menu-item" id="burger-export-tasks">Export Tasks</div>
      <div class="burger-menu-item" id="burger-import-tasks">Import Tasks</div>
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
    <div class="modal-overlay" id="archive-confirm-modal">
      <div class="modal">
        <p id="archive-result"></p>
        <div class="modal-actions">
          <button id="archive-cancel-btn">Cancel</button>
          <button id="archive-confirm-btn">Archive</button>
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
    <button id="connection-status-btn" class="connection-status-btn connecting">🟡</button>
  `;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(onConnectionStateChange).mockImplementation(() => () => {});
  setupDOM();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

// ─── Burger toggle ──────────────────────────────────────────────────────────

describe('burger menu toggle', () => {
  it('toggles open class when burger button is clicked', () => {
    initBurgerMenu();
    const burgerBtn = document.getElementById('burger-menu-btn')!;
    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;

    expect(burgerDropdown.classList.contains('open')).toBe(false);
    burgerBtn.click();
    expect(burgerDropdown.classList.contains('open')).toBe(true);
    burgerBtn.click();
    expect(burgerDropdown.classList.contains('open')).toBe(false);
  });

  it('closes dropdown when clicking outside', () => {
    initBurgerMenu();
    const burgerBtn = document.getElementById('burger-menu-btn')!;
    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;

    burgerBtn.click();
    expect(burgerDropdown.classList.contains('open')).toBe(true);

    // Click somewhere outside
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(burgerDropdown.classList.contains('open')).toBe(false);
  });

  it('does not close dropdown when clicking inside it', () => {
    initBurgerMenu();
    const burgerBtn = document.getElementById('burger-menu-btn')!;
    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;

    burgerBtn.click();
    expect(burgerDropdown.classList.contains('open')).toBe(true);

    // Dispatch a document-level click event with target inside the dropdown
    const insideEl = document.getElementById('burger-version-info')!;
    const event = new MouseEvent('click', { bubbles: false });
    Object.defineProperty(event, 'target', { value: insideEl, configurable: true });
    document.dispatchEvent(event);
    // burgerDropdown.contains(insideEl) is true, so dropdown should stay open
    expect(burgerDropdown.classList.contains('open')).toBe(true);
  });

  it('does not close dropdown when clicking burger button (handled by toggle)', () => {
    initBurgerMenu();
    const burgerBtn = document.getElementById('burger-menu-btn')!;
    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;

    // Open first
    burgerBtn.click();
    expect(burgerDropdown.classList.contains('open')).toBe(true);

    // Clicking burger button itself toggles (close), but that's via button listener not document
    // Simulate a document-level click with target = burgerBtn
    const event = new MouseEvent('click', { bubbles: false });
    Object.defineProperty(event, 'target', { value: burgerBtn, configurable: true });
    document.dispatchEvent(event);
    // Document listener should NOT close because target === burgerBtn
    expect(burgerDropdown.classList.contains('open')).toBe(true);
  });
});

// ─── Version info modal ──────────────────────────────────────────────────────

describe('burger menu version info', () => {
  it('opens version modal and loads version from API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '1.2.3' }),
    } as unknown as Response);

    initBurgerMenu();

    const versionModal = document.getElementById('version-info-modal')!;
    const versionTextEl = document.getElementById('version-info-text')!;

    document.getElementById('burger-version-info')!.click();

    expect(versionModal.classList.contains('show')).toBe(true);
    expect(versionTextEl.textContent).toBe('Loading...');

    await vi.waitFor(() => {
      expect(versionTextEl.textContent).toBe('agkan v1.2.3');
    });
  });

  it('removes open class from dropdown when version info is clicked', () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '1.0.0' }),
    } as unknown as Response);

    initBurgerMenu();

    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;
    burgerDropdown.classList.add('open');

    document.getElementById('burger-version-info')!.click();

    expect(burgerDropdown.classList.contains('open')).toBe(false);
  });

  it('shows error when version API fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    initBurgerMenu();

    const versionTextEl = document.getElementById('version-info-text')!;
    document.getElementById('burger-version-info')!.click();

    await vi.waitFor(() => {
      expect(versionTextEl.textContent).toBe('Failed to load version.');
    });
  });

  it('closes version modal when close button is clicked', () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '1.0.0' }),
    } as unknown as Response);

    initBurgerMenu();

    const versionModal = document.getElementById('version-info-modal')!;
    versionModal.classList.add('show');

    document.getElementById('version-info-close')!.click();

    expect(versionModal.classList.contains('show')).toBe(false);
  });
});

// ─── Export tasks ─────────────────────────────────────────────────────────────

describe('burger menu export tasks', () => {
  it('triggers export by creating and clicking a download link', () => {
    initBurgerMenu();

    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;
    burgerDropdown.classList.add('open');

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    document.getElementById('burger-export-tasks')!.click();

    expect(burgerDropdown.classList.contains('open')).toBe(false);
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();

    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.href).toContain('/api/export');
  });
});

// ─── Import tasks ─────────────────────────────────────────────────────────────

describe('burger menu import tasks', () => {
  it('opens import modal when import button is clicked', () => {
    initBurgerMenu();

    const importModal = document.getElementById('import-modal')!;
    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;
    burgerDropdown.classList.add('open');

    document.getElementById('burger-import-tasks')!.click();

    expect(importModal.classList.contains('show')).toBe(true);
    expect(burgerDropdown.classList.contains('open')).toBe(false);
  });

  it('closes import modal when cancel button is clicked', () => {
    initBurgerMenu();

    const importModal = document.getElementById('import-modal')!;
    importModal.classList.add('show');

    document.getElementById('import-cancel-btn')!.click();

    expect(importModal.classList.contains('show')).toBe(false);
  });

  it('enables confirm button and shows filename when file is selected via input', () => {
    initBurgerMenu();

    const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement;
    const importResultEl = document.getElementById('import-result')!;
    const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

    expect(importConfirmBtn.disabled).toBe(true);

    const file = new File(['{"tasks":[]}'], 'test.json', { type: 'application/json' });
    Object.defineProperty(importFileInput, 'files', {
      value: [file],
      configurable: true,
    });

    importFileInput.dispatchEvent(new Event('change'));

    expect(importConfirmBtn.disabled).toBe(false);
    expect(importResultEl.textContent).toContain('test.json');
  });

  it('enables confirm button when file is dropped on drop zone', () => {
    initBurgerMenu();

    const importDropZone = document.getElementById('import-drop-zone')!;
    const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement;
    const importResultEl = document.getElementById('import-result')!;

    const file = new File(['{"tasks":[]}'], 'dropped.json', { type: 'application/json' });
    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn(), configurable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [file] },
      configurable: true,
    });

    importDropZone.dispatchEvent(dropEvent);

    expect(importConfirmBtn.disabled).toBe(false);
    expect(importResultEl.textContent).toContain('dropped.json');
  });

  it('highlights drop zone on dragover and resets on dragleave', () => {
    initBurgerMenu();

    const importDropZone = document.getElementById('import-drop-zone')!;

    const dragoverEvent = new Event('dragover', { bubbles: true });
    Object.defineProperty(dragoverEvent, 'preventDefault', { value: vi.fn(), configurable: true });
    importDropZone.dispatchEvent(dragoverEvent);
    // jsdom normalizes hex colors to rgb()
    expect(importDropZone.style.borderColor).toBe('rgb(59, 130, 246)');

    importDropZone.dispatchEvent(new Event('dragleave', { bubbles: true }));
    expect(importDropZone.style.borderColor).toBe('rgb(148, 163, 184)');
  });

  it('imports file successfully and reloads page', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ importedCount: 5 }),
    } as unknown as Response);

    initBurgerMenu();

    const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement;
    const importResultEl = document.getElementById('import-result')!;
    const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

    // Set a file so confirm button gets enabled
    const file = new File(['{"tasks":[]}'], 'test.json', { type: 'application/json' });
    Object.defineProperty(importFileInput, 'files', {
      value: [file],
      configurable: true,
    });
    importFileInput.dispatchEvent(new Event('change'));

    vi.useFakeTimers();
    importConfirmBtn.click();

    await vi.waitFor(() => {
      expect(importResultEl.textContent).toContain('5 task(s)');
    });

    vi.advanceTimersByTime(1500);
    expect(reloadMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('shows error when import API returns non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Bad file' }),
    } as unknown as Response);

    initBurgerMenu();

    const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement;
    const importResultEl = document.getElementById('import-result')!;
    const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

    const file = new File(['{"tasks":[]}'], 'test.json', { type: 'application/json' });
    Object.defineProperty(importFileInput, 'files', {
      value: [file],
      configurable: true,
    });
    importFileInput.dispatchEvent(new Event('change'));

    importConfirmBtn.click();

    await vi.waitFor(() => {
      expect(importResultEl.textContent).toContain('Error:');
    });
    expect(importResultEl.style.color).toBe('rgb(220, 38, 38)');
  });

  it('shows error when import file cannot be parsed as JSON', async () => {
    initBurgerMenu();

    const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement;
    const importResultEl = document.getElementById('import-result')!;
    const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

    const file = new File(['not valid json'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(importFileInput, 'files', {
      value: [file],
      configurable: true,
    });
    importFileInput.dispatchEvent(new Event('change'));

    importConfirmBtn.click();

    await vi.waitFor(() => {
      expect(importResultEl.textContent).toContain('Invalid JSON');
    });
    expect(importResultEl.style.color).toBe('rgb(220, 38, 38)');
  });

  it('resets import modal state when reopened', () => {
    initBurgerMenu();

    const importModal = document.getElementById('import-modal')!;
    const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement;
    const importResultEl = document.getElementById('import-result')!;
    const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

    // Set a file to enable the button
    const file = new File(['{"tasks":[]}'], 'test.json', { type: 'application/json' });
    Object.defineProperty(importFileInput, 'files', {
      value: [file],
      configurable: true,
    });
    importFileInput.dispatchEvent(new Event('change'));
    expect(importConfirmBtn.disabled).toBe(false);

    // Close and reopen
    document.getElementById('import-cancel-btn')!.click();
    document.getElementById('burger-import-tasks')!.click();

    expect(importModal.classList.contains('show')).toBe(true);
    expect(importConfirmBtn.disabled).toBe(true);
    expect(importResultEl.textContent).toBe('');
  });

  it('does not open import modal when required elements are missing', () => {
    // Remove required elements to test the early-return path
    document.getElementById('import-modal')!.remove();
    initBurgerMenu();
    // No throw should occur (graceful no-op)
    document.getElementById('burger-import-tasks')?.click();
  });
});

// ─── Connection status button ─────────────────────────────────────────────────

describe('burger menu connection status button', () => {
  it('registers a connection state change listener', () => {
    initBurgerMenu();
    expect(onConnectionStateChange).toHaveBeenCalled();
  });

  it('updates connection button class and text when state changes', () => {
    let capturedListener: ((state: string) => void) | null = null;
    vi.mocked(onConnectionStateChange).mockImplementation((fn) => {
      capturedListener = fn as (state: string) => void;
      return () => {};
    });

    initBurgerMenu();

    const btn = document.getElementById('connection-status-btn')!;

    capturedListener!('connected');
    expect(btn.className).toContain('connected');
    expect(btn.textContent).toBe('🟢');
    expect(btn.title).toBe('Connected');

    capturedListener!('connecting');
    expect(btn.className).toContain('connecting');
    expect(btn.textContent).toBe('🟡');
    expect(btn.title).toBe('Connecting...');

    capturedListener!('disconnected');
    expect(btn.className).toContain('disconnected');
    expect(btn.textContent).toBe('🔴');
    expect(btn.title).toBe('Disconnected — Click to reconnect');
  });

  it('uses fallback icon for unknown state', () => {
    let capturedListener: ((state: string) => void) | null = null;
    vi.mocked(onConnectionStateChange).mockImplementation((fn) => {
      capturedListener = fn as (state: string) => void;
      return () => {};
    });

    initBurgerMenu();

    const btn = document.getElementById('connection-status-btn')!;
    capturedListener!('unknown-state');
    expect(btn.textContent).toBe('⚪');
    expect(btn.title).toBe('');
  });

  it('calls triggerReconnectAll when clicking disconnected button', () => {
    let capturedListener: ((state: string) => void) | null = null;
    vi.mocked(onConnectionStateChange).mockImplementation((fn) => {
      capturedListener = fn as (state: string) => void;
      return () => {};
    });

    initBurgerMenu();

    const btn = document.getElementById('connection-status-btn')!;
    capturedListener!('disconnected');

    btn.click();

    expect(triggerReconnectAll).toHaveBeenCalled();
  });

  it('does not call triggerReconnectAll when clicking connected button', () => {
    let capturedListener: ((state: string) => void) | null = null;
    vi.mocked(onConnectionStateChange).mockImplementation((fn) => {
      capturedListener = fn as (state: string) => void;
      return () => {};
    });

    initBurgerMenu();

    const btn = document.getElementById('connection-status-btn')!;
    capturedListener!('connected');

    btn.click();

    expect(triggerReconnectAll).not.toHaveBeenCalled();
  });

  it('skips connection status setup when button element is missing', () => {
    document.getElementById('connection-status-btn')!.remove();
    // Should not throw
    expect(() => initBurgerMenu()).not.toThrow();
  });
});

// ─── Purge modal cancel button ────────────────────────────────────────────────

describe('burger menu purge cancel', () => {
  it('closes purge modal when cancel button is clicked', () => {
    initBurgerMenu();

    const purgeModal = document.getElementById('purge-confirm-modal')!;
    purgeModal.classList.add('show');

    document.getElementById('purge-cancel-btn')!.click();

    expect(purgeModal.classList.contains('show')).toBe(false);
  });

  it('opens purge modal when purge-tasks button is clicked', () => {
    global.fetch = vi.fn();
    initBurgerMenu();

    const purgeModal = document.getElementById('purge-confirm-modal')!;
    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;
    burgerDropdown.classList.add('open');

    document.getElementById('burger-purge-tasks')!.click();

    expect(purgeModal.classList.contains('show')).toBe(true);
    expect(burgerDropdown.classList.contains('open')).toBe(false);
  });
});

// ─── Archive modal cancel button ──────────────────────────────────────────────

describe('burger menu archive cancel', () => {
  it('closes archive modal when cancel button is clicked', () => {
    initBurgerMenu();

    const archiveModal = document.getElementById('archive-confirm-modal')!;
    archiveModal.classList.add('show');

    document.getElementById('archive-cancel-btn')!.click();

    expect(archiveModal.classList.contains('show')).toBe(false);
  });

  it('opens archive modal when archive-tasks button is clicked', () => {
    initBurgerMenu();

    const archiveModal = document.getElementById('archive-confirm-modal')!;
    const burgerDropdown = document.getElementById('burger-menu-dropdown')!;
    burgerDropdown.classList.add('open');

    document.getElementById('burger-archive-tasks')!.click();

    expect(archiveModal.classList.contains('show')).toBe(true);
    expect(burgerDropdown.classList.contains('open')).toBe(false);
  });

  it('skips archive modal setup when required elements are missing', () => {
    document.getElementById('archive-confirm-modal')!.remove();
    // Should not throw
    expect(() => initBurgerMenu()).not.toThrow();
  });
});
