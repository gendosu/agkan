import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// The supervisor is separate from the synchronous SQLite HTTP/CLI processes.
export async function verifyWALReads({ filename, baseUrl, count, taskId, runCount }) {
  const writer = spawn(
    'node',
    [
      fileURLToPath(new URL('../../tests/fixtures/sqlite-write-lock.cjs', import.meta.url)),
      filename,
      '7000',
      'exclusive',
      String(taskId),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let diagnostics = '';
  writer.stderr.on('data', (data) => {
    diagnostics += data;
  });
  const exited = once(writer, 'exit');
  const watchdog = setTimeout(() => writer.kill('SIGKILL'), 15_000);
  try {
    const [ready] = await once(writer.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.toString(), 'locked\n');
    const start = performance.now();
    const [response, result] = await Promise.all([
      fetch(`${baseUrl}/api/tasks`, { signal: AbortSignal.timeout(5500) }),
      runCount(),
    ]);
    assert.equal(response.status, 200);
    const { tasks } = await response.json();
    assert.equal(tasks.find((task) => task.id === taskId)?.title, 'WAL before lock');
    assert.equal(JSON.parse(result).total, count);
    assert.equal(writer.exitCode, null, 'reads must finish before the writer releases the lock');
    const elapsed = Math.round(performance.now() - start);
    const [code, signal] = await exited;
    assert.equal(code, 0, diagnostics);
    assert.equal(signal, null);
    const after = await fetch(`${baseUrl}/api/tasks`, { signal: AbortSignal.timeout(5000) });
    assert.equal(after.status, 200);
    assert.equal((await after.json()).tasks.find((task) => task.id === taskId)?.title, 'WAL after lock');
    return elapsed;
  } finally {
    clearTimeout(watchdog);
    writer.kill('SIGKILL');
    await exited;
  }
}
