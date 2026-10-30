/**
 * SQLite Adapter
 *
 * Implements the StorageProvider interface for the SQLite drivers.
 * Wraps the SQLite API to provide a consistent interface
 * for the rest of the application.
 */

import type { SQLiteDatabase, SQLiteStatement as DriverStatement } from '../types/sqlite';
import type Database from 'better-sqlite3';
import { StorageProvider, StorageStatement, StorageRunResult } from '../types/storage';

/**
 * SQLite Statement Adapter
 * Wraps a driver statement to implement StorageStatement interface
 */
class SQLiteStatement implements StorageStatement {
  private stmt: DriverStatement;

  constructor(stmt: DriverStatement) {
    this.stmt = stmt;
  }

  bind(...params: (string | number | null)[]): StorageStatement {
    this.stmt.bind(...params);
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
 * Implements StorageProvider interface for SQLite databases
 */
export class SQLiteAdapter implements StorageProvider {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase | Database.Database) {
    // The native driver's generic prepare() overload needs narrowing to the shared API.
    this.db = db as SQLiteDatabase;
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
