/**
 * Storage Factory
 *
 * Provides a factory function to create storage provider instances.
 * Currently supports SQLite, with infrastructure in place for future
 * backends (e.g., Notion, PostgreSQL, etc.).
 */

import Database from 'better-sqlite3';
import { StorageProvider } from './types/storage';
import { SQLiteAdapter } from './adapters/sqlite-adapter';

/**
 * Get a storage provider instance
 *
 * Currently always returns a SQLiteAdapter wrapping the provided
 * better-sqlite3 database instance. In future, this could be extended
 * to support multiple backend types.
 *
 * @param db - better-sqlite3 database instance
 * @returns StorageProvider instance
 */
export function getStorageProvider(db: Database.Database): StorageProvider {
  return new SQLiteAdapter(db);
}
