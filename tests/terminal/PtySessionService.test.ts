import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtySessionService, stripAnsi } from '../../src/terminal/PtySessionService';
import { AttentionStateService } from '../../src/services/AttentionStateService';
import { ConflictError } from '../../src/errors';

describe('stripAnsi', () => {
  it('removes basic SGR color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('removes private parameter CSI sequences (cursor hide/show)', () => {
    expect(stripAnsi('\x1b[?25lhello\x1b[?25h')).toBe('hello');
  });

  it('removes bracketed paste mode sequences', () => {
    expect(stripAnsi('\x1b[?2004htext\x1b[?2004l')).toBe('text');
  });

  it('removes OSC sequences (terminal title)', () => {
    expect(stripAnsi('\x1b]0;My Terminal\x07hello')).toBe('hello');
  });

  it('removes OSC sequences with ST terminator', () => {
    expect(stripAnsi('\x1b]0;title\x1b\\hello')).toBe('hello');
  });

  it('removes single ESC sequences', () => {
    expect(stripAnsi('\x1b=text\x1b>')).toBe('text');
  });

  it('collapses carriage return overwrite to last segment', () => {
    expect(stripAnsi('loading...\rprogress')).toBe('progress');
  });

  it('preserves newlines when collapsing CR', () => {
    expect(stripAnsi('line1\nloading\rdone\nline3')).toBe('line1\ndone\nline3');
  });

  it('removes unterminated OSC sequences', () => {
    expect(stripAnsi('\x1b]0;title')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });
});

// Mock node-pty
const mockWrite = vi.fn();
const mockKill = vi.fn();
const mockResize = vi.fn();
let mockOnDataHandler: ((data: string) => void) | null = null;
let mockOnExitHandler: ((e: { exitCode: number }) => void) | null = null;

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    pid: 1234,
    write: mockWrite,
    kill: mockKill,
    resize: mockResize,
    onData: vi.fn((handler: (data: string) => void) => {
      mockOnDataHandler = handler;
    }),
    onExit: vi.fn((handler: (e: { exitCode: number }) => void) => {
      mockOnExitHandler = handler;
    }),
  })),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '/usr/local/bin/claude'),
}));

describe('PtySessionService', () => {
  let service: PtySessionService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockKill.mockClear();
    mockResize.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
    service = new PtySessionService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a PTY session and lists it as running', () => {
    service.startProcess(1, 'Task ID: 1\n/agkan-planning-subtask', 'planning');
    expect(service.listRunningTasks()).toEqual([{ taskId: 1, command: 'planning' }]);
  });

  it('throws ConflictError if session already running for taskId', async () => {
    await service.startProcess(1, 'prompt', 'run');
    await expect(service.startProcess(1, 'prompt2', 'run')).rejects.toThrow(ConflictError);
  });

  it('auto-sends prompt after fallback delay', () => {
    service.startProcess(1, 'Task ID: 1\n/agkan-planning-subtask', 'planning');
    expect(mockWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(mockWrite).toHaveBeenCalledWith('Task ID: 1\n/agkan-planning-subtask\r');
  });

  it('sends prompt after 500ms delay when ready signal detected', () => {
    service.startProcess(1, 'hello', 'run');
    mockOnDataHandler?.('some text with bypass permissions here');
    expect(mockWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(mockWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mockWrite).toHaveBeenCalledWith('hello\r');
  });

  it('does not send prompt via ready signal after fallback already fired', () => {
    service.startProcess(1, 'hello', 'run');
    vi.advanceTimersByTime(10000);
    mockWrite.mockClear();
    mockOnDataHandler?.('bypass permissions');
    vi.advanceTimersByTime(500);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('buffers PTY output in snapshot', () => {
    service.startProcess(1, 'prompt', 'run');
    mockOnDataHandler?.('hello ');
    mockOnDataHandler?.('world');
    expect(service.getSnapshot(1)).toBe('hello world');
  });

  it('preserves snapshot after session exits', () => {
    service.startProcess(1, 'prompt', 'run');
    mockOnDataHandler?.('output text');
    mockOnExitHandler?.({ exitCode: 0 });
    expect(service.getSnapshot(1)).toBe('output text');
    expect(service.listRunningTasks()).toEqual([]);
  });

  it('stops a session and removes it from running tasks', () => {
    service.startProcess(1, 'prompt', 'run');
    const stopped = service.stopProcess(1);
    expect(stopped).toBe(true);
    expect(mockKill).toHaveBeenCalled();
    expect(service.listRunningTasks()).toEqual([]);
  });

  it('returns false when stopping non-existent session', () => {
    expect(service.stopProcess(999)).toBe(false);
  });

  it('notifies running tasks change subscribers on start and stop', () => {
    const cb = vi.fn();
    service.subscribeRunningTasksChange(cb);
    service.startProcess(1, 'prompt', 'run');
    expect(cb).toHaveBeenCalledTimes(1);
    service.stopProcess(1);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('notifies running tasks change on exit', () => {
    const cb = vi.fn();
    service.subscribeRunningTasksChange(cb);
    service.startProcess(1, 'prompt', 'run');
    cb.mockClear();
    mockOnExitHandler?.({ exitCode: 0 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscribeOutput delivers done event on exit', () => {
    service.startProcess(1, 'prompt', 'run');
    const events: unknown[] = [];
    service.subscribeOutput(1, (evt) => events.push(evt));
    mockOnExitHandler?.({ exitCode: 0 });
    expect(events).toEqual([{ kind: 'done', exitCode: 0 }]);
  });

  it('subscribeRawOutput delivers PTY data chunks', () => {
    service.startProcess(1, 'prompt', 'run');
    const chunks: string[] = [];
    service.subscribeRawOutput(1, (data) => chunks.push(data));
    mockOnDataHandler?.('chunk1');
    mockOnDataHandler?.('chunk2');
    expect(chunks).toEqual(['chunk1', 'chunk2']);
  });

  it('auto-confirms workspace trust prompt', () => {
    service.startProcess(1, 'prompt', 'run');
    vi.advanceTimersByTime(10000); // let initial prompt send
    mockWrite.mockClear();
    mockOnDataHandler?.('Do you trust the files in this folder?\n> Yes, I trust (y/n): ');
    expect(mockWrite).toHaveBeenCalledWith('y\r');
  });

  it('resizes PTY session', () => {
    service.startProcess(1, 'prompt', 'run');
    service.resize(1, 100, 30);
    expect(mockResize).toHaveBeenCalledWith(100, 30);
  });

  it('does not notify exitSubscribers when process is stopped by user', () => {
    service.startProcess(1, 'prompt', 'run');
    const exitCallback = vi.fn();
    service.subscribeOutput(1, exitCallback);

    // User stops the process manually
    service.stopProcess(1);

    // Simulate PTY onExit firing after kill (exitCode is null for killed processes)
    mockOnExitHandler?.({ exitCode: null as unknown as number });

    // exitSubscribers should NOT have been called because stopProcess cleared them
    expect(exitCallback).not.toHaveBeenCalled();
  });
});

describe('PtySessionService - hook integration', () => {
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockKill.mockClear();
    mockResize.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
    // get the spawn mock from node-pty
    const pty = await import('node-pty');
    spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes BOARD_TASK_ID, BOARD_API_URL, BOARD_HOOK_TOKEN to spawned process', async () => {
    const attention = new AttentionStateService();
    const svc = new PtySessionService(undefined, {
      boardApiUrl: 'http://127.0.0.1:9999',
      attentionStateService: attention,
      hookSettingsDataDir: '/tmp/test-hooks-' + process.pid,
    });

    await svc.startProcess(123, 'prompt', 'run');
    expect(spawnMock).toHaveBeenCalled();
    const call = spawnMock.mock.calls[0];
    const spawnOptions = call[2] as { env: Record<string, string> };
    expect(spawnOptions.env.BOARD_TASK_ID).toBe('123');
    expect(spawnOptions.env.BOARD_API_URL).toBe('http://127.0.0.1:9999');
    expect(spawnOptions.env.BOARD_HOOK_TOKEN).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes --settings <path> in claude args', async () => {
    const attention = new AttentionStateService();
    const svc = new PtySessionService(undefined, {
      boardApiUrl: 'http://127.0.0.1:9999',
      attentionStateService: attention,
      hookSettingsDataDir: '/tmp/test-hooks-' + process.pid,
    });

    await svc.startProcess(123, 'prompt', 'run');
    expect(spawnMock).toHaveBeenCalled();
    const call = spawnMock.mock.calls[0];
    const args = call[1] as string[];
    const idx = args.indexOf('--settings');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toMatch(/board-hook-settings\.json$/);
  });

  it('clearTask is called on stopProcess', async () => {
    const attention = new AttentionStateService();
    attention.setAttention(123, true);
    const svc = new PtySessionService(undefined, {
      boardApiUrl: 'http://127.0.0.1:9999',
      attentionStateService: attention,
      hookSettingsDataDir: '/tmp/test-hooks-' + process.pid,
    });

    await svc.startProcess(123, 'prompt', 'run');
    expect(attention.getAttention(123)).toBe(true);
    svc.stopProcess(123);
    expect(attention.getAttention(123)).toBe(false);
  });

  it('clearTask is called on natural process exit', async () => {
    const attention = new AttentionStateService();
    attention.setAttention(456, true);
    const svc = new PtySessionService(undefined, {
      boardApiUrl: 'http://127.0.0.1:9999',
      attentionStateService: attention,
      hookSettingsDataDir: '/tmp/test-hooks-' + process.pid,
    });

    await svc.startProcess(456, 'prompt', 'run');
    mockOnExitHandler?.({ exitCode: 0 });
    expect(attention.getAttention(456)).toBe(false);
  });
});
