import type { MigratableDatabase } from './migrations/types';
import { migrations } from './migrations/index';

/**
 * Create database schema and run migrations
 *
 * Note: This function receives a database instance that satisfies MigratableDatabase.
 * It is called before the StorageProvider is created.
 */
export function runMigrations(db: MigratableDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedRows = db.prepare(`SELECT version FROM schema_migrations`).all() as Array<{ version: string }>;
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const pending = migrations
    .filter((m) => !appliedSet.has(m.version))
    .sort((a, b) => a.version.localeCompare(b.version));

  for (const migration of pending) {
    try {
      db.transaction(() => {
        migration.up(db);
        db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`).run(
          migration.version,
          new Date().toISOString()
        );
      })();
    } catch (err) {
      throw new Error(`Migration ${migration.version} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
