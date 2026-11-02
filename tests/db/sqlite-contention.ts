import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSQLiteDatabase } from '../../src/db/open-sqlite-database';
import { SQLiteStorageBackend } from '../../src/db/adapters/sqlite-storage-backend';
import { runMigrations } from '../../src/db/schema';

export async function withWriteLock(filename: string, duration: number, run: () => void): Promise<void> {
  const child = spawn('node', [join(__dirname, '../fixtures/sqlite-write-lock.cjs'), filename, String(duration)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), duration + 10_000);
  const exited = once(child, 'exit');
  try {
    const [ready] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.toString(), 'locked\n');
    run();
  } finally {
    clearTimeout(timeout);
    child.kill('SIGKILL');
    await exited;
  }
}

export async function verifySQLiteContention(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'agkan-contention-'));
  const filename = join(directory, 'logs.db');
  let db = openSQLiteDatabase(filename);
  try {
    assert.deepEqual(db.pragma('busy_timeout'), [{ timeout: 5000 }]);
    // A new connection must wait even for the first migration write.
    db.close();
    db = openSQLiteDatabase(filename);
    await withWriteLock(filename, 250, () => runMigrations(db));
    const backend = new SQLiteStorageBackend(db);
    const task = backend.tasks.create({ title: 'contention', status: 'ready', created_at: '', updated_at: '' });
    let id = 0;
    await withWriteLock(filename, 250, () => {
      id = backend.runLogs.create(task.id, 'start');
    });
    await withWriteLock(filename, 250, () => backend.runLogs.updateEvents(id, '[{"kind":"text","text":"latest"}]'));
    assert.equal(backend.runLogs.findLatestByTaskId(task.id)?.events, '[{"kind":"text","text":"latest"}]');
    await withWriteLock(filename, 250, () => backend.runLogs.updateFinished(id, 'end', 7, '[]'));
    const row = backend.runLogs.findLatestByTaskId(task.id);
    assert.equal(row?.finished_at, 'end');
    assert.equal(row?.exit_code, 7);
    assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
