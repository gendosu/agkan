import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyWALReads } from '../../scripts/lib/verify-wal-reads.mjs';

const exec = promisify(execFile);

export async function verifyWALReadProcesses(mode: string, executable = process.execPath): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'agkan-wal-reads-'));
  let board: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let diagnostics = '';
  try {
    await build({
      entryPoints: ['src/cli/index.ts', 'tests/fixtures/wal-board.ts'],
      outdir: directory,
      outbase: '.',
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'cjs',
    });
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      NODE_PATH: join(process.cwd(), 'node_modules'),
      AGENT_KANBAN_DB_PATH: join(directory, 'data.db'),
      AGKAN_DATA_DIR: join(directory, 'state'),
    };
    board = spawn(executable, [join(directory, 'tests/fixtures/wal-board.js'), mode], {
      cwd: directory,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    exited = once(board, 'exit');
    board.stderr!.on('data', (data) => {
      diagnostics += data;
    });
    watchdog = setTimeout(() => board?.kill('SIGKILL'), 20_000);
    const [ready] = await once(board.stdout!, 'data', { signal: AbortSignal.timeout(10_000) });
    const { port } = JSON.parse(ready.toString());
    const elapsed = await verifyWALReads({
      filename: env.AGENT_KANBAN_DB_PATH,
      baseUrl: `http://127.0.0.1:${port}`,
      count: 1,
      taskId: 1,
      runCount: async () =>
        (
          await exec(executable, [join(directory, 'src/cli/index.js'), 'task', 'count', '--json'], {
            cwd: directory,
            env,
            timeout: 5500,
          })
        ).stdout,
    });
    assert.ok(elapsed < 7000, diagnostics);
  } finally {
    clearTimeout(watchdog);
    board?.kill('SIGKILL');
    await exited;
    rmSync(directory, { recursive: true, force: true });
  }
}
