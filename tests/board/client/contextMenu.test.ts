/**
 * @vitest-environment jsdom
 *
 * Tests for board client contextMenu module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initContextMenu } from '../../../src/board/client/contextMenu';

vi.mock('../../../src/board/client/utils', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../../src/board/client/dragDrop', () => ({
  updateCount: vi.fn(),
}));

import { showToast } from '../../../src/board/client/utils';
import { updateCount } from '../../../src/board/client/dragDrop';

function setupDOM(): void {
  document.body.innerHTML = `
    <div id="context-menu" style="display:none;">
      <div id="ctx-delete">Delete</div>
    </div>
    <div id="toast"></div>
    <div class="column" data-status="backlog">
      <div class="column-body">
        <div class="card" data-id="1" data-status="backlog">Card 1</div>
        <div class="card" data-id="2" data-status="backlog">Card 2</div>
      </div>
    </div>
  `;
}

beforeEach(() => {
  vi.restoreAllMocks();
  setupDOM();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('confirm', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── contextmenu event ────────────────────────────────────────────────────────

describe('contextmenu event on card', () => {
  it('shows context menu when right-clicking on a card', () => {
    initContextMenu();

    const card = document.querySelector<HTMLElement>('.card')!;
    const ctxMenu = document.getElementById('context-menu')!;

    const event = new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 });
    card.dispatchEvent(event);

    expect(ctxMenu.style.display).toBe('block');
    expect(ctxMenu.style.left).toBe('100px');
    expect(ctxMenu.style.top).toBe('200px');
  });

  it('prevents default when right-clicking on a card', () => {
    initContextMenu();

    const card = document.querySelector<HTMLElement>('.card')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    card.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('hides context menu when right-clicking outside a card', () => {
    initContextMenu();

    const ctxMenu = document.getElementById('context-menu')!;
    ctxMenu.style.display = 'block';

    // Click on document body (not a card)
    const event = new MouseEvent('contextmenu', { bubbles: true });
    document.body.dispatchEvent(event);

    expect(ctxMenu.style.display).toBe('none');
  });

  it('does not prevent default when right-clicking outside a card', () => {
    initContextMenu();

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    document.body.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});

// ─── click event closes context menu ─────────────────────────────────────────

describe('click event closes context menu', () => {
  it('hides context menu when clicking outside it', () => {
    initContextMenu();

    const ctxMenu = document.getElementById('context-menu')!;
    ctxMenu.style.display = 'block';

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(ctxMenu.style.display).toBe('none');
  });

  it('does not hide context menu when clicking inside it', () => {
    initContextMenu();

    const ctxMenu = document.getElementById('context-menu')!;
    ctxMenu.style.display = 'block';

    const ctxDelete = document.getElementById('ctx-delete')!;
    const event = new MouseEvent('click', { bubbles: false });
    Object.defineProperty(event, 'target', { value: ctxDelete, configurable: true });
    document.dispatchEvent(event);

    expect(ctxMenu.style.display).toBe('block');
  });
});

// ─── ctx-delete click ─────────────────────────────────────────────────────────

describe('ctx-delete click with confirmation', () => {
  it('does nothing when confirm is cancelled', () => {
    vi.mocked(confirm).mockReturnValue(false);
    initContextMenu();

    // First set ctxTargetCard by right-clicking on a card
    const card = document.querySelector<HTMLElement>('[data-id="1"]')!;
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    const ctxMenu = document.getElementById('context-menu')!;
    ctxMenu.style.display = 'block';

    document.getElementById('ctx-delete')!.click();

    expect(fetch).not.toHaveBeenCalled();
    expect(card.isConnected).toBe(true);
  });

  it('removes card and calls updateCount when confirm is accepted', async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    initContextMenu();

    const card = document.querySelector<HTMLElement>('[data-id="1"]')!;
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    document.getElementById('ctx-delete')!.click();

    expect(card.isConnected).toBe(false);
    expect(updateCount).toHaveBeenCalledWith('backlog');

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/tasks/1', { method: 'DELETE' });
    });
  });

  it('hides context menu when ctx-delete is clicked', () => {
    vi.mocked(confirm).mockReturnValue(false);
    initContextMenu();

    const card = document.querySelector<HTMLElement>('[data-id="1"]')!;
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    const ctxMenu = document.getElementById('context-menu')!;
    ctxMenu.style.display = 'block';

    document.getElementById('ctx-delete')!.click();

    expect(ctxMenu.style.display).toBe('none');
  });

  it('does nothing when no card is targeted (ctxTargetCard is null)', () => {
    vi.mocked(confirm).mockReturnValue(true);
    initContextMenu();

    // Do NOT right-click on any card — ctxTargetCard remains null
    document.getElementById('ctx-delete')!.click();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('reloads page and shows toast when delete API returns error', async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    initContextMenu();

    const card = document.querySelector<HTMLElement>('[data-id="1"]')!;
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    document.getElementById('ctx-delete')!.click();

    await vi.waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
    });
    expect(showToast).toHaveBeenCalledWith('Failed to delete task');
  });

  it('reloads page and shows toast when delete API throws network error', async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockRejectedValue(new Error('network'));

    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    initContextMenu();

    const card = document.querySelector<HTMLElement>('[data-id="1"]')!;
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    document.getElementById('ctx-delete')!.click();

    await vi.waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
    });
    expect(showToast).toHaveBeenCalledWith('Failed to delete task');
  });
});
