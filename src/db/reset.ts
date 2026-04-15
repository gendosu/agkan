import { isTestMode } from './config';
import { DatabaseConnection } from './connection';

/**
 * Reset the database by deleting all rows in every data table.
 * Reuses the existing connection to avoid file I/O overhead.
 * Ensures a clean state by calling before test execution.
 *
 * @throws Error if called outside of test mode (NODE_ENV=test)
 */
export function resetDatabase(): void {
  // Safety guard: only allow database reset in test mode
  if (!isTestMode()) {
    throw new Error(
      'resetDatabase() must only be called in test mode (NODE_ENV=test). ' +
        'Calling this outside test mode risks deleting the production database.'
    );
  }

  // Get or lazily initialize the database connection.
  // Avoids closing/reopening the connection and eliminates file I/O.
  const db = DatabaseConnection.getRawDatabase();

  // Clear all data tables without file I/O.
  // Disabling foreign keys allows deleting in any order without constraint
  // violations. Clearing sqlite_sequence resets AUTOINCREMENT counters so
  // that IDs start from 1, consistent with a freshly created database.
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM task_run_logs;
    DELETE FROM task_comments;
    DELETE FROM task_metadata;
    DELETE FROM task_tags;
    DELETE FROM task_blocks;
    DELETE FROM tasks;
    DELETE FROM tags;
    DELETE FROM sqlite_sequence;
    PRAGMA foreign_keys = ON;
  `);
}
