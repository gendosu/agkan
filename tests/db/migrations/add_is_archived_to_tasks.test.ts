import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../../src/db/migrations/20260412000000_add_is_archived_to_tasks';

function createDbWithTasksTable(): Database.Database {
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
  return db;
}

describe('add_is_archived_to_tasks migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbWithTasksTable();
  });

  it('adds is_archived column when it does not exist', () => {
    up(db);
    const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain('is_archived');
  });

  it('does nothing when is_archived column already exists (idempotent)', () => {
    db.exec(`ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`);
    expect(() => up(db)).not.toThrow();
    const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain('is_archived');
  });

  it('sets default value of 0 for existing rows', () => {
    db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('t', 'backlog', '', '')`);
    up(db);
    const row = db.prepare('SELECT is_archived FROM tasks').get() as { is_archived: number };
    expect(row.is_archived).toBe(0);
  });
});
