import Database from 'better-sqlite3';
import { up as initialSchema } from './migrations/20260328000000_initial_schema';

const INITIAL_VERSION = '20260328000000';

/**
 * Create database schema and run migrations
 *
 * Note: This function receives a raw better-sqlite3 Database instance
 * because it needs to execute migrations before the StorageProvider is created.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = db.prepare(`SELECT version FROM schema_migrations WHERE version = ?`).get(INITIAL_VERSION) as
    | { version: string }
    | undefined;

  if (!applied) {
    db.transaction(() => {
      initialSchema(db);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`).run(
        INITIAL_VERSION,
        new Date().toISOString()
      );
    })();
  }
}
