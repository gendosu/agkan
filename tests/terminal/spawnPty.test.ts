import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnPty } from '../../src/terminal/spawnPty';

vi.mock('node-pty', () => ({ spawn: vi.fn(() => ({ pid: 42 })) }));

function fakeBun() {
  let resolveExit!: (code: number) => void;
  const child = {
    pid: 123,
    terminal: { write: vi.fn(), resize: vi.fn(), close: vi.fn() },
    kill: vi.fn(),
    signalCode: null as string | number | null,
    exited: new Promise<number>((resolve) => {
      resolveExit = resolve;
    }),
  };
  const spawn = vi.fn<
    (
      args: string[],
      options: {
        terminal: {
          data(terminal: unknown, data: Uint8Array): void;
          exit(terminal: unknown, code: number): void;
        };
      }
    ) => typeof child
  >(() => child);
  vi.stubGlobal('Bun', { spawn });
  return { child, spawn, resolveExit };
}

describe('spawnPty', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('uses node-pty under Node.js', async () => {
    vi.stubGlobal('Bun', undefined);
    const pty = await import('node-pty');
    const options = { cols: 120, rows: 40, cwd: '/tmp', env: { TERM: 'xterm-256color' } };
    expect(spawnPty('agent', ['prompt'], options).pid).toBe(42);
    expect(pty.spawn).toHaveBeenCalledWith('agent', ['prompt'], options);
  });

  it('keeps UTF-8 output intact across chunks and supports disposing listeners', () => {
    const { spawn } = fakeBun();
    const process = spawnPty('codex', ['prompt'], { cols: 220, rows: 50, cwd: '/tmp' });
    const output = vi.fn();
    const listener = process.onData(output);
    const { data } = spawn.mock.calls[0][1].terminal;
    const bytes = Buffer.from('日本語');
    data(null, bytes.subarray(0, 2));
    data(null, bytes.subarray(2));
    expect(output.mock.calls.map(([text]) => text).join('')).toBe('日本語');
    listener.dispose();
    data(null, Buffer.from('ignored'));
    expect(output.mock.calls.map(([text]) => text).join('')).toBe('日本語');
  });

  it('forwards terminal input, resize, environment, and signals', () => {
    const { spawn, child } = fakeBun();
    const options = { name: 'xterm-256color', cols: 220, rows: 50, cwd: '/tmp', env: { TEST: 'value' } };
    const process = spawnPty('codex', ['--', 'prompt'], options);
    expect(spawn).toHaveBeenCalledWith(['codex', '--', 'prompt'], {
      cwd: options.cwd,
      env: options.env,
      terminal: expect.objectContaining({ name: options.name, cols: options.cols, rows: options.rows }),
    });
    process.write('hello\r');
    process.resize(100, 30);
    process.kill('SIGHUP');
    expect(child.terminal.write).toHaveBeenCalledWith('hello\r');
    expect(child.terminal.resize).toHaveBeenCalledWith(100, 30);
    expect(child.kill).toHaveBeenCalledWith('SIGHUP');
  });

  it('drains final output before reporting the actual process exit, ignoring PTY lifecycle codes', async () => {
    const { spawn, child, resolveExit } = fakeBun();
    const process = spawnPty('agent', [], {});
    const events: unknown[] = [];
    process.onData((text) => events.push(text));
    process.onExit((event) => events.push(event));
    resolveExit(7);
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual([]);
    const terminal = spawn.mock.calls[0][1].terminal;
    terminal.data(null, Buffer.from('final output'));
    terminal.exit(null, 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(['final output', { exitCode: 7, signal: 0 }]);
    expect(child.terminal.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['SIGHUP', 1])(
    'preserves signal %s and bounds drainage when descendants keep the PTY open',
    async (signal) => {
      const { child, resolveExit } = fakeBun();
      const process = spawnPty('agent', [], {});
      const exited = vi.fn();
      process.onExit(exited);
      child.signalCode = signal;
      resolveExit(129);
      await vi.advanceTimersByTimeAsync(200);
      expect(exited).toHaveBeenCalledExactlyOnceWith({ exitCode: 129, signal: 1 });
      expect(child.terminal.close).toHaveBeenCalledOnce();
    }
  );
});
