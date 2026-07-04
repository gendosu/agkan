/**
 * @vitest-environment jsdom
 *
 * Tests for detailPanel's terminal-tab wiring (switchTab / updateTerminalTabUi).
 * claudeTerminalModal and claudeButton are mocked since exercising them for real
 * in jsdom would open real WebSockets and instantiate xterm.js Terminal instances.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { terminalModule, claudeButtonModule } = vi.hoisted(() => {
  const terminalModule = {
    fitTerminal: vi.fn(),
    stopTerminal: vi.fn().mockResolvedValue(true),
    getCurrentTerminalTaskId: vi.fn(() => null as number | null),
    attachTerminalToTab: vi.fn(),
  };
  const claudeButtonModule = {
    getRunningTaskIds: vi.fn(() => new Set<number>()),
  };
  return { terminalModule, claudeButtonModule };
});

vi.mock('../../../src/board/client/claudeTerminalModal', () => terminalModule);
vi.mock('../../../src/board/client/claudeButton', () => claudeButtonModule);

function setupBoardContainerDOM(): void {
  document.body.innerHTML = `<div class="board-container"></div>`;

  (window as unknown as Record<string, unknown>).allStatuses = ['pending', 'in_progress', 'completed'];
  (window as unknown as Record<string, unknown>).statusLabels = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
  };
  (window as unknown as Record<string, unknown>).allPriorities = ['low', 'medium', 'high'];

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

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

function makeTaskDetail(overrides = {}) {
  return {
    task: {
      id: 1,
      title: 'Test Task',
      body: 'Task body',
      status: 'pending',
      priority: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    tags: [],
    metadata: [],
    blockedBy: [],
    blocking: [],
    parent: null,
    ...overrides,
  };
}

class MockEventSource {
  static lastInstance: MockEventSource | null = null;
  private updateCallbacks: ((e: MessageEvent) => void)[] = [];
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    MockEventSource.lastInstance = this;
  }

  addEventListener(type: string, cb: (e: Event) => void): void {
    if (type === 'update') this.updateCallbacks.push(cb as (e: MessageEvent) => void);
  }

  removeEventListener(): void {}

  close(): void {
    if (MockEventSource.lastInstance === this) MockEventSource.lastInstance = null;
  }

  dispatchUpdate(logs: unknown[]): void {
    const event = new MessageEvent('update', { data: JSON.stringify({ logs }) });
    this.updateCallbacks.forEach((cb) => cb(event));
  }
}

function mockFetchDefaults() {
  return vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('/api/config')) return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    if (u.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ tags: [] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
  });
}

describe('detailPanel terminal-related behavior', () => {
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    terminalModule.getCurrentTerminalTaskId.mockReturnValue(null);
    claudeButtonModule.getRunningTaskIds.mockReturnValue(new Set());

    originalRequestAnimationFrame = window.requestAnimationFrame;
    const stubbedRequestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof window.requestAnimationFrame;
    window.requestAnimationFrame = stubbedRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = stubbedRequestAnimationFrame;

    MockEventSource.lastInstance = null;
    (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;

    setupBoardContainerDOM();
    global.fetch = mockFetchDefaults();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = originalRequestAnimationFrame;
    vi.restoreAllMocks();
  });

  describe('updateTerminalTabUi', () => {
    it('does not throw when the terminal placeholder or stop button is missing', async () => {
      document.body.innerHTML = '<div class="board-container"></div>';
      const { updateTerminalTabUi } = await import('../../../src/board/client/detailPanel');
      expect(() => updateTerminalTabUi()).not.toThrow();
    });

    it('hides the stop button when the task is not running', async () => {
      const { initDetailPanel, renderDetailPanel, updateTerminalTabUi } =
        await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      claudeButtonModule.getRunningTaskIds.mockReturnValue(new Set());
      updateTerminalTabUi();

      const stopBtn = document.getElementById('detail-terminal-stop-btn') as HTMLButtonElement;
      expect(stopBtn.style.display).toBe('none');
    });

    it('shows the stop button when the task is running', async () => {
      const { initDetailPanel, renderDetailPanel, updateTerminalTabUi } =
        await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      claudeButtonModule.getRunningTaskIds.mockReturnValue(new Set([1]));
      updateTerminalTabUi();

      const stopBtn = document.getElementById('detail-terminal-stop-btn') as HTMLButtonElement;
      expect(stopBtn.style.display).toBe('');
      expect(stopBtn.disabled).toBe(false);
      expect(stopBtn.textContent).toBe('Stop');
    });

    it('auto-reconnects when the task is running, no terminal is attached, and the terminal tab is active', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      claudeButtonModule.getRunningTaskIds.mockReturnValue(new Set([1]));
      terminalModule.getCurrentTerminalTaskId.mockReturnValue(null);

      switchTab('terminal');

      expect(terminalModule.attachTerminalToTab).toHaveBeenCalledTimes(1);
      expect(terminalModule.attachTerminalToTab.mock.calls[0][0]).toBe(1);
      expect(terminalModule.attachTerminalToTab.mock.calls[0][1]).toBe(document.getElementById('detail-terminal-host'));
    });

    it('does not auto-reconnect when a terminal is already attached for this task', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      claudeButtonModule.getRunningTaskIds.mockReturnValue(new Set([1]));
      terminalModule.getCurrentTerminalTaskId.mockReturnValue(1);

      switchTab('terminal');

      expect(terminalModule.attachTerminalToTab).not.toHaveBeenCalled();
    });

    it('does not auto-reconnect when the running task differs from the currently displayed task', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      claudeButtonModule.getRunningTaskIds.mockReturnValue(new Set([999]));
      terminalModule.getCurrentTerminalTaskId.mockReturnValue(null);

      switchTab('terminal');

      expect(terminalModule.attachTerminalToTab).not.toHaveBeenCalled();
    });

    it('shows the placeholder when no terminal is attached for this task', async () => {
      const { initDetailPanel, renderDetailPanel, updateTerminalTabUi } =
        await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      terminalModule.getCurrentTerminalTaskId.mockReturnValue(null);
      updateTerminalTabUi();

      const placeholder = document.getElementById('detail-terminal-placeholder') as HTMLElement;
      expect(placeholder.style.display).toBe('');
    });

    it('hides the placeholder when a terminal is attached for this task', async () => {
      const { initDetailPanel, renderDetailPanel, updateTerminalTabUi } =
        await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      terminalModule.getCurrentTerminalTaskId.mockReturnValue(1);
      updateTerminalTabUi();

      const placeholder = document.getElementById('detail-terminal-placeholder') as HTMLElement;
      expect(placeholder.style.display).toBe('none');
    });
  });

  describe('switchTab', () => {
    it('moves the active classes between the details and comments tabs', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      switchTab('comments');

      const detailsBtn = document.querySelector('.detail-tab[data-tab="details"]') as HTMLElement;
      const commentsBtn = document.getElementById('detail-tab-comments') as HTMLElement;
      const detailsPane = document.getElementById('detail-tab-content-details') as HTMLElement;
      const commentsPane = document.getElementById('detail-tab-content-comments') as HTMLElement;

      expect(detailsBtn.classList.contains('active')).toBe(false);
      expect(commentsBtn.classList.contains('active')).toBe(true);
      expect(detailsPane.classList.contains('active')).toBe(false);
      expect(commentsPane.classList.contains('active')).toBe(true);

      switchTab('details');

      expect(detailsBtn.classList.contains('active')).toBe(true);
      expect(commentsBtn.classList.contains('active')).toBe(false);
      expect(detailsPane.classList.contains('active')).toBe(true);
      expect(commentsPane.classList.contains('active')).toBe(false);
    });

    it('calling switchTab again with the same tab name leaves the active state unchanged', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab, getDetailActiveTab } =
        await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      switchTab('comments');
      const commentsBtn = document.getElementById('detail-tab-comments') as HTMLElement;
      expect(commentsBtn.classList.contains('active')).toBe(true);

      expect(() => switchTab('comments')).not.toThrow();

      expect(getDetailActiveTab()).toBe('comments');
      expect(commentsBtn.classList.contains('active')).toBe(true);
    });

    it('shows the footer for the details tab and hides it for any other tab', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      const footer = document.getElementById('detail-panel-footer') as HTMLElement;

      switchTab('comments');
      expect(footer.style.display).toBe('none');

      switchTab('details');
      expect(footer.style.display).toBe('');
    });

    it('closes the run-logs EventSource stream when switching away from run-logs', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      switchTab('run-logs');
      const es = MockEventSource.lastInstance;
      expect(es).not.toBeNull();
      const closeSpy = vi.spyOn(es!, 'close');

      switchTab('details');

      expect(closeSpy).toHaveBeenCalled();
    });

    it('calls fitTerminal when switching to terminal and a terminal is already attached for this task', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      terminalModule.getCurrentTerminalTaskId.mockReturnValue(1);
      switchTab('terminal');

      expect(terminalModule.fitTerminal).toHaveBeenCalled();
    });

    it('does not call fitTerminal when switching to terminal without an attached terminal for this task', async () => {
      const { initDetailPanel, renderDetailPanel, switchTab } = await import('../../../src/board/client/detailPanel');
      initDetailPanel();
      renderDetailPanel(makeTaskDetail());

      terminalModule.getCurrentTerminalTaskId.mockReturnValue(null);
      switchTab('terminal');

      expect(terminalModule.fitTerminal).not.toHaveBeenCalled();
    });
  });
});
