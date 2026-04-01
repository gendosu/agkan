/**
 * @vitest-environment jsdom
 *
 * Tests for claudeStreamModal module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  stripAnsi,
  openClaudeStreamModal,
  closeClaudeStreamModal,
  initClaudeStreamModal,
  registerClaudeButtonUpdateCallback,
} from '../../../src/board/client/claudeStreamModal';

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState: number = MockEventSource.CONNECTING;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private _handlers: Map<string, EventListener[]> = new Map();

  constructor(url: string) {
    this.url = url;
    this.readyState = MockEventSource.OPEN;
    MockEventSource._lastInstance = this;
  }

  addEventListener(type: string, handler: EventListener): void {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type)!.push(handler);
  }

  removeEventListener(type: string, handler: EventListener): void {
    const handlers = this._handlers.get(type) || [];
    this._handlers.set(
      type,
      handlers.filter((h) => h !== handler)
    );
  }

  dispatchCustomEvent(type: string, data: string): void {
    const handlers = this._handlers.get(type) || [];
    const event = new MessageEvent(type, { data });
    handlers.forEach((h) => h(event));
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
    MockEventSource._closeCount++;
  }

  static _lastInstance: MockEventSource | null = null;
  static _closeCount = 0;

  static reset(): void {
    MockEventSource._lastInstance = null;
    MockEventSource._closeCount = 0;
  }
}

(global as unknown as Record<string, unknown>)['EventSource'] = MockEventSource;

function setupModalDOM(): void {
  document.body.innerHTML = `
    <div class="modal-overlay" id="claude-stream-modal">
      <div class="modal">
        <div class="claude-stream-modal-header">
          <h2 id="claude-stream-modal-title">Claude Output</h2>
          <button id="claude-stream-modal-close">✕</button>
        </div>
        <div id="claude-stream-log" class="claude-stream-log"></div>
        <div class="claude-stream-modal-footer">
          <span id="claude-stream-status" class="claude-stream-status">Connecting...</span>
          <button id="claude-stream-stop-btn" class="claude-stream-stop-btn">Stop</button>
          <button id="claude-stream-close-btn">Close</button>
        </div>
      </div>
    </div>
  `;
}

beforeEach(() => {
  vi.restoreAllMocks();
  MockEventSource.reset();
  setupModalDOM();
  initClaudeStreamModal();
});

afterEach(() => {
  vi.restoreAllMocks();
  closeClaudeStreamModal();
});

describe('stripAnsi', () => {
  it('removes ANSI color codes from text', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
  });

  it('removes multiple ANSI sequences', () => {
    expect(stripAnsi('\x1b[1;31merror\x1b[0m: \x1b[33mwarning\x1b[0m')).toBe('error: warning');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('openClaudeStreamModal', () => {
  it('adds show class to modal overlay', () => {
    openClaudeStreamModal(42);
    const overlay = document.getElementById('claude-stream-modal')!;
    expect(overlay.classList.contains('show')).toBe(true);
  });

  it('sets modal title with taskId', () => {
    openClaudeStreamModal(99);
    const title = document.getElementById('claude-stream-modal-title')!;
    expect(title.textContent).toContain('99');
  });

  it('clears the log area', () => {
    const log = document.getElementById('claude-stream-log')!;
    log.innerHTML = '<div>old content</div>';
    openClaudeStreamModal(1);
    expect(log.innerHTML).toBe('');
  });

  it('sets status to Connecting...', () => {
    openClaudeStreamModal(1);
    const status = document.getElementById('claude-stream-status')!;
    expect(status.textContent).toBe('Connecting...');
  });

  it('creates an EventSource for the task stream', () => {
    openClaudeStreamModal(5);
    expect(MockEventSource._lastInstance).not.toBeNull();
    expect(MockEventSource._lastInstance!.url).toContain('/api/claude/tasks/5/stream');
  });

  it('closes previous EventSource when reopened with same taskId', () => {
    openClaudeStreamModal(1);
    const firstCloseCount = MockEventSource._closeCount;
    // open again (should close previous)
    openClaudeStreamModal(1);
    expect(MockEventSource._closeCount).toBeGreaterThan(firstCloseCount);
  });
});

describe('closeClaudeStreamModal', () => {
  it('removes show class from modal overlay', () => {
    openClaudeStreamModal(10);
    closeClaudeStreamModal();
    const overlay = document.getElementById('claude-stream-modal')!;
    expect(overlay.classList.contains('show')).toBe(false);
  });

  it('closes the EventSource', () => {
    openClaudeStreamModal(10);
    const closeCountBefore = MockEventSource._closeCount;
    closeClaudeStreamModal();
    expect(MockEventSource._closeCount).toBeGreaterThan(closeCountBefore);
  });
});

describe('SSE event handling', () => {
  it('appends text event content to log', () => {
    openClaudeStreamModal(1);
    const es = MockEventSource._lastInstance!;
    es.dispatchCustomEvent('text', JSON.stringify({ text: 'hello world' }));
    const log = document.getElementById('claude-stream-log')!;
    expect(log.textContent).toContain('hello world');
  });

  it('strips ANSI codes from text events', () => {
    openClaudeStreamModal(1);
    const es = MockEventSource._lastInstance!;
    es.dispatchCustomEvent('text', JSON.stringify({ text: '\x1b[32mgreen text\x1b[0m' }));
    const log = document.getElementById('claude-stream-log')!;
    expect(log.textContent).toContain('green text');
    expect(log.textContent).not.toContain('\x1b');
  });

  it('displays tool_use event with tool name', () => {
    openClaudeStreamModal(1);
    const es = MockEventSource._lastInstance!;
    es.dispatchCustomEvent('tool_use', JSON.stringify({ name: 'write_file', input: { path: 'src/foo.ts' } }));
    const log = document.getElementById('claude-stream-log')!;
    expect(log.textContent).toContain('write_file');
    expect(log.textContent).toContain('src/foo.ts');
  });

  it('closes EventSource on end event', () => {
    openClaudeStreamModal(1);
    const closeCountBefore = MockEventSource._closeCount;
    const es = MockEventSource._lastInstance!;
    es.dispatchCustomEvent('end', JSON.stringify({ exitCode: 0 }));
    expect(MockEventSource._closeCount).toBeGreaterThan(closeCountBefore);
  });

  it('updates status on end event', () => {
    openClaudeStreamModal(1);
    const es = MockEventSource._lastInstance!;
    es.dispatchCustomEvent('end', JSON.stringify({ exitCode: 0 }));
    const status = document.getElementById('claude-stream-status')!;
    expect(status.textContent).toContain('Done');
  });

  it('closes EventSource on error event', () => {
    openClaudeStreamModal(1);
    const closeCountBefore = MockEventSource._closeCount;
    const es = MockEventSource._lastInstance!;
    es.dispatchCustomEvent('error', JSON.stringify({ message: 'something went wrong' }));
    expect(MockEventSource._closeCount).toBeGreaterThan(closeCountBefore);
  });
});

describe('registerClaudeButtonUpdateCallback', () => {
  it('registers a callback that is called after stop', async () => {
    const callback = vi.fn();
    registerClaudeButtonUpdateCallback(callback);

    openClaudeStreamModal(7);

    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const stopBtn = document.getElementById('claude-stream-stop-btn') as HTMLButtonElement;
    stopBtn.click();

    await new Promise((r) => setTimeout(r, 0));

    expect(global.fetch).toHaveBeenCalledWith('/api/claude/tasks/7/run', expect.objectContaining({ method: 'DELETE' }));
    expect(callback).toHaveBeenCalled();
  });
});
