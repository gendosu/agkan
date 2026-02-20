import Database from 'better-sqlite3';

/**
 * Create database schema and run migrations
 *
 * Note: This function receives a raw better-sqlite3 Database instance
 * because it needs to execute migrations before the StorageProvider is created.
 */
export function runMigrations(db: Database.Database): void {
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
  const taskTableDef = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'`).get() as
    | { sql: string }
    | undefined;

  if (taskTableDef && !taskTableDef.sql.includes("'review'")) {
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
  const taskTableDefForIcebox = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'`)
    .get() as { sql: string } | undefined;

  if (taskTableDefForIcebox && !taskTableDefForIcebox.sql.includes("'icebox'")) {
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
  const columnExists = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM pragma_table_info('tasks')
    WHERE name = 'parent_id'
  `
    )
    .get() as { count: number };

  if (columnExists.count === 0) {
    db.exec(`
      ALTER TABLE tasks ADD COLUMN parent_id INTEGER DEFAULT NULL
        REFERENCES tasks(id) ON DELETE SET NULL
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)
    `);
  }

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
}
