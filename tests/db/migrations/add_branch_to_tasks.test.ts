import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../../src/db/migrations/20260516000000_add_branch_to_tasks';

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

describe('add_branch_to_tasks migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbWithTasksTable();
  });

  it('adds branch column when it does not exist', () => {
    up(db);
    const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain('branch');
  });

  it('does nothing when branch column already exists (idempotent)', () => {
    db.exec(`ALTER TABLE tasks ADD COLUMN branch TEXT DEFAULT NULL`);
    expect(() => up(db)).not.toThrow();
    const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain('branch');
  });

  it('sets default value of null for existing rows', () => {
    db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('t', 'backlog', '', '')`);
    up(db);
    const row = db.prepare('SELECT branch FROM tasks').get() as { branch: string | null };
    expect(row.branch).toBeNull();
  });
});
