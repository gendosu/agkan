import assert from 'node:assert/strict';
import type { SQLiteDatabase } from '../../src/db/types/sqlite';
import { SQLiteAdapter } from '../../src/db/adapters/sqlite-adapter';
import { SQLiteStorageBackend } from '../../src/db/adapters/sqlite-storage-backend';
import { runMigrations } from '../../src/db/schema';
import { migrations } from '../../src/db/migrations';

const timestamp = '2026-10-30T00:00:00.000Z';
const taskInput = { title: 'SQLite検証', status: 'ready' as const, created_at: timestamp, updated_at: timestamp };

export const sqliteContractCases: Array<{ name: string; run: (db: SQLiteDatabase) => void }> = [
  {
    name: 'preserves prepared statement results, nulls, row IDs and change counts',
    run(db) {
      db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT, amount REAL)');
      const insert = db.prepare('INSERT INTO sample (value, amount) VALUES (?, ?)');
      assert.deepEqual(insert.run('日本語', 1.5), { changes: 1, lastInsertRowid: 1 });
      assert.deepEqual(insert.run(null, 2), { changes: 1, lastInsertRowid: 2 });
      const select = db.prepare('SELECT * FROM sample WHERE id = ?');
      assert.deepEqual(select.get(1), { id: 1, value: '日本語', amount: 1.5 });
      assert.deepEqual(select.get(2), { id: 2, value: null, amount: 2 });
      assert.equal(select.get(999), undefined);
      assert.deepEqual(select.all(999), []);
      assert.equal(db.prepare('UPDATE sample SET value = ?').run('updated').changes, 2);
      assert.equal(db.prepare('DELETE FROM sample WHERE id = ?').run(1).changes, 1);
    },
  },
  {
    name: 'keeps bound parameters across get, all and run and forbids rebinding',
    run(db) {
      const adapter = new SQLiteAdapter(db);
      const select = adapter.prepare('SELECT ? AS value');
      assert.equal(select.bind('bound'), select);
      assert.deepEqual(select.get(), { value: 'bound' });
      assert.deepEqual(select.all(), [{ value: 'bound' }]);
      assert.throws(() => select.get('replacement'));
      assert.throws(() => select.bind('replacement'));
      db.exec('CREATE TABLE sample (value TEXT)');
      const insert = adapter.prepare('INSERT INTO sample VALUES (?)').bind('bound');
      assert.equal(insert.run().changes, 1);
      assert.equal(insert.run().changes, 1);
      assert.deepEqual(db.prepare('SELECT * FROM sample').all(), [{ value: 'bound' }, { value: 'bound' }]);
    },
  },
  {
    name: 'rejects missing and excess bindings, including after a previous execution',
    run(db) {
      const stmt = db.prepare('SELECT ? AS value');
      for (const method of ['get', 'all', 'run'] as const) {
        assert.throws(() => stmt[method]());
        assert.throws(() => stmt[method](1, 2));
      }
      assert.deepEqual(stmt.get(1), { value: 1 });
      assert.throws(() => stmt.get());
      assert.throws(() => stmt.bind());
      assert.deepEqual(stmt.bind(2).get(), { value: 2 });
    },
  },
  {
    name: 'supports PRAGMA reads, writes and table introspection',
    run(db) {
      const adapter = new SQLiteAdapter(db);
      adapter.pragma('foreign_keys = ON');
      assert.deepEqual(adapter.pragma('foreign_keys'), [{ foreign_keys: 1 }]);
      assert.deepEqual(adapter.pragma('journal_mode'), [{ journal_mode: 'memory' }]);
      db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)');
      const columns = adapter.pragma('table_info(sample)') as Array<{ name: string }>;
      assert.deepEqual(
        columns.map((column) => column.name),
        ['id', 'value']
      );
    },
  },
  {
    name: 'preserves transaction return values, nested savepoints and rollbacks',
    run(db) {
      db.exec('CREATE TABLE sample (value TEXT UNIQUE)');
      const insert = db.prepare('INSERT INTO sample VALUES (?)');
      const value = db.transaction(() => {
        insert.run('outer');
        assert.throws(() =>
          db.transaction(() => {
            insert.run('inner');
            throw new Error('inner rollback');
          })()
        );
        return 'committed';
      })();
      assert.equal(value, 'committed');
      assert.deepEqual(db.prepare('SELECT * FROM sample').all(), [{ value: 'outer' }]);
      assert.throws(() =>
        db.transaction(() => {
          insert.run('rolled back');
          db.transaction(() => insert.run('nested'))();
          throw new Error('outer rollback');
        })()
      );
      assert.deepEqual(db.prepare('SELECT * FROM sample').all(), [{ value: 'outer' }]);
    },
  },
  {
    name: 'applies every production migration once with foreign keys enabled',
    run(db) {
      db.pragma('foreign_keys = ON');
      runMigrations(db);
      runMigrations(db);
      assert.deepEqual(
        db.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
        migrations.map(({ version }) => ({ version }))
      );
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    },
  },
  {
    name: 'migrates a legacy schema without losing existing tasks',
    run(db) {
      db.exec(`CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT,
        status TEXT NOT NULL DEFAULT 'backlog', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL, assignees TEXT, priority TEXT
      ); INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('legacy', 'backlog', '', '')`);
      runMigrations(db);
      runMigrations(db);
      const backend = new SQLiteStorageBackend(db);
      assert.equal(backend.tasks.findById(1)?.title, 'legacy');
      assert.equal(backend.tasks.findById(1)?.is_archived, 0);
      assert.equal(backend.tasks.findById(1)?.model_run, null);
    },
  },
  {
    name: 'supports task CRUD, archive flags and nullable model overrides',
    run(db) {
      runMigrations(db);
      const backend = new SQLiteStorageBackend(db);
      const task = backend.tasks.create({ ...taskInput, model_run: 'sonnet', effort_run: 'high', priority: 'high' });
      assert.equal(typeof task.id, 'number');
      assert.equal(task.body, null);
      assert.equal(task.model_run, 'sonnet');
      assert.equal(backend.tasks.update(task.id, { model_run: null, status: 'done' })?.model_run, null);
      assert.equal(backend.tasks.countByStatus().done, 1);
      assert.equal(backend.tasks.archiveMany([task.id]), 1);
      assert.deepEqual(backend.tasks.findAll(), []);
      assert.equal(backend.tasks.findAll({ includeArchived: true }).length, 1);
      assert.equal(backend.tasks.unarchiveMany([task.id]), 1);
      assert.equal(backend.tasks.delete(task.id), true);
      assert.equal(backend.tasks.findById(task.id), null);
    },
  },
  {
    name: 'supports tags, blocking relationships, metadata filters and cascades',
    run(db) {
      db.pragma('foreign_keys = ON');
      runMigrations(db);
      const backend = new SQLiteStorageBackend(db);
      const parent = backend.tasks.create(taskInput);
      const child = backend.tasks.create({ ...taskInput, title: 'child', parent_id: parent.id });
      const tag = backend.tags.create({ name: 'bun', created_at: timestamp });
      backend.taskTags.create({ task_id: parent.id, tag_id: tag.id, created_at: timestamp });
      backend.blocks.create({ blocker_task_id: parent.id, blocked_task_id: child.id, created_at: timestamp });
      backend.metadata.set({
        task_id: parent.id,
        key: 'runtime',
        value: 'bun',
        created_at: timestamp,
        updated_at: timestamp,
      });
      assert.deepEqual(backend.tasks.findAll({ tagIds: [tag.id], metadata: [{ key: 'runtime', value: 'bun' }] }), [
        parent,
      ]);
      assert.deepEqual(backend.blocks.findBlockerTaskIds(child.id), [parent.id]);
      assert.deepEqual(backend.tasks.findAll({ unblocked: true }), [parent]);
      assert.throws(() => backend.tags.create({ name: 'bun', created_at: timestamp }));
      assert.throws(() => backend.taskTags.create({ task_id: 999, tag_id: tag.id, created_at: timestamp }));
      assert.throws(() => backend.tasks.update(child.id, { status: 'invalid' as typeof child.status }));
      backend.tasks.delete(parent.id);
      assert.equal(backend.tasks.findById(child.id)?.parent_id, null);
      assert.deepEqual(backend.taskTags.findTagIdsByTaskId(parent.id), []);
      assert.deepEqual(backend.metadata.findByTaskId(parent.id), []);
      assert.deepEqual(backend.blocks.findAll(), []);
    },
  },
  {
    name: 'supports comments and run logs, including JSON events and updates',
    run(db) {
      runMigrations(db);
      const backend = new SQLiteStorageBackend(db);
      const task = backend.tasks.create(taskInput);
      const comment = backend.comments.create({
        task_id: task.id,
        content: '検証コメント',
        created_at: timestamp,
        updated_at: timestamp,
      });
      assert.equal(comment.author, null);
      assert.equal(backend.comments.update(comment.id, 'updated', timestamp)?.content, 'updated');
      const logId = backend.runLogs.create(task.id, timestamp);
      backend.runLogs.updateSessionId(logId, 'sqlite-spike');
      backend.runLogs.updateFinished(logId, timestamp, 0, '[{"type":"done"}]');
      const log = backend.runLogs.findLatestByTaskId(task.id);
      assert.equal(log?.session_id, 'sqlite-spike');
      assert.equal(log?.exit_code, 0);
      assert.deepEqual(JSON.parse(log!.events), [{ type: 'done' }]);
      assert.equal(backend.comments.delete(comment.id), true);
      backend.runLogs.deleteMany([logId]);
      assert.deepEqual(backend.runLogs.findByTaskId(task.id, 10), []);
    },
  },
];
