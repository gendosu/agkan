import type { MigratableDatabase } from './types';

function addColumnIfNotExists(db: MigratableDatabase, alterSql: string): void {
  try {
    db.exec(`SAVEPOINT add_column`);
    db.exec(alterSql);
    db.exec(`RELEASE SAVEPOINT add_column`);
  } catch {
    db.exec(`ROLLBACK TO SAVEPOINT add_column`);
    db.exec(`RELEASE SAVEPOINT add_column`);
  }
}

function isStatusAllowed(db: MigratableDatabase, status: string): boolean {
  try {
    db.exec(`SAVEPOINT check_status`);
    db.prepare(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('__check__', ?, '', '')`).run(status);
    db.exec(`ROLLBACK TO SAVEPOINT check_status`);
    db.exec(`RELEASE SAVEPOINT check_status`);
    return true;
  } catch {
    db.exec(`ROLLBACK TO SAVEPOINT check_status`);
    db.exec(`RELEASE SAVEPOINT check_status`);
    return false;
  }
}

export function up(db: MigratableDatabase): void {
  // Create tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      author TEXT,
      status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Create index on tasks table
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_author ON tasks(author);
  `);

  // Migrate tasks table to add 'review' status to CHECK constraint
  if (!isStatusAllowed(db, 'review')) {
    db.exec(`
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT,
        author TEXT,
        status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        parent_id INTEGER DEFAULT NULL REFERENCES tasks_new(id) ON DELETE SET NULL
      );
    `);
    db.exec(
      `INSERT INTO tasks_new SELECT id, title, body, author, status, created_at, updated_at, parent_id FROM tasks`
    );
    db.exec(`DROP TABLE tasks`);
    db.exec(`ALTER TABLE tasks_new RENAME TO tasks`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_author ON tasks(author)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`);
  }

  // Migrate tasks table to add 'icebox' status to CHECK constraint
  if (!isStatusAllowed(db, 'icebox')) {
    db.exec(`
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT,
        author TEXT,
        status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        parent_id INTEGER DEFAULT NULL REFERENCES tasks_new(id) ON DELETE SET NULL
      );
    `);
    db.exec(
      `INSERT INTO tasks_new SELECT id, title, body, author, status, created_at, updated_at, parent_id FROM tasks`
    );
    db.exec(`DROP TABLE tasks`);
    db.exec(`ALTER TABLE tasks_new RENAME TO tasks`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_author ON tasks(author)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`);
  }

  // Add parent_id column to tasks table (migration)
  addColumnIfNotExists(
    db,
    `ALTER TABLE tasks ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES tasks(id) ON DELETE SET NULL`
  );
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)
  `);

  // Add assignees column to tasks table (migration)
  addColumnIfNotExists(db, `ALTER TABLE tasks ADD COLUMN assignees TEXT DEFAULT NULL`);

  // Create task_blocks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_task_id INTEGER NOT NULL,
      blocked_task_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (blocker_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(blocker_task_id, blocked_task_id),
      CHECK(blocker_task_id != blocked_task_id)
    );
  `);

  // Create index on task_blocks table
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_blocks_blocker ON task_blocks(blocker_task_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_blocks_blocked ON task_blocks(blocked_task_id);
  `);

  // Create tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);

  // Create index on tags table
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
  `);

  // Create task_tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(task_id, tag_id)
    );
  `);

  // Create index on task_tags table
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);
  `);

  // Create task_metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(task_id, key)
    );
  `);

  // Create index on task_metadata table
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_metadata_task_id ON task_metadata(task_id);
  `);

  // Create task_comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      author TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  // Create index on task_comments table
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at);
  `);

  // Add priority column to tasks table (migration)
  addColumnIfNotExists(
    db,
    `ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT NULL CHECK(priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low'))`
  );

  // Create task_run_logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      exit_code INTEGER,
      events TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_run_logs_task_id ON task_run_logs(task_id);
  `);

  // Migrate priority from task_metadata to tasks.priority
  const priorityMetadata = db
    .prepare(`SELECT task_id, value FROM task_metadata WHERE key = 'priority'`)
    .all() as Array<{ task_id: number; value: string }>;

  if (priorityMetadata.length > 0) {
    const updateStmt = db.prepare(`UPDATE tasks SET priority = ? WHERE id = ? AND priority IS NULL`);
    const deleteStmt = db.prepare(`DELETE FROM task_metadata WHERE task_id = ? AND key = 'priority'`);

    for (const row of priorityMetadata) {
      const validPriorities = ['critical', 'high', 'medium', 'low'];
      if (validPriorities.includes(row.value)) {
        updateStmt.run(row.value, row.task_id);
      }
      deleteStmt.run(row.task_id);
    }
  }
}
