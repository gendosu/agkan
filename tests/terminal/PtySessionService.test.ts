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
    expect(mockWrite).toHaveBeenCalledWith('Task ID: 1\n/agkan-planning-subtask');
    vi.advanceTimersByTime(100);
    expect(mockWrite).toHaveBeenCalledWith('\r');
  });

  it('sends prompt after 500ms delay when ready signal detected', () => {
    service.startProcess(1, 'hello', 'run');
    mockOnDataHandler?.('some text with bypass permissions here');
    expect(mockWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(mockWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mockWrite).toHaveBeenCalledWith('hello');
    vi.advanceTimersByTime(100);
    expect(mockWrite).toHaveBeenCalledWith('\r');
  });

  it('does not send prompt via ready signal after fallback already fired', () => {
    service.startProcess(1, 'hello', 'run');
    vi.advanceTimersByTime(10100); // advance past fallback delay and enter key delay
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

describe('PtySessionService - model/effort/boardApiUrl args', () => {
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
    const pty = await import('node-pty');
    spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes --model and --effort to spawn when provided', async () => {
    const svc = new PtySessionService();
    await svc.startProcess(1, 'prompt', 'run', 'claude-3-opus', 'high');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-3-opus');
    expect(args).toContain('--effort');
    expect(args[args.indexOf('--effort') + 1]).toBe('high');
  });

  it('does not pass --model or --effort when not provided', async () => {
    const svc = new PtySessionService();
    await svc.startProcess(1, 'prompt', 'run');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--effort');
  });

  it('does not inject board env vars when boardApiUrl is empty string', async () => {
    const savedTaskId = process.env.BOARD_TASK_ID;
    const savedApiUrl = process.env.BOARD_API_URL;
    delete process.env.BOARD_TASK_ID;
    delete process.env.BOARD_API_URL;
    try {
      const attention = new AttentionStateService();
      const svc = new PtySessionService(undefined, {
        boardApiUrl: '',
        attentionStateService: attention,
        hookSettingsDataDir: null as unknown as string,
      });
      await svc.startProcess(1, 'prompt', 'run');
      const env = (spawnMock.mock.calls[0][2] as { env: Record<string, string> }).env;
      expect(env.BOARD_TASK_ID).toBeUndefined();
      expect(env.BOARD_API_URL).toBeUndefined();
    } finally {
      if (savedTaskId !== undefined) process.env.BOARD_TASK_ID = savedTaskId;
      if (savedApiUrl !== undefined) process.env.BOARD_API_URL = savedApiUrl;
    }
  });

  it('does not inject board env vars when boardApiUrl is null', async () => {
    const savedTaskId = process.env.BOARD_TASK_ID;
    const savedApiUrl = process.env.BOARD_API_URL;
    delete process.env.BOARD_TASK_ID;
    delete process.env.BOARD_API_URL;
    try {
      const svc = new PtySessionService(undefined, {
        boardApiUrl: null,
        attentionStateService: new AttentionStateService(),
        hookSettingsDataDir: null as unknown as string,
      });
      await svc.startProcess(1, 'prompt', 'run');
      const env = (spawnMock.mock.calls[0][2] as { env: Record<string, string> }).env;
      expect(env.BOARD_TASK_ID).toBeUndefined();
      expect(env.BOARD_API_URL).toBeUndefined();
    } finally {
      if (savedTaskId !== undefined) process.env.BOARD_TASK_ID = savedTaskId;
      if (savedApiUrl !== undefined) process.env.BOARD_API_URL = savedApiUrl;
    }
  });

  it('does not include --settings when hookSettingsDataDir is null', async () => {
    const svc = new PtySessionService(undefined, {
      boardApiUrl: null,
      attentionStateService: new AttentionStateService(),
      hookSettingsDataDir: null as unknown as string,
    });
    await svc.startProcess(1, 'prompt', 'run');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('--settings');
  });
});

describe('PtySessionService - output buffer truncation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('truncates outputBuffer to 500KB when more than 500KB data arrives', async () => {
    const svc = new PtySessionService();
    await svc.startProcess(1, 'prompt', 'run');
    // Send 600KB of data
    const chunk = 'x'.repeat(600_000);
    mockOnDataHandler?.(chunk);
    const snapshot = svc.getSnapshot(1);
    expect(snapshot.length).toBeLessThanOrEqual(500_000);
  });
});

describe('PtySessionService - completed snapshot eviction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts oldest completed snapshot when more than 10 complete', async () => {
    // We need separate spawn mock calls per session; reuse the same module-level mock
    // but track handler per session via module-level vars — this test runs 11 sessions sequentially
    const svc = new PtySessionService();

    for (let i = 1; i <= 11; i++) {
      mockOnDataHandler = null;
      mockOnExitHandler = null;
      await svc.startProcess(i, 'prompt', 'run');
      mockOnDataHandler?.(`output-${i}`);
      mockOnExitHandler?.({ exitCode: 0 });
    }

    // Task 1 should have been evicted
    expect(svc.getSnapshot(1)).toBe('');
    // Task 11 (most recent) should still be present
    expect(svc.getSnapshot(11)).toBe('output-11');
  });
});

describe('PtySessionService - subscribe methods for non-running tasks', () => {
  let mockDb: { runLogs: ReturnType<typeof createMockRunLogs> };

  function createMockRunLogs() {
    return {
      create: vi.fn().mockReturnValue(1),
      updateFinished: vi.fn(),
      updateEvents: vi.fn(),
      findLatestByTaskId: vi.fn().mockReturnValue(null),
      findByTaskId: vi.fn().mockReturnValue([]),
      findIdsByTaskId: vi.fn().mockReturnValue([]),
      deleteMany: vi.fn(),
      updateSessionId: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
    mockDb = { runLogs: createMockRunLogs() };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribeOutput with no DB and no session returns no-op unsubscribe immediately', () => {
    const svc = new PtySessionService();
    const cb = vi.fn();
    const unsub = svc.subscribeOutput(99, cb);
    expect(cb).not.toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
    unsub(); // should not throw
  });

  it('subscribeOutput with DB finds latest run log and calls callback with done', () => {
    mockDb.runLogs.findLatestByTaskId.mockReturnValue({
      id: 5,
      task_id: 99,
      started_at: '2024-01-01',
      finished_at: '2024-01-01',
      exit_code: 0,
      session_id: null,
      events: '[]',
    });
    const svc = new PtySessionService(mockDb as never);
    const cb = vi.fn();
    const unsub = svc.subscribeOutput(99, cb);
    expect(cb).toHaveBeenCalledWith({ kind: 'done', exitCode: 0 });
    expect(typeof unsub).toBe('function');
  });

  it('subscribeOutput with DB returns no-op when no run log found', () => {
    const svc = new PtySessionService(mockDb as never);
    const cb = vi.fn();
    svc.subscribeOutput(99, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('subscribeOutputUpdate with non-running finished task calls callback immediately', () => {
    mockDb.runLogs.findLatestByTaskId.mockReturnValue({
      id: 5,
      task_id: 99,
      started_at: '2024-01-01',
      finished_at: '2024-01-01',
      exit_code: 0,
      session_id: null,
      events: '[]',
    });
    const svc = new PtySessionService(mockDb as never);
    const cb = vi.fn();
    const unsub = svc.subscribeOutputUpdate(99, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub(); // should not throw
  });

  it('subscribeOutputUpdate with non-running unfinished task does not call callback', () => {
    mockDb.runLogs.findLatestByTaskId.mockReturnValue({
      id: 5,
      task_id: 99,
      started_at: '2024-01-01',
      finished_at: null,
      exit_code: null,
      session_id: null,
      events: '[]',
    });
    const svc = new PtySessionService(mockDb as never);
    const cb = vi.fn();
    svc.subscribeOutputUpdate(99, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('subscribeRawOutput with non-running task returns no-op unsubscribe', () => {
    const svc = new PtySessionService();
    const cb = vi.fn();
    const unsub = svc.subscribeRawOutput(99, cb);
    expect(cb).not.toHaveBeenCalled();
    unsub(); // should not throw
  });
});

describe('PtySessionService - DB integration on exit', () => {
  function createMockRunLogs() {
    return {
      create: vi.fn().mockReturnValue(42),
      updateFinished: vi.fn(),
      updateEvents: vi.fn(),
      findLatestByTaskId: vi.fn().mockReturnValue(null),
      findByTaskId: vi.fn().mockReturnValue([]),
      findIdsByTaskId: vi.fn().mockReturnValue([1, 2, 3, 4, 5, 6]),
      deleteMany: vi.fn(),
      updateSessionId: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls updateFinished with finishedAt, exitCode, and events on exit', async () => {
    const mockDb = { runLogs: createMockRunLogs() };
    const svc = new PtySessionService(mockDb as never);
    await svc.startProcess(1, 'prompt', 'run');
    mockOnDataHandler?.('hello output');
    mockOnExitHandler?.({ exitCode: 2 });
    expect(mockDb.runLogs.updateFinished).toHaveBeenCalledWith(
      42,
      expect.any(String),
      2,
      expect.stringContaining('hello output')
    );
  });

  it('calls deleteMany for old run logs when count > 5', async () => {
    const mockDb = { runLogs: createMockRunLogs() };
    const svc = new PtySessionService(mockDb as never);
    await svc.startProcess(1, 'prompt', 'run');
    mockOnExitHandler?.({ exitCode: 0 });
    expect(mockDb.runLogs.deleteMany).toHaveBeenCalledWith([6]);
  });

  it('does not call deleteMany when run log count <= 5', async () => {
    const mockDb = { runLogs: createMockRunLogs() };
    mockDb.runLogs.findIdsByTaskId.mockReturnValue([1, 2, 3, 4, 5]);
    const svc = new PtySessionService(mockDb as never);
    await svc.startProcess(1, 'prompt', 'run');
    mockOnExitHandler?.({ exitCode: 0 });
    expect(mockDb.runLogs.deleteMany).not.toHaveBeenCalled();
  });

  it('throttles updateEvents calls (not called if < 2000ms since last)', async () => {
    const mockDb = { runLogs: createMockRunLogs() };
    const svc = new PtySessionService(mockDb as never);
    await svc.startProcess(1, 'prompt', 'run');
    mockOnDataHandler?.('data1');
    mockOnDataHandler?.('data2');
    // Both data events arrive within 0ms — only one updateEvents call
    expect(mockDb.runLogs.updateEvents).toHaveBeenCalledTimes(1);
    // Advance 2001ms and trigger more data
    vi.advanceTimersByTime(2001);
    mockOnDataHandler?.('data3');
    expect(mockDb.runLogs.updateEvents).toHaveBeenCalledTimes(2);
  });
});

describe('PtySessionService - getRunLogs', () => {
  it('returns empty array when no DB configured', () => {
    const svc = new PtySessionService();
    expect(svc.getRunLogs(1)).toEqual([]);
  });

  it('maps DB rows to RunLog objects with JSON.parsed events', () => {
    const mockDb = {
      runLogs: {
        create: vi.fn(),
        updateFinished: vi.fn(),
        updateEvents: vi.fn(),
        findLatestByTaskId: vi.fn(),
        findByTaskId: vi
          .fn()
          .mockReturnValue([
            {
              id: 10,
              task_id: 1,
              started_at: '2024-01-01T00:00:00Z',
              finished_at: '2024-01-01T01:00:00Z',
              exit_code: 0,
              session_id: null,
              events: '[{"kind":"text","text":"hello"}]',
            },
          ]),
        findIdsByTaskId: vi.fn().mockReturnValue([]),
        deleteMany: vi.fn(),
        updateSessionId: vi.fn(),
      },
    };
    const svc = new PtySessionService(mockDb as never);
    const logs = svc.getRunLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(10);
    expect(logs[0].events).toEqual([{ kind: 'text', text: 'hello' }]);
  });
});

describe('PtySessionService - ready signal with session deleted before write', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not write prompt if session is removed before the 500ms delay fires', async () => {
    const svc = new PtySessionService();
    await svc.startProcess(1, 'hello', 'run');
    mockOnDataHandler?.('bypass permissions');
    // Session exits before the 500ms delay fires
    mockOnExitHandler?.({ exitCode: 0 });
    mockWrite.mockClear();
    vi.advanceTimersByTime(600);
    // prompt should not have been written since session was gone
    expect(mockWrite).not.toHaveBeenCalledWith('hello');
  });
});

describe('PtySessionService - uncovered methods', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setBoardApiUrl updates the boardApiUrl', async () => {
    const pty = await import('node-pty');
    const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();
    const savedApiUrl = process.env.BOARD_API_URL;
    const savedTaskId = process.env.BOARD_TASK_ID;
    delete process.env.BOARD_API_URL;
    delete process.env.BOARD_TASK_ID;
    try {
      const svc = new PtySessionService();
      svc.setBoardApiUrl('http://example.com');
      await svc.startProcess(1, 'prompt', 'run');
      const env = (spawnMock.mock.calls[0][2] as { env: Record<string, string> }).env;
      expect(env.BOARD_API_URL).toBe('http://example.com');
      expect(env.BOARD_TASK_ID).toBe('1');
    } finally {
      if (savedApiUrl !== undefined) process.env.BOARD_API_URL = savedApiUrl;
      if (savedTaskId !== undefined) process.env.BOARD_TASK_ID = savedTaskId;
    }
  });

  it('isUserStopped returns true after stopProcess', async () => {
    const svc = new PtySessionService();
    await svc.startProcess(1, 'prompt', 'run');
    svc.stopProcess(1);
    expect(svc.isUserStopped(1)).toBe(true);
  });

  it('isUserStopped returns false for task that was never stopped', () => {
    const svc = new PtySessionService();
    expect(svc.isUserStopped(999)).toBe(false);
  });

  it('writeInput writes data to the session', async () => {
    const svc = new PtySessionService();
    await svc.startProcess(1, 'prompt', 'run');
    mockWrite.mockClear();
    svc.writeInput(1, 'some input');
    expect(mockWrite).toHaveBeenCalledWith('some input');
  });

  it('writeInput is no-op for non-existent session', () => {
    const svc = new PtySessionService();
    expect(() => svc.writeInput(999, 'data')).not.toThrow();
  });

  it('subscribeCompletionConfirm and notifyCompletionConfirm work together', () => {
    const svc = new PtySessionService();
    const cb = vi.fn();
    const unsub = svc.subscribeCompletionConfirm(cb);
    svc.notifyCompletionConfirm(42, 'done');
    expect(cb).toHaveBeenCalledWith(42, 'done');
    unsub();
    svc.notifyCompletionConfirm(42, 'done');
    expect(cb).toHaveBeenCalledTimes(1);
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
