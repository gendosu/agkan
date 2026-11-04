import type { StorageRunResult } from './storage';

export type SQLiteBinding = string | number | null;

// The SQL repositories only depend on this subset of the native drivers' APIs.
export interface SQLiteStatement {
  bind(...params: SQLiteBinding[]): SQLiteStatement;
  get(...params: SQLiteBinding[]): unknown;
  all(...params: SQLiteBinding[]): unknown[];
  run(...params: SQLiteBinding[]): StorageRunResult;
}

export interface SQLiteDatabase {
  prepare(sql: string): SQLiteStatement;
  exec(sql: string): void;
  pragma(source: string): unknown;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}
