import type { MigratableDatabase } from './types';

export function up(db: MigratableDatabase): void {
  const columns = (db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!columns.includes('branch')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN branch TEXT DEFAULT NULL`);
  }
}
