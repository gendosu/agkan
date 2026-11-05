import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSQLiteDatabase } from '../src/db/open-sqlite-database.ts';
import { SQLiteStorageBackend } from '../src/db/adapters/sqlite-storage-backend.ts';
import { runMigrations } from '../src/db/schema.ts';
import { DatabaseConnection } from '../src/db/connection.ts';
import { TaskService } from '../src/services/TaskService.ts';
import { sqliteContractCases } from '../tests/db/sqlite-contract.ts';
import { verifyWALReadProcesses } from '../tests/db/sqlite-wal-processes.ts';
import { verifySQLiteContention } from '../tests/db/sqlite-contention.ts';

if (!process.versions.bun) throw new Error('Run this script with Bun after pnpm run build:server');

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
console.log(`Bun ${process.versions.bun}: SQLite compatibility verification`);
for (const mode of ['new', 'migrate']) {
  await verifyWALReadProcesses(mode);
  console.log(`PASS Bun ${mode} database: HTTP and independent CLI read during 7s EXCLUSIVE writer transaction`);
}
await verifySQLiteContention();
console.log('PASS independent-process SQLite locks: initialization, create, updateEvents, updateFinished');

for (const { name, run } of sqliteContractCases) {
  const db = openSQLiteDatabase(':memory:');
  try {
    run(db);
    console.log(`PASS ${name}`);
  } finally {
    db.close();
  }
}

function runNode(code, filename) {
  return JSON.parse(
    execFileSync('node', ['-e', code, filename], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 30000,
    })
  );
}

const tempDirectory = mkdtempSync(join(tmpdir(), 'agkan-bun-sqlite-'));
try {
  const originalDbPath = process.env.AGENT_KANBAN_DB_PATH;
  process.env.AGENT_KANBAN_DB_PATH = join(tempDirectory, 'connection', 'service.db');
  try {
    const service = new TaskService();
    const task = service.createTask({ title: 'Bun service integration', status: 'ready' });
    assert.equal(service.getTask(task.id).title, task.title);
    assert.deepEqual(DatabaseConnection.getInstance().pragma('foreign_keys'), [{ foreign_keys: 1 }]);
    assert.deepEqual(DatabaseConnection.getInstance().pragma('busy_timeout'), [{ timeout: 5000 }]);
    DatabaseConnection.close();
    assert.equal(new TaskService().getTask(task.id).title, task.title);
    assert.deepEqual(DatabaseConnection.getInstance().pragma('busy_timeout'), [{ timeout: 5000 }]);
    console.log('PASS DatabaseConnection and TaskService integration, close and reopen');
  } finally {
    DatabaseConnection.close();
    if (originalDbPath === undefined) delete process.env.AGENT_KANBAN_DB_PATH;
    else process.env.AGENT_KANBAN_DB_PATH = originalDbPath;
  }

  const filename = join(tempDirectory, 'interop.db');
  const seed = runNode(
    `
    const { openSQLiteDatabase } = require('./dist/db/open-sqlite-database.js');
    const { runMigrations } = require('./dist/db/schema.js');
    const { SQLiteStorageBackend } = require('./dist/db/adapters/sqlite-storage-backend.js');
    const db = openSQLiteDatabase(process.argv[1]);
    try {
      db.pragma('foreign_keys = ON');
      db.pragma('journal_mode = WAL');
      runMigrations(db);
      const backend = new SQLiteStorageBackend(db);
      const task = backend.tasks.create({ title: 'from Node', status: 'ready',
        created_at: '2026-10-30', updated_at: '2026-10-30' });
      console.log(JSON.stringify(task));
    } finally { db.close(); }
  `,
    filename
  );

  const db = openSQLiteDatabase(filename);
  let bunTask;
  try {
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    const backend = new SQLiteStorageBackend(db);
    assert.deepEqual(backend.tasks.findById(seed.id), seed);
    assert.equal(backend.tasks.update(seed.id, { status: 'done' }).status, 'done');
    bunTask = backend.tasks.create({
      title: 'from Bun',
      status: 'ready',
      created_at: '2026-10-30',
      updated_at: '2026-10-30',
    });
    assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }

  const reopened = runNode(
    `
    const assert = require('node:assert/strict');
    const { openSQLiteDatabase } = require('./dist/db/open-sqlite-database.js');
    const { runMigrations } = require('./dist/db/schema.js');
    const { SQLiteStorageBackend } = require('./dist/db/adapters/sqlite-storage-backend.js');
    const db = openSQLiteDatabase(process.argv[1]);
    try {
      runMigrations(db);
      const backend = new SQLiteStorageBackend(db);
      const tasks = backend.tasks.findAll({}, { field: 'id', order: 'asc' });
      assert.equal(tasks[0].status, 'done');
      assert.equal(tasks[1].title, 'from Bun');
      assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
      backend.tasks.update(tasks[0].id, { title: 'Node round trip' });
      console.log(JSON.stringify(tasks));
    } finally { db.close(); }
  `,
    filename
  );
  assert.deepEqual(reopened[1], bunTask);

  const roundTrip = openSQLiteDatabase(filename);
  try {
    const backend = new SQLiteStorageBackend(roundTrip);
    assert.equal(backend.tasks.findById(seed.id).title, 'Node round trip');
  } finally {
    roundTrip.close();
  }
  console.log('PASS Node → Bun → Node → Bun file compatibility (WAL, migrations, read/write, integrity)');
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
