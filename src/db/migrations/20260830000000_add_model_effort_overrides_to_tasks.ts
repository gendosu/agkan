import type { MigratableDatabase } from './types';

/**
 * task_metadata key -> tasks column for task-level Claude model/effort overrides.
 * The key strings are duplicated here on purpose: migrations must not import from
 * src/board/*, so that the historical shape of the data stays pinned in this file.
 */
const METADATA_KEY_TO_COLUMN: Record<string, string> = {
  'model:planning': 'model_planning',
  'model:run': 'model_run',
  'effort:planning': 'effort_planning',
  'effort:run': 'effort_run',
};

export function up(db: MigratableDatabase): void {
  const columns = (db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>).map((c) => c.name);
  for (const column of Object.values(METADATA_KEY_TO_COLUMN)) {
    if (!columns.includes(column)) {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${column} TEXT DEFAULT NULL`);
    }
  }

  const keys = Object.keys(METADATA_KEY_TO_COLUMN);
  const placeholders = keys.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT task_id, key, value FROM task_metadata WHERE key IN (${placeholders})`)
    .all(...keys) as Array<{ task_id: number; key: string; value: string }>;

  if (rows.length === 0) return;

  const updateStmts = new Map(
    Object.values(METADATA_KEY_TO_COLUMN).map((column) => [
      column,
      db.prepare(`UPDATE tasks SET ${column} = ? WHERE id = ? AND ${column} IS NULL`),
    ])
  );
  const deleteStmt = db.prepare(`DELETE FROM task_metadata WHERE task_id = ? AND key = ?`);

  for (const row of rows) {
    const column = METADATA_KEY_TO_COLUMN[row.key];
    const value = row.value.trim();
    if (value) {
      updateStmts.get(column)!.run(value, row.task_id);
    }
    deleteStmt.run(row.task_id, row.key);
  }
}
