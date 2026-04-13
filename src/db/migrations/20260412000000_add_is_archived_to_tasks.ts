import type { MigratableDatabase } from './types';

export function up(db: MigratableDatabase): void {
  const columns = (db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!columns.includes('is_archived')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`);
  }
}
