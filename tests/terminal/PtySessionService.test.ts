import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtySessionService } from '../../src/terminal/PtySessionService';
import { ConflictError } from '../../src/errors';

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

  it('throws ConflictError if session already running for taskId', () => {
    service.startProcess(1, 'prompt', 'run');
    expect(() => service.startProcess(1, 'prompt2', 'run')).toThrow(ConflictError);
  });

  it('auto-sends prompt after 1500ms delay', () => {
    service.startProcess(1, 'Task ID: 1\n/agkan-planning-subtask', 'planning');
    expect(mockWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockWrite).toHaveBeenCalledWith('Task ID: 1\n/agkan-planning-subtask\r');
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
    vi.advanceTimersByTime(1500); // let initial prompt send
    mockWrite.mockClear();
    mockOnDataHandler?.('Do you trust the files in this folder?\n> Yes, I trust (y/n): ');
    expect(mockWrite).toHaveBeenCalledWith('y\r');
  });

  it('resizes PTY session', () => {
    service.startProcess(1, 'prompt', 'run');
    service.resize(1, 100, 30);
    expect(mockResize).toHaveBeenCalledWith(100, 30);
  });
});
