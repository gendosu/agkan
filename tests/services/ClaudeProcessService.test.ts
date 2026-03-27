import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ClaudeProcessService } from '../../src/services/ClaudeProcessService';
import type { OutputEvent } from '../../src/services/ClaudeProcessService';

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
        ['--output-format', 'stream-json', '--verbose', '-p', 'Hello world'],
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

      expect(service.listRunningTasks()).not.toContain(1);
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

      expect(service.listRunningTasks()).toContain(1);
      expect(service.listRunningTasks()).toContain(2);
      expect(service.listRunningTasks()).toHaveLength(2);
    });
  });

  // --- subscribeOutput ---

  describe('subscribeOutput', () => {
    it('should call the callback with error when taskId is not running', () => {
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

      expect(service.listRunningTasks()).not.toContain(1);
    });
  });
});
