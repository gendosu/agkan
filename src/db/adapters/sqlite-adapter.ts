/**
 * SQLite Adapter
 *
 * Implements the StorageProvider interface for better-sqlite3.
 * Wraps the native better-sqlite3 API to provide a consistent interface
 * for the rest of the application.
 */

import Database from 'better-sqlite3';
import { StorageProvider, StorageStatement, StorageRunResult } from '../types/storage';

/**
 * SQLite Statement Adapter
 * Wraps better-sqlite3 Statement to implement StorageStatement interface
 */
class SQLiteStatement implements StorageStatement {
  private stmt: Database.Statement;

  constructor(stmt: Database.Statement) {
    this.stmt = stmt;
  }

  bind(...params: (string | number | null)[]): StorageStatement {
    // Cast to any to access bind method not in the type definition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.stmt as any).bind(...params);
    return this;
  }

  get(...params: (string | number | null)[]): Record<string, unknown> | undefined {
    if (params.length > 0) {
      return this.stmt.get(...params) as Record<string, unknown> | undefined;
    }
    return this.stmt.get() as Record<string, unknown> | undefined;
  }

  all(...params: (string | number | null)[]): Record<string, unknown>[] {
    if (params.length > 0) {
      return this.stmt.all(...params) as Record<string, unknown>[];
    }
    return this.stmt.all() as Record<string, unknown>[];
  }

  run(...params: (string | number | null)[]): StorageRunResult {
    const info = this.stmt.run(...params);
    return {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid,
    };
  }
}

/**
 * SQLite Adapter
 * Implements StorageProvider interface for better-sqlite3 database
 */
export class SQLiteAdapter implements StorageProvider {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  prepare(sql: string): StorageStatement {
    const stmt = this.db.prepare(sql);
    return new SQLiteStatement(stmt);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(pragma: string): Record<string, unknown> | Record<string, unknown>[] | void {
    return this.db.pragma(pragma) as Record<string, unknown> | Record<string, unknown>[];
  }

  transaction(fn: () => void): () => void {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}
