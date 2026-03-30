import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema';

function createInMemoryDb(): Database.Database {
  return new Database(':memory:');
}

describe('runMigrations', () => {
  it('applies initial schema on a new database', () => {
    const db = createInMemoryDb();
    runMigrations(db);

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{
      name: string;
    }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('schema_migrations');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('task_tags');
    expect(tableNames).toContain('task_blocks');
    expect(tableNames).toContain('task_metadata');
    expect(tableNames).toContain('task_comments');
    expect(tableNames).toContain('task_run_logs');
  });

  it('records the initial version in schema_migrations', () => {
    const db = createInMemoryDb();
    runMigrations(db);

    const row = db
      .prepare(`SELECT version, applied_at FROM schema_migrations WHERE version = '20260328000000'`)
      .get() as { version: string; applied_at: string } | undefined;

    expect(row).toBeDefined();
    expect(row?.version).toBe('20260328000000');
    expect(row?.applied_at).toBeTruthy();
  });

  it('does not re-apply migration on a second call (idempotent)', () => {
    const db = createInMemoryDb();
    runMigrations(db);
    runMigrations(db);

    const count = (db.prepare(`SELECT COUNT(*) as count FROM schema_migrations`).get() as { count: number }).count;

    expect(count).toBe(1);
  });

  it('is safe to run on a legacy database without schema_migrations', () => {
    const db = createInMemoryDb();

    // Simulate legacy DB: tasks table already has all columns from prior migrations,
    // but schema_migrations table does not yet exist
    db.exec(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT,
        author TEXT,
        status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        parent_id INTEGER DEFAULT NULL REFERENCES tasks(id) ON DELETE SET NULL,
        assignees TEXT DEFAULT NULL,
        priority TEXT DEFAULT NULL CHECK(priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low'))
      )
    `);

    expect(() => runMigrations(db)).not.toThrow();

    const row = db.prepare(`SELECT version FROM schema_migrations WHERE version = '20260328000000'`).get() as
      | { version: string }
      | undefined;
    expect(row?.version).toBe('20260328000000');
  });
});
