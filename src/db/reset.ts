import fs from 'fs';
import { resolveDatabasePath, isTestMode } from './config';
import { DatabaseConnection } from './connection';

/**
 * Reset the database (delete and recreate)
 * Ensures a clean state by calling before test execution
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

  // Close existing connection
  DatabaseConnection.close();

  // Database file path
  const dbPath = resolveDatabasePath();

  // Delete database file if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  // Initialize new database connection (schema is automatically created)
  DatabaseConnection.getInstance();
}
