import type { MigratableDatabase } from './types';

export function up(db: MigratableDatabase): void {
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists — idempotent
  }
}
