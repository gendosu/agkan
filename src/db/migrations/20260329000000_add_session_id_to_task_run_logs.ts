import type { MigratableDatabase } from './types';

export function up(db: MigratableDatabase): void {
  db.exec(`ALTER TABLE task_run_logs ADD COLUMN session_id TEXT DEFAULT NULL`);
}
