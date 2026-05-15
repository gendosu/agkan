/**
 * @vitest-environment jsdom
 *
 * Tests for bulkRunButton module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initBulkRunButton } from '../../../src/board/client/bulkRunButton';

type ESListener = (event: MessageEvent) => void;

class MockEventSource {
  static lastInstance: MockEventSource | null = null;
  listeners: Record<string, ESListener> = {};
  url: string;
  constructor(url: string) {
    this.url = url;
    MockEventSource.lastInstance = this;
  }
  addEventListener(type: string, fn: ESListener) {
    this.listeners[type] = fn;
  }
  dispatch(type: string, data: unknown) {
    const fn = this.listeners[type];
    if (fn) fn({ data: JSON.stringify(data) } as MessageEvent);
  }
  close() {}
  static reset() {
    MockEventSource.lastInstance = null;
  }
}

function makeBulkRunSplit(): {
  split: HTMLElement;
  mainBtn: HTMLButtonElement;
  toggle: HTMLButtonElement;
  menu: HTMLElement;
  menuItem1: HTMLButtonElement;
  menuItem2: HTMLButtonElement;
} {
  const split = document.createElement('div');
  split.id = 'bulk-run-split';

  const mainBtn = document.createElement('button');
  mainBtn.id = 'bulk-run-main-btn';

  const toggle = document.createElement('button');
  toggle.id = 'bulk-run-toggle';

  const menu = document.createElement('div');
  menu.id = 'bulk-run-menu';

  const menuItem1 = document.createElement('button');
  menuItem1.className = 'bulk-run-menu-item';
  menuItem1.dataset.command = 'direct';

  const menuItem2 = document.createElement('button');
  menuItem2.className = 'bulk-run-menu-item';
  menuItem2.dataset.command = 'pr';

  menu.appendChild(menuItem1);
  menu.appendChild(menuItem2);
  split.appendChild(mainBtn);
  split.appendChild(toggle);
  split.appendChild(menu);
  document.body.appendChild(split);

  return { split, mainBtn, toggle, menu, menuItem1, menuItem2 };
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  MockEventSource.reset();
  (global as unknown as Record<string, unknown>)['EventSource'] = MockEventSource;
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('initBulkRunButton', () => {
  it('does nothing when #bulk-run-split is missing', () => {
    initBulkRunButton();
    expect(MockEventSource.lastInstance).toBeNull();
  });

  it('does nothing when mainBtn is missing', () => {
    const split = document.createElement('div');
    split.id = 'bulk-run-split';
    document.body.appendChild(split);
    initBulkRunButton();
    expect(MockEventSource.lastInstance).toBeNull();
  });

  it('initializes EventSource when all elements present', () => {
    makeBulkRunSplit();
    initBulkRunButton();
    expect(MockEventSource.lastInstance).not.toBeNull();
    expect(MockEventSource.lastInstance!.url).toBe('/api/claude/bulk-run/stream');
  });

  it('SSE update event sets running state', () => {
    const { mainBtn, toggle } = makeBulkRunSplit();
    initBulkRunButton();

    MockEventSource.lastInstance!.dispatch('update', { mode: 'running' });

    expect(mainBtn.innerHTML).toContain('Stop');
    expect(mainBtn.classList.contains('bulk-run-btn-stop')).toBe(true);
    expect(toggle.style.display).toBe('none');
  });

  it('SSE update event sets idle state', () => {
    const { mainBtn, toggle } = makeBulkRunSplit();
    initBulkRunButton();

    MockEventSource.lastInstance!.dispatch('update', { mode: 'running' });
    MockEventSource.lastInstance!.dispatch('update', { mode: 'idle' });

    expect(mainBtn.innerHTML).toContain('Run all');
    expect(mainBtn.classList.contains('bulk-run-btn-stop')).toBe(false);
    expect(toggle.style.display).toBe('');
  });

  it('running state removes open class from split', () => {
    const { split } = makeBulkRunSplit();
    initBulkRunButton();

    split.classList.add('open');
    MockEventSource.lastInstance!.dispatch('update', { mode: 'running' });

    expect(split.classList.contains('open')).toBe(false);
  });

  it('running state disables menu items', () => {
    const { menuItem1, menuItem2 } = makeBulkRunSplit();
    initBulkRunButton();

    MockEventSource.lastInstance!.dispatch('update', { mode: 'running' });

    expect(menuItem1.disabled).toBe(true);
    expect(menuItem2.disabled).toBe(true);
  });

  it('idle state enables menu items', () => {
    const { menuItem1, menuItem2 } = makeBulkRunSplit();
    initBulkRunButton();

    MockEventSource.lastInstance!.dispatch('update', { mode: 'running' });
    MockEventSource.lastInstance!.dispatch('update', { mode: 'idle' });

    expect(menuItem1.disabled).toBe(false);
    expect(menuItem2.disabled).toBe(false);
  });

  it('does nothing when menu is missing (mainBtn and toggle present)', () => {
    const split = document.createElement('div');
    split.id = 'bulk-run-split';
    const mainBtn = document.createElement('button');
    mainBtn.id = 'bulk-run-main-btn';
    const toggle = document.createElement('button');
    toggle.id = 'bulk-run-toggle';
    split.appendChild(mainBtn);
    split.appendChild(toggle);
    document.body.appendChild(split);
    initBulkRunButton();
    expect(MockEventSource.lastInstance).toBeNull();
  });
});

describe('mainBtn click', () => {
  it('calls stopBulkRun when running', async () => {
    const { mainBtn } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    initBulkRunButton();

    MockEventSource.lastInstance!.dispatch('update', { mode: 'running' });

    mainBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetch).toHaveBeenCalledWith('/api/claude/bulk-run/stop', { method: 'POST' });
  });

  it('calls startBulkRun direct when idle', async () => {
    const { mainBtn } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    initBulkRunButton();
    // ensure idle state
    MockEventSource.lastInstance!.dispatch('update', { mode: 'idle' });

    mainBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetch).toHaveBeenCalledWith('/api/claude/bulk-run', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.command).toBe('direct');
  });

  it('shows alert on failed bulk run with error field', async () => {
    const { mainBtn } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server error' }),
    } as Response);
    initBulkRunButton();
    MockEventSource.lastInstance!.dispatch('update', { mode: 'idle' });

    mainBtn.click();
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining('server error')));
  });

  it('shows alert with HTTP status when response has no error field', async () => {
    const { mainBtn } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);
    initBulkRunButton();
    MockEventSource.lastInstance!.dispatch('update', { mode: 'idle' });

    mainBtn.click();
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining('503')));
  });

  it('handles json parse failure gracefully', async () => {
    const { mainBtn } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response);
    initBulkRunButton();
    MockEventSource.lastInstance!.dispatch('update', { mode: 'idle' });

    mainBtn.click();
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining('502')));
  });

  it('handles network error on startBulkRun gracefully', async () => {
    const { mainBtn } = makeBulkRunSplit();
    vi.mocked(fetch).mockRejectedValue(new Error('network'));
    initBulkRunButton();

    mainBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    // should not throw
  });

  it('handles network error on stopBulkRun gracefully', async () => {
    const { mainBtn } = makeBulkRunSplit();
    vi.mocked(fetch).mockRejectedValue(new Error('network'));
    initBulkRunButton();

    MockEventSource.lastInstance!.dispatch('update', { mode: 'running' });

    mainBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    // should not throw
  });
});

describe('toggle button click', () => {
  it('toggles open class on split', () => {
    const { split, toggle } = makeBulkRunSplit();
    initBulkRunButton();

    toggle.click();
    expect(split.classList.contains('open')).toBe(true);

    toggle.click();
    expect(split.classList.contains('open')).toBe(false);
  });
});

describe('menu item click', () => {
  it('calls startBulkRun with direct command', async () => {
    const { menuItem1 } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    initBulkRunButton();

    menuItem1.click();
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.command).toBe('direct');
  });

  it('calls startBulkRun with pr command', async () => {
    const { menuItem2 } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    initBulkRunButton();

    menuItem2.click();
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.command).toBe('pr');
  });

  it('removes open class from split on click', async () => {
    const { split, menuItem1 } = makeBulkRunSplit();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    initBulkRunButton();

    split.classList.add('open');
    menuItem1.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(split.classList.contains('open')).toBe(false);
  });

  it('defaults to direct command when data-command is missing', async () => {
    const { menu } = makeBulkRunSplit();
    const noCommandItem = document.createElement('button');
    noCommandItem.className = 'bulk-run-menu-item';
    menu.appendChild(noCommandItem);
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    initBulkRunButton();

    noCommandItem.click();
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.command).toBe('direct');
  });
});

describe('document click closes menu', () => {
  it('removes open class when document is clicked', () => {
    const { split } = makeBulkRunSplit();
    initBulkRunButton();

    split.classList.add('open');
    document.dispatchEvent(new MouseEvent('click'));

    expect(split.classList.contains('open')).toBe(false);
  });
});
