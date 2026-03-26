import Database from 'better-sqlite3';
import { StorageProvider } from '../../src/db/types/storage';
import { StorageBackend } from '../../src/db/types/repository';
import { runMigrations } from '../../src/db/schema';
import { getStorageProvider } from '../../src/db/storage-factory';
import { SQLiteStorageBackend } from '../../src/db/adapters/sqlite-storage-backend';

/**
 * Create an in-memory SQLite database for testing
 * @returns StorageProvider instance with initialized schema
 * @deprecated Use createMockStorageBackend() instead
 */
export function createMockDatabase(): StorageProvider {
  // Create in-memory database
  const db = new Database(':memory:');

  // Execute schema to initialize tables
  runMigrations(db);

  // Wrap with storage provider
  return getStorageProvider(db);
}

/**
 * Create an in-memory SQLite StorageBackend for testing
 * @returns StorageBackend instance with initialized schema
 */
export function createMockStorageBackend(): StorageBackend {
  // Create in-memory database
  const db = new Database(':memory:');

  // Execute schema to initialize tables
  runMigrations(db);

  // Create and return StorageBackend
  return new SQLiteStorageBackend(db);
}
