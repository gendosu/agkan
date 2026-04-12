import type { MigratableDatabase } from './types';

function isStatusAllowed(db: MigratableDatabase, status: string): boolean {
  try {
    db.exec(`SAVEPOINT check_status_archive`);
    db.prepare(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('__check__', ?, '', '')`).run(status);
    db.exec(`ROLLBACK TO SAVEPOINT check_status_archive`);
    db.exec(`RELEASE SAVEPOINT check_status_archive`);
    return true;
  } catch {
    db.exec(`ROLLBACK TO SAVEPOINT check_status_archive`);
    db.exec(`RELEASE SAVEPOINT check_status_archive`);
    return false;
  }
}

export function up(db: MigratableDatabase): void {
  if (isStatusAllowed(db, 'archive')) {
    return;
  }

  db.exec(`
    CREATE TABLE tasks_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      author TEXT,
      status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed', 'archive')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL REFERENCES tasks_new(id) ON DELETE SET NULL,
      assignees TEXT DEFAULT NULL,
      priority TEXT DEFAULT NULL CHECK(priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low'))
    );
  `);

  db.exec(`
    INSERT INTO tasks_new (id, title, body, author, status, created_at, updated_at, parent_id, assignees, priority)
    SELECT id, title, body, author, status, created_at, updated_at, parent_id, assignees, priority
    FROM tasks
  `);

  db.exec(`DROP TABLE tasks`);
  db.exec(`ALTER TABLE tasks_new RENAME TO tasks`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_author ON tasks(author)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`);
}
