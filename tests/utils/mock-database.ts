import Database from 'better-sqlite3';
import { StorageProvider } from '../../src/db/types/storage';
import { runMigrations } from '../../src/db/schema';
import { getStorageProvider } from '../../src/db/storage-factory';

/**
 * Create an in-memory SQLite database for testing
 * @returns StorageProvider instance with initialized schema
 */
export function createMockDatabase(): StorageProvider {
  // Create in-memory database
  const db = new Database(':memory:');

  // Execute schema to initialize tables
  runMigrations(db);

  // Wrap with storage provider
  return getStorageProvider(db);
}
