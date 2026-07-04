import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getDefaultDirName } from '../../db/config';

export function getPidFilePath(): string {
  return path.join(process.cwd(), getDefaultDirName(), 'board.pid');
}

export function readBoardPid(): number | null {
  const pidFile = getPidFilePath();
  if (!fs.existsSync(pidFile)) return null;
  const content = fs.readFileSync(pidFile, 'utf8').trim();
  const pid = parseInt(content, 10);
  return isNaN(pid) ? null : pid;
}

export function isBoardRunning(): boolean {
  const pid = readBoardPid();
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writePidFile(pid: number): void {
  const pidFile = getPidFilePath();
  const dir = path.dirname(pidFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pidFile, String(pid), { encoding: 'utf8', mode: 0o600 });
}

export function removePidFile(): void {
  const pidFile = getPidFilePath();
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

export function spawnBoardDaemon(boardArgs: string[]): number {
  const child = spawn(process.argv[0], [process.argv[1], 'board', ...boardArgs], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  if (child.pid === undefined) {
    throw new Error('Failed to spawn board daemon: child process has no PID');
  }
  const pid = child.pid;
  writePidFile(pid);
  return pid;
}

export interface WaitForBoardReadyOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
}

export async function waitForBoardReady(port: number, options: WaitForBoardReadyOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 100;
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + timeoutMs;

  do {
    const controller = new AbortController();
    const attemptTimeout = setTimeout(() => controller.abort(), Math.max(deadline - Date.now(), 50));
    try {
      const response = await fetchImpl(`http://localhost:${port}/api/version`, { signal: controller.signal });
      if (response.ok) return true;
    } catch {
      // Server not accepting connections yet, or the request stalled/was aborted; retry until the deadline.
    } finally {
      clearTimeout(attemptTimeout);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);

  return false;
}

export function killBoardProcess(): boolean {
  const pid = readBoardPid();
  if (pid === null) return false;
  try {
    process.kill(pid, 'SIGTERM');
    removePidFile();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
      removePidFile();
      return false;
    }
    throw err;
  }
}
