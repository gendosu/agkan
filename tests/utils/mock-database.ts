import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema';

/**
 * Create an in-memory SQLite database for testing
 * @returns Database.Database instance with initialized schema
 */
export function createMockDatabase(): Database.Database {
  // Create in-memory database
  const db = new Database(':memory:');

  // Execute schema to initialize tables
  runMigrations(db);

  return db;
}
