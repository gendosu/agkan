import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseConnection } from '../../src/db/connection';
import * as opener from '../../src/db/open-sqlite-database';
import { runMigrations } from '../../src/db/schema';
import * as schema from '../../src/db/schema';
import { TaskService } from '../../src/services/TaskService';
import { ExportImportService } from '../../src/services/ExportImportService';
import { SQLiteStorageBackend } from '../../src/db/adapters/sqlite-storage-backend';
import { withWriteLock } from './sqlite-contention';

describe('DatabaseConnection journal mode', () => {
  let directory: string;
  let filename: string;

  beforeEach(() => {
    DatabaseConnection.close();
    directory = mkdtempSync(join(tmpdir(), 'agkan-wal-'));
    filename = join(directory, 'data.db');
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    vi.stubEnv('AGENT_KANBAN_DB_PATH', filename);
  });

  afterEach(() => {
    DatabaseConnection.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  it('defaults file databases to WAL with FULL durability and preserves connection settings on reopen', () => {
    for (let i = 0; i < 2; i++) {
      const db = DatabaseConnection.getRawDatabase();
      expect(db.pragma('journal_mode')).toEqual([{ journal_mode: 'wal' }]);
      expect(db.pragma('synchronous')).toEqual([{ synchronous: 2 }]);
      expect(db.pragma('foreign_keys')).toEqual([{ foreign_keys: 1 }]);
      expect(db.pragma('busy_timeout')).toEqual([{ timeout: 5000 }]);
      DatabaseConnection.close();
    }
  });

  it('preserves every table and migration record when migrating an existing DELETE database', () => {
    const old = opener.openSQLiteDatabase(filename);
    runMigrations(old);
    old.exec(`INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES
      (41, 'parent', 'ready', 'before', 'before'), (42, 'child', 'ready', 'before', 'before');
      UPDATE tasks SET parent_id = 41 WHERE id = 42;
      INSERT INTO tags (id, name, created_at) VALUES (5, 'wal-test', 'before');
      INSERT INTO task_tags (task_id, tag_id, created_at) VALUES (42, 5, 'before');`);
    const backend = new SQLiteStorageBackend(old);
    backend.blocks.create({ blocker_task_id: 41, blocked_task_id: 42, created_at: 'before' });
    backend.metadata.set({ task_id: 42, key: 'preserved', value: 'yes', created_at: 'before', updated_at: 'before' });
    backend.comments.create({ task_id: 42, content: 'existing comment', created_at: 'before', updated_at: 'before' });
    backend.runLogs.updateFinished(backend.runLogs.create(42, 'before'), 'after', 0, '[]');
    const snapshot = (db: ReturnType<typeof opener.openSQLiteDatabase>) => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[];
      return tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]);
    };
    const before = snapshot(old);
    expect(old.pragma('journal_mode')).toEqual([{ journal_mode: 'delete' }]);
    old.close();
    const migrated = DatabaseConnection.getRawDatabase();
    expect(migrated.pragma('journal_mode')).toEqual([{ journal_mode: 'wal' }]);
    expect(snapshot(migrated)).toEqual(before);
    expect(migrated.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(migrated.pragma('foreign_key_check')).toEqual([]);
    DatabaseConnection.close();
    expect(DatabaseConnection.getRawDatabase().pragma('journal_mode')).toEqual([{ journal_mode: 'wal' }]);
  });

  it('honors explicit DELETE, including switching back after all connections close', () => {
    DatabaseConnection.getRawDatabase();
    DatabaseConnection.close();
    writeFileSync(join(directory, '.agkan-test.yml'), 'database:\n  journalMode: delete\n');
    expect(DatabaseConnection.getRawDatabase().pragma('journal_mode')).toEqual([{ journal_mode: 'delete' }]);
  });

  it('creates a new database in DELETE mode when explicitly configured', () => {
    writeFileSync(join(directory, '.agkan-test.yml'), 'database:\n  journalMode: delete\n');
    const db = DatabaseConnection.getRawDatabase();
    expect(db.pragma('journal_mode')).toEqual([{ journal_mode: 'delete' }]);
    expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('rejects invalid configuration before opening the database', () => {
    writeFileSync(join(directory, '.agkan-test.yml'), 'database:\n  journalMode: invalid\n');
    const open = vi.spyOn(opener, 'openSQLiteDatabase');
    expect(() => DatabaseConnection.getRawDatabase()).toThrow('database.journalMode');
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps the low-level memory database contract', () => {
    const memory = opener.openSQLiteDatabase(':memory:');
    vi.spyOn(opener, 'openSQLiteDatabase').mockReturnValue(memory);
    expect(DatabaseConnection.getRawDatabase().pragma('journal_mode')).toEqual([{ journal_mode: 'memory' }]);
  });

  it('closes a failed migration connection, preserves the cause and retries in the same process', async () => {
    const old = opener.openSQLiteDatabase(filename);
    runMigrations(old);
    old.close();
    const open = vi.spyOn(opener, 'openSQLiteDatabase');
    const start = Date.now();
    await withWriteLock(filename, 7000, () => {
      try {
        DatabaseConnection.getRawDatabase();
        expect.fail('initialization must fail while migration is blocked');
      } catch (error) {
        expect((error as Error).message).toMatch(/Stop.*Board.*CLI/);
        expect((error as Error).cause).toMatchObject({ code: 'SQLITE_BUSY' });
      }
      const failed = open.mock.results[0].value;
      expect(() => failed.prepare('SELECT 1')).toThrow();
    });
    expect(Date.now() - start).toBeLessThan(7000);
    expect(DatabaseConnection.getBackendInstance()).toBeDefined();
    expect(DatabaseConnection.getRawDatabase().pragma('journal_mode')).toEqual([{ journal_mode: 'wal' }]);
  });

  it.each(['unchanged', 'readonly'])(
    'rejects %s mode changes, closes the connection and retains the original error',
    (failure) => {
      const db = opener.openSQLiteDatabase(filename);
      const pragma = db.pragma.bind(db);
      const cause = new Error('attempt to write a readonly database');
      vi.spyOn(db, 'pragma').mockImplementation((source) => {
        if (source === 'journal_mode = wal') {
          if (failure === 'readonly') throw cause;
          return [{ journal_mode: 'delete' }];
        }
        return pragma(source);
      });
      vi.spyOn(opener, 'openSQLiteDatabase').mockReturnValueOnce(db);
      try {
        DatabaseConnection.getRawDatabase();
        expect.fail('initialization must fail');
      } catch (error) {
        expect((error as Error).message).toMatch(/journal.*wal/);
        if (failure === 'readonly') expect((error as Error).cause).toBe(cause);
      }
      expect(() => db.prepare('SELECT 1')).toThrow();
      expect(DatabaseConnection.getBackendInstance()).toBeDefined();
    }
  );

  it('does not publish partial singleton state or undo WAL when schema initialization fails', () => {
    const cause = new Error('schema failure');
    vi.spyOn(schema, 'runMigrations').mockImplementationOnce(() => {
      throw cause;
    });
    expect(() => DatabaseConnection.getInstance()).toThrow(cause);
    const check = opener.openSQLiteDatabase(filename);
    expect(check.pragma('journal_mode')).toEqual([{ journal_mode: 'wal' }]);
    check.close();
    expect(DatabaseConnection.getBackendInstance()).toBeDefined();
    expect(DatabaseConnection.getInstance()).toBeDefined();
  });

  it('exports and imports committed tasks still in the WAL', () => {
    const db = DatabaseConnection.getRawDatabase();
    db.pragma('wal_autocheckpoint = 0');
    const reader = opener.openSQLiteDatabase(filename);
    reader.exec('BEGIN');
    reader.prepare('SELECT * FROM tasks').all();
    try {
      const task = new TaskService().createTask({ title: 'uncheckpointed' });
      expect(db.pragma('wal_checkpoint(PASSIVE)')[0]).toMatchObject({ busy: 0 });
      const checkpoint = db.pragma('wal_checkpoint(PASSIVE)')[0] as { log: number; checkpointed: number };
      expect(checkpoint.log).toBeGreaterThan(checkpoint.checkpointed);
      const exported = new ExportImportService().exportData();
      expect(exported.tasks[0].id).toBe(task.id);
      DatabaseConnection.close();
      vi.stubEnv('AGENT_KANBAN_DB_PATH', join(directory, 'import.db'));
      new ExportImportService().importData(exported);
      expect(new TaskService().listTasks()[0].title).toBe('uncheckpointed');
    } finally {
      reader.exec('ROLLBACK');
      reader.close();
    }
  });
});
