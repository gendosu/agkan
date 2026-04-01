import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ClaudeProcessService } from '../../src/services/ClaudeProcessService';
import type { OutputEvent } from '../../src/services/ClaudeProcessService';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema';

// ---- Mock child_process ----

vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

import * as childProcess from 'child_process';

// Helper to create a fake ChildProcess
function makeFakeProcess() {
  const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const proc = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
  (proc as unknown as { stdout: unknown; stderr: unknown }).stdout = stdout;
  (proc as unknown as { stdout: unknown; stderr: unknown }).stderr = stderr;
  (proc as unknown as { kill: (sig?: string) => boolean }).kill = vi.fn().mockReturnValue(true);
  return { proc, stdout, stderr };
}

function makeTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// ---- Tests ----

describe('ClaudeProcessService', () => {
  let service: ClaudeProcessService;
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new ClaudeProcessService();
    spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- startProcess ---

  describe('startProcess', () => {
    it('should call spawn with correct arguments', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'Hello world');

      expect(spawnMock).toHaveBeenCalledWith(
        'claude',
        ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '-p', 'Hello world'],
        expect.objectContaining({ cwd: '/workspace' })
      );
    });

    it('should throw when starting a process for an already running taskId', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'First');
      expect(() => service.startProcess(1, 'Second')).toThrow('already running');
    });

    it('should inherit process.env', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'prompt');

      const callArgs = spawnMock.mock.calls[0];
      expect(callArgs[2]).toMatchObject({ env: process.env });
    });
  });

  // --- stopProcess ---

  describe('stopProcess', () => {
    it('should send SIGTERM to the process and return true', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'prompt');
      const result = service.stopProcess(1);

      expect(result).toBe(true);
      expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should return false when taskId is not running', () => {
      const result = service.stopProcess(999);
      expect(result).toBe(false);
    });

    it('should remove the process from the running map', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'prompt');
      service.stopProcess(1);

      expect(service.listRunningTasks().map((t) => t.taskId)).not.toContain(1);
    });
  });

  // --- listRunningTasks ---

  describe('listRunningTasks', () => {
    it('should return empty array when no processes are running', () => {
      expect(service.listRunningTasks()).toEqual([]);
    });

    it('should return the taskIds of running processes', () => {
      const { proc: proc1 } = makeFakeProcess();
      const { proc: proc2 } = makeFakeProcess();
      spawnMock.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

      service.startProcess(1, 'a');
      service.startProcess(2, 'b');

      const taskIds = service.listRunningTasks().map((t) => t.taskId);
      expect(taskIds).toContain(1);
      expect(taskIds).toContain(2);
      expect(taskIds).toHaveLength(2);
    });

    it('should include command in returned tasks', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'prompt', 'planning');

      const tasks = service.listRunningTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual({ taskId: 1, command: 'planning' });
    });
  });

  // --- subscribeOutput ---

  describe('subscribeOutput', () => {
    it('should call the callback with error when taskId is not running and no DB', () => {
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(999, cb);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'error', message: expect.stringContaining('999') })
      );
    });

    it('should replay past events to a late subscriber', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');

      // Emit events before subscribing
      const textEvent = { type: 'assistant', message: { content: [{ type: 'text', text: 'before' }] } };
      const toolEvent = {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: { command: 'ls' } }] },
      };
      (stdout as EventEmitter).emit('data', Buffer.from(JSON.stringify(textEvent) + '\n'));
      (stdout as EventEmitter).emit('data', Buffer.from(JSON.stringify(toolEvent) + '\n'));

      // Subscribe after events were emitted
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenNthCalledWith(1, { kind: 'text', text: 'before' });
      expect(cb).toHaveBeenNthCalledWith(2, { kind: 'tool_use', name: 'Bash', input: { command: 'ls' } });
    });

    it('should return an unsubscribe function', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      const unsubscribe = service.subscribeOutput(1, cb);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should stop calling the callback after unsubscribing', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      const unsubscribe = service.subscribeOutput(1, cb);
      unsubscribe();

      // Emit a text event — callback should NOT be called after unsubscribe
      const event = { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } };
      (stdout as EventEmitter).emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(cb).not.toHaveBeenCalled();
    });

    it('should replay last run log from DB when process not running', () => {
      const db = makeTestDb();
      // Insert a task to satisfy FK
      db.prepare(
        "INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES (1, 'T', 'done', datetime('now'), datetime('now'))"
      ).run();
      // Insert a run log
      const events = JSON.stringify([
        { kind: 'text', text: 'hello from db' },
        { kind: 'tool_use', name: 'Read', input: { path: '/foo' } },
      ]);
      db.prepare(
        "INSERT INTO task_run_logs (task_id, started_at, finished_at, exit_code, events) VALUES (1, datetime('now'), datetime('now'), 0, ?)"
      ).run(events);

      const svc = new ClaudeProcessService(db);
      const received: OutputEvent[] = [];
      svc.subscribeOutput(1, (evt) => received.push(evt));

      expect(received).toHaveLength(3); // 2 events + done
      expect(received[0]).toEqual({ kind: 'text', text: 'hello from db' });
      expect(received[1]).toEqual({ kind: 'tool_use', name: 'Read', input: { path: '/foo' } });
      expect(received[2]).toEqual({ kind: 'done', exitCode: 0 });

      db.close();
    });

    it('should emit error when process not running and no log in DB', () => {
      const db = makeTestDb();
      const svc = new ClaudeProcessService(db);
      const cb = vi.fn<(event: OutputEvent) => void>();
      svc.subscribeOutput(999, cb);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'error', message: expect.stringContaining('999') })
      );

      db.close();
    });
  });

  // --- getOutputBuffer ---

  describe('getOutputBuffer', () => {
    it('should return empty array for unknown taskId', () => {
      expect(service.getOutputBuffer(999)).toEqual([]);
    });

    it('should buffer parsed events', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');

      const event = { type: 'system', subtype: 'init', session_id: 'abc' };
      (stdout as EventEmitter).emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      const buffer = service.getOutputBuffer(1);
      expect(buffer).toHaveLength(1);
      expect(buffer[0]).toMatchObject({ type: 'system', subtype: 'init' });
    });
  });

  // --- getRunLogs ---

  describe('getRunLogs', () => {
    it('should return empty array when no DB configured', () => {
      expect(service.getRunLogs(1)).toEqual([]);
    });

    it('should return empty array when no logs exist for the task', () => {
      const db = makeTestDb();
      const svc = new ClaudeProcessService(db);
      expect(svc.getRunLogs(1)).toEqual([]);
      db.close();
    });

    it('should return saved logs ordered by started_at DESC', () => {
      const db = makeTestDb();
      db.prepare(
        "INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES (1, 'T', 'done', datetime('now'), datetime('now'))"
      ).run();
      db.prepare(
        "INSERT INTO task_run_logs (task_id, started_at, finished_at, exit_code, events) VALUES (1, '2026-03-27T10:00:00.000Z', '2026-03-27T10:01:00.000Z', 0, ?)"
      ).run(JSON.stringify([{ kind: 'text', text: 'first' }]));
      db.prepare(
        "INSERT INTO task_run_logs (task_id, started_at, finished_at, exit_code, events) VALUES (1, '2026-03-27T11:00:00.000Z', '2026-03-27T11:01:00.000Z', 1, ?)"
      ).run(JSON.stringify([{ kind: 'text', text: 'second' }]));

      const svc = new ClaudeProcessService(db);
      const logs = svc.getRunLogs(1);

      expect(logs).toHaveLength(2);
      expect(logs[0].exit_code).toBe(1); // most recent first
      expect(logs[0].events[0]).toEqual({ kind: 'text', text: 'second' });
      expect(logs[1].exit_code).toBe(0);

      db.close();
    });

    it('should return at most 5 logs', () => {
      const db = makeTestDb();
      db.prepare(
        "INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES (1, 'T', 'done', datetime('now'), datetime('now'))"
      ).run();
      for (let i = 0; i < 7; i++) {
        db.prepare(
          "INSERT INTO task_run_logs (task_id, started_at, finished_at, exit_code, events) VALUES (1, datetime('now', '+' || ? || ' seconds'), datetime('now'), 0, ?)"
        ).run(String(i), JSON.stringify([]));
      }

      const svc = new ClaudeProcessService(db);
      expect(svc.getRunLogs(1)).toHaveLength(5);
      db.close();
    });
  });

  // --- DB log saving on process close ---

  describe('DB log saving', () => {
    it('should save log to DB on process close', () => {
      const db = makeTestDb();
      db.prepare(
        "INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES (1, 'T', 'done', datetime('now'), datetime('now'))"
      ).run();

      const svc = new ClaudeProcessService(db);
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      svc.startProcess(1, 'p');

      const textEvent = { type: 'assistant', message: { content: [{ type: 'text', text: 'saved log' }] } };
      (stdout as EventEmitter).emit('data', Buffer.from(JSON.stringify(textEvent) + '\n'));
      (proc as EventEmitter).emit('close', 0);

      const logs = svc.getRunLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].exit_code).toBe(0);
      expect(logs[0].events[0]).toEqual({ kind: 'text', text: 'saved log' });

      db.close();
    });

    it('should rotate and keep only 5 logs per task', () => {
      const db = makeTestDb();
      db.prepare(
        "INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES (1, 'T', 'done', datetime('now'), datetime('now'))"
      ).run();

      const svc = new ClaudeProcessService(db);

      // Insert 5 existing logs
      for (let i = 0; i < 5; i++) {
        db.prepare(
          "INSERT INTO task_run_logs (task_id, started_at, finished_at, exit_code, events) VALUES (1, datetime('now', '-' || ? || ' seconds'), datetime('now'), 0, ?)"
        ).run(String(5 - i), JSON.stringify([]));
      }

      // Run one more process
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);
      svc.startProcess(1, 'p');
      (proc as EventEmitter).emit('close', 0);

      expect(svc.getRunLogs(1)).toHaveLength(5);

      db.close();
    });
  });

  // --- error event handling ---

  describe('error event handling', () => {
    it('should emit error event with friendly message when ENOENT', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
      (proc as EventEmitter).emit('error', err);

      expect(cb).toHaveBeenCalledWith({ kind: 'error', message: 'claude CLI not found in PATH' });
    });

    it('should emit done with exitCode 1 after ENOENT error', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
      (proc as EventEmitter).emit('error', err);

      expect(cb).toHaveBeenCalledWith({ kind: 'done', exitCode: 1 });
    });

    it('should remove process from map after error', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
      (proc as EventEmitter).emit('error', err);

      expect(service.listRunningTasks().map((t) => t.taskId)).not.toContain(1);
    });

    it('should emit original message for non-ENOENT errors', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      (proc as EventEmitter).emit('error', err);

      expect(cb).toHaveBeenCalledWith({ kind: 'error', message: 'permission denied' });
    });

    it('should not emit duplicate done when close fires after error', () => {
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
      (proc as EventEmitter).emit('error', err);
      (proc as EventEmitter).emit('close', null);

      const doneCalls = cb.mock.calls.filter((c) => c[0].kind === 'done');
      expect(doneCalls).toHaveLength(1);
    });

    it('should save error to DB log on ENOENT', () => {
      const db = makeTestDb();
      db.prepare(
        "INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES (1, 'T', 'done', datetime('now'), datetime('now'))"
      ).run();

      const svc = new ClaudeProcessService(db);
      const { proc } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      svc.startProcess(1, 'p');

      const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
      (proc as EventEmitter).emit('error', err);

      const logs = svc.getRunLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].exit_code).toBe(1);
      expect(logs[0].events[0]).toEqual({ kind: 'error', message: 'claude CLI not found in PATH' });

      db.close();
    });
  });

  // --- NDJSON parsing ---

  describe('stdout NDJSON parsing', () => {
    it('should notify subscribers of text content from assistant events', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const event = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello!' }] },
      };
      (stdout as EventEmitter).emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(cb).toHaveBeenCalledWith({ kind: 'text', text: 'Hello!' });
    });

    it('should notify subscribers of tool_use content from assistant events', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const event = {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tid', name: 'bash', input: { command: 'ls' } }],
        },
      };
      (stdout as EventEmitter).emit('data', Buffer.from(JSON.stringify(event) + '\n'));

      expect(cb).toHaveBeenCalledWith({ kind: 'tool_use', name: 'bash', input: { command: 'ls' } });
    });

    it('should continue parsing after a JSON parse failure', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const validEvent = { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } };
      const data = 'NOT_JSON\n' + JSON.stringify(validEvent) + '\n';
      (stdout as EventEmitter).emit('data', Buffer.from(data));

      // Callback should be called once (for the valid event) despite the bad line
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ kind: 'text', text: 'ok' });
    });

    it('should handle events split across multiple data chunks', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      const event = { type: 'assistant', message: { content: [{ type: 'text', text: 'split' }] } };
      const full = JSON.stringify(event) + '\n';
      const half = Math.floor(full.length / 2);

      (stdout as EventEmitter).emit('data', Buffer.from(full.slice(0, half)));
      expect(cb).not.toHaveBeenCalled(); // not yet

      (stdout as EventEmitter).emit('data', Buffer.from(full.slice(half)));
      expect(cb).toHaveBeenCalledWith({ kind: 'text', text: 'split' });
    });

    it('should emit done event on process close', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      const cb = vi.fn<(event: OutputEvent) => void>();
      service.subscribeOutput(1, cb);

      // Simulate stdout end then process close
      (stdout as EventEmitter).emit('data', Buffer.from(''));
      (proc as EventEmitter).emit('close', 0);

      expect(cb).toHaveBeenCalledWith({ kind: 'done', exitCode: 0 });
    });

    it('should remove the process from the map on close', () => {
      const { proc, stdout } = makeFakeProcess();
      spawnMock.mockReturnValue(proc);

      service.startProcess(1, 'p');
      (stdout as EventEmitter).emit('data', Buffer.from(''));
      (proc as EventEmitter).emit('close', 0);

      expect(service.listRunningTasks().map((t) => t.taskId)).not.toContain(1);
    });
  });
});
