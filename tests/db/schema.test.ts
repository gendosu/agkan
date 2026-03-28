import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Migration } from '../../src/db/migrations/types';

var mockMigrationsList: Migration[] = [];

vi.mock('../../src/db/migrations/index', () => ({
  get migrations() {
    return mockMigrationsList;
  },
}));

import { runMigrations } from '../../src/db/schema';

function createInMemoryDb(): Database.Database {
  return new Database(':memory:');
}

describe('runMigrations', () => {
  let realMigrations: Migration[] = [];

  beforeAll(async () => {
    const actual = await vi.importActual<{ migrations: Migration[] }>('../../src/db/migrations/index');
    realMigrations = actual.migrations;
    mockMigrationsList.push(...realMigrations);
  });

  beforeEach(() => {
    mockMigrationsList.length = 0;
    mockMigrationsList.push(...realMigrations);
  });

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

  it('runs multiple pending migrations in version order', () => {
    const db = createInMemoryDb();
    const order: string[] = [];

    mockMigrationsList.length = 0;
    mockMigrationsList.push(
      {
        version: '20260328000002',
        description: 'second',
        up: () => {
          order.push('second');
        },
      },
      {
        version: '20260328000001',
        description: 'first',
        up: () => {
          order.push('first');
        },
      }
    );

    runMigrations(db);

    expect(order).toEqual(['first', 'second']);
    const count = (db.prepare(`SELECT COUNT(*) as count FROM schema_migrations`).get() as { count: number }).count;
    expect(count).toBe(2);
  });

  it('throws a descriptive error when a migration fails', () => {
    const db = createInMemoryDb();

    mockMigrationsList.length = 0;
    mockMigrationsList.push({
      version: '20260328000001',
      description: 'failing',
      up: () => {
        throw new Error('syntax error');
      },
    });

    expect(() => runMigrations(db)).toThrow('Migration 20260328000001 failed: syntax error');
  });

  it('throws a descriptive error when a migration throws a non-Error value', () => {
    const db = createInMemoryDb();

    mockMigrationsList.length = 0;
    mockMigrationsList.push({
      version: '20260328000001',
      description: 'failing-non-error',
      up: () => {
        throw 'plain string error';
      },
    });

    expect(() => runMigrations(db)).toThrow('Migration 20260328000001 failed: plain string error');
  });

  it('does not record a failed migration in schema_migrations (rollback)', () => {
    const db = createInMemoryDb();

    mockMigrationsList.length = 0;
    mockMigrationsList.push({
      version: '20260328000001',
      description: 'failing',
      up: () => {
        throw new Error('failure');
      },
    });

    expect(() => runMigrations(db)).toThrow();

    const row = db.prepare(`SELECT version FROM schema_migrations WHERE version = '20260328000001'`).get();
    expect(row).toBeUndefined();
  });
});
