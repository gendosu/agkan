import { constants } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import * as pty from 'node-pty';
import type { IPty, IPtyForkOptions } from 'node-pty';

export type PtyProcess = Pick<IPty, 'pid' | 'write' | 'resize' | 'kill' | 'onData' | 'onExit'>;
type PtyOptions = Pick<IPtyForkOptions, 'name' | 'cols' | 'rows' | 'cwd' | 'env'>;
type ExitEvent = { exitCode: number; signal: number };

interface BunTerminal {
  write(data: string | Uint8Array): number;
  resize(cols: number, rows: number): void;
  close(): void;
}

interface BunChild {
  pid: number;
  terminal: BunTerminal;
  exited: Promise<number>;
  signalCode: NodeJS.Signals | number | null;
  kill(signal?: string): void;
}

interface BunPtyRuntime {
  spawn(
    args: string[],
    options: {
      cwd?: string;
      env?: IPtyForkOptions['env'];
      terminal: {
        name?: string;
        cols?: number;
        rows?: number;
        data(terminal: BunTerminal, data: Uint8Array): void;
        exit(terminal: BunTerminal, code: number): void;
      };
    }
  ): BunChild;
}

function spawnBunPty(bun: BunPtyRuntime, file: string, args: string[], options: PtyOptions): PtyProcess {
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(event: ExitEvent) => void>();
  const decoder = new StringDecoder('utf8');
  const emitData = (text: string) => {
    if (text) dataListeners.forEach((listener) => listener(text));
  };
  let streamClosed!: () => void;
  const drained = new Promise<void>((resolve) => {
    streamClosed = resolve;
  });
  const child = bun.spawn([file, ...args], {
    cwd: options.cwd,
    env: options.env,
    terminal: {
      name: options.name,
      cols: options.cols,
      rows: options.rows,
      data: (_terminal, data) => emitData(decoder.write(Buffer.from(data))),
      exit: () => streamClosed(),
    },
  });

  const finish = async (exitCode: number) => {
    // Drain trailing output, but do not wait forever for descendants holding the slave open.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      drained,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 200);
      }),
    ]);
    clearTimeout(timer);
    emitData(decoder.end());
    child.terminal.close();
    // Terminal.exit reports PTY lifecycle status (including EIO), not the child's exit status.
    const signal = child.signalCode;
    const signalNumber = typeof signal === 'number' ? signal : signal ? constants.signals[signal] : 0;
    exitListeners.forEach((listener) => listener({ exitCode, signal: signalNumber }));
    dataListeners.clear();
    exitListeners.clear();
  };
  void child.exited.then(finish, () => finish(1));

  return {
    pid: child.pid,
    write: (data) => {
      child.terminal.write(data);
    },
    resize: (cols, rows) => child.terminal.resize(cols, rows),
    kill: (signal = 'SIGHUP') => child.kill(signal),
    onData: (listener) => {
      dataListeners.add(listener);
      return {
        dispose: () => {
          dataListeners.delete(listener);
        },
      };
    },
    onExit: (listener) => {
      exitListeners.add(listener);
      return {
        dispose: () => {
          exitListeners.delete(listener);
        },
      };
    },
  };
}

export function spawnPty(file: string, args: string[], options: PtyOptions): PtyProcess {
  const bun = (globalThis as { Bun?: BunPtyRuntime }).Bun;
  if (bun) return spawnBunPty(bun, file, args, options);

  // Bun's tty.ReadStream closes the PTY master on EAGAIN, causing an unsolicited SIGHUP.
  return pty.spawn(file, args, options);
}
