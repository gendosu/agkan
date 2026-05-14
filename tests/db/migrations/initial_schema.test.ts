import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../../src/db/migrations/20260328000000_initial_schema';

function createInMemoryDb(): Database.Database {
  return new Database(':memory:');
}

describe('initial_schema migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  describe('addColumnIfNotExists', () => {
    it('adds a new column when it does not exist', () => {
      up(db);
      const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
      expect(columns).toContain('parent_id');
      expect(columns).toContain('assignees');
      expect(columns).toContain('priority');
    });

    it('does not fail when column already exists (savepoint rollback path)', () => {
      up(db);
      // Run again — all columns already exist, addColumnIfNotExists must silently succeed
      expect(() => up(db)).not.toThrow();
    });
  });

  describe('isStatusAllowed', () => {
    it('returns true for status already in CHECK constraint', () => {
      up(db);
      // After migration tasks table accepts 'review' — running again should not rebuild
      const countBefore = (
        db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='tasks_new'").get() as {
          n: number;
        }
      ).n;
      expect(countBefore).toBe(0);
      expect(() => up(db)).not.toThrow();
    });

    it('returns false and triggers table rebuild when review status not allowed', () => {
      // Create a legacy tasks table without 'review' in CHECK constraint
      db.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT,
          author TEXT,
          status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog', 'ready', 'in_progress', 'done', 'closed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          parent_id INTEGER DEFAULT NULL
        );
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);

      // up() should rebuild the table to add 'review' to CHECK constraint
      up(db);

      // Verify 'review' is now an accepted status
      expect(() => {
        db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('t', 'review', '', '')`);
      }).not.toThrow();
    });

    it('returns false and triggers table rebuild when icebox status not allowed', () => {
      // Create a legacy tasks table without 'icebox' in CHECK constraint
      db.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT,
          author TEXT,
          status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox_missing', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          parent_id INTEGER DEFAULT NULL
        );
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);

      up(db);

      // Verify 'icebox' is now an accepted status
      expect(() => {
        db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('t', 'icebox', '', '')`);
      }).not.toThrow();
    });
  });

  describe('priority migration', () => {
    it('migrates priority from task_metadata to tasks.priority', () => {
      // Set up base schema with tasks and task_metadata tables
      db.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT,
          author TEXT,
          status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          parent_id INTEGER DEFAULT NULL
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
      db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('task1', 'backlog', '', '')`);
      const taskId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
      db.exec(
        `INSERT INTO task_metadata (task_id, key, value, created_at, updated_at) VALUES (${taskId}, 'priority', 'high', '', '')`
      );

      up(db);

      const task = db.prepare('SELECT priority FROM tasks WHERE id = ?').get(taskId) as { priority: string };
      expect(task.priority).toBe('high');

      // metadata row should be removed
      const meta = db.prepare("SELECT * FROM task_metadata WHERE task_id = ? AND key = 'priority'").get(taskId);
      expect(meta).toBeUndefined();
    });

    it('skips invalid priority values and still deletes metadata', () => {
      db.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT,
          author TEXT,
          status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          parent_id INTEGER DEFAULT NULL
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
      db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('task1', 'backlog', '', '')`);
      const taskId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
      db.exec(
        `INSERT INTO task_metadata (task_id, key, value, created_at, updated_at) VALUES (${taskId}, 'priority', 'invalid_value', '', '')`
      );

      up(db);

      const task = db.prepare('SELECT priority FROM tasks WHERE id = ?').get(taskId) as { priority: string | null };
      expect(task.priority).toBeNull();

      // metadata row should still be removed even for invalid values
      const meta = db.prepare("SELECT * FROM task_metadata WHERE task_id = ? AND key = 'priority'").get(taskId);
      expect(meta).toBeUndefined();
    });

    it('does nothing when no priority metadata exists', () => {
      up(db);
      const tasks = db.prepare('SELECT * FROM tasks').all();
      expect(tasks).toHaveLength(0);
    });
  });
});
