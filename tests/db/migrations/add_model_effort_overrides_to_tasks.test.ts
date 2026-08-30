import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../../src/db/migrations/20260830000000_add_model_effort_overrides_to_tasks';

function createDbWithTables(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE task_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(task_id, key)
    );
  `);
  return db;
}

function insertTask(db: Database.Database, title: string): number {
  db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('${title}', 'backlog', '', '')`);
  return (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
}

function insertMetadata(db: Database.Database, taskId: number, key: string, value: string): void {
  db.prepare(`INSERT INTO task_metadata (task_id, key, value, created_at, updated_at) VALUES (?, ?, ?, '', '')`).run(
    taskId,
    key,
    value
  );
}

function taskColumns(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
}

describe('add_model_effort_overrides_to_tasks migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbWithTables();
  });

  it('adds the four override columns when they do not exist', () => {
    up(db);
    const columns = taskColumns(db);
    expect(columns).toContain('model_planning');
    expect(columns).toContain('model_run');
    expect(columns).toContain('effort_planning');
    expect(columns).toContain('effort_run');
  });

  it('is idempotent when the columns already exist', () => {
    db.exec(`ALTER TABLE tasks ADD COLUMN model_planning TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE tasks ADD COLUMN effort_run TEXT DEFAULT NULL`);
    expect(() => up(db)).not.toThrow();
    const columns = taskColumns(db);
    expect(columns).toContain('model_planning');
    expect(columns).toContain('model_run');
    expect(columns).toContain('effort_planning');
    expect(columns).toContain('effort_run');
  });

  it('defaults to null for existing rows', () => {
    insertTask(db, 'existing');
    up(db);
    const row = db.prepare('SELECT model_planning, model_run, effort_planning, effort_run FROM tasks').get() as {
      model_planning: string | null;
      model_run: string | null;
      effort_planning: string | null;
      effort_run: string | null;
    };
    expect(row.model_planning).toBeNull();
    expect(row.model_run).toBeNull();
    expect(row.effort_planning).toBeNull();
    expect(row.effort_run).toBeNull();
  });

  it('backfills all four keys from task_metadata and deletes the rows', () => {
    const taskId = insertTask(db, 'with-overrides');
    insertMetadata(db, taskId, 'model:planning', 'opus');
    insertMetadata(db, taskId, 'model:run', 'sonnet');
    insertMetadata(db, taskId, 'effort:planning', 'low');
    insertMetadata(db, taskId, 'effort:run', 'xhigh');

    up(db);

    const row = db
      .prepare('SELECT model_planning, model_run, effort_planning, effort_run FROM tasks WHERE id = ?')
      .get(taskId) as {
      model_planning: string;
      model_run: string;
      effort_planning: string;
      effort_run: string;
    };
    expect(row.model_planning).toBe('opus');
    expect(row.model_run).toBe('sonnet');
    expect(row.effort_planning).toBe('low');
    expect(row.effort_run).toBe('xhigh');

    const remaining = db.prepare('SELECT COUNT(*) as n FROM task_metadata').get() as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('leaves unrelated metadata keys untouched', () => {
    const taskId = insertTask(db, 'mixed');
    insertMetadata(db, taskId, 'model:run', 'haiku');
    insertMetadata(db, taskId, 'owner', 'alice');

    up(db);

    const owner = db.prepare(`SELECT value FROM task_metadata WHERE task_id = ? AND key = 'owner'`).get(taskId) as {
      value: string;
    };
    expect(owner.value).toBe('alice');
    const modelRun = db.prepare(`SELECT * FROM task_metadata WHERE task_id = ? AND key = 'model:run'`).get(taskId);
    expect(modelRun).toBeUndefined();
  });

  it('does not overwrite a column that already holds a value, but still deletes the metadata row', () => {
    const taskId = insertTask(db, 'preset');
    db.exec(`ALTER TABLE tasks ADD COLUMN model_run TEXT DEFAULT NULL`);
    db.prepare('UPDATE tasks SET model_run = ? WHERE id = ?').run('fable', taskId);
    insertMetadata(db, taskId, 'model:run', 'haiku');

    up(db);

    const row = db.prepare('SELECT model_run FROM tasks WHERE id = ?').get(taskId) as { model_run: string };
    expect(row.model_run).toBe('fable');
    const meta = db.prepare(`SELECT * FROM task_metadata WHERE task_id = ? AND key = 'model:run'`).get(taskId);
    expect(meta).toBeUndefined();
  });

  it('skips blank metadata values but still deletes them', () => {
    const taskId = insertTask(db, 'blank');
    insertMetadata(db, taskId, 'effort:run', '   ');

    up(db);

    const row = db.prepare('SELECT effort_run FROM tasks WHERE id = ?').get(taskId) as { effort_run: string | null };
    expect(row.effort_run).toBeNull();
    const meta = db.prepare(`SELECT * FROM task_metadata WHERE task_id = ? AND key = 'effort:run'`).get(taskId);
    expect(meta).toBeUndefined();
  });

  it('does nothing when no override metadata exists', () => {
    insertTask(db, 'plain');
    expect(() => up(db)).not.toThrow();
    const row = db.prepare('SELECT model_run FROM tasks').get() as { model_run: string | null };
    expect(row.model_run).toBeNull();
  });
});
