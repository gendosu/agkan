/**
 * SQLite Storage Backend
 *
 * Implements the StorageBackend interface using better-sqlite3.
 * All SQL logic is encapsulated here, keeping services SQL-independent.
 */

import Database from 'better-sqlite3';
import type {
  TaskRepository,
  TagRepository,
  TaskBlockRepository,
  TaskTagRepository,
  MetadataRepository,
  CommentRepository,
  RunLogRepository,
  RunLogRow,
  StorageBackend,
  TaskFilter,
  TaskSortOptions,
} from '../types/repository';
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  Tag,
  CreateTagInput,
  UpdateTagInput,
  TaskBlock,
  CreateTaskBlockInput,
  TaskTag,
  CreateTaskTagInput,
  TaskMetadata,
  CreateTaskMetadataInput,
  TaskComment,
  CreateTaskCommentInput,
} from '../../models';

/** SQL CASE expression for priority ordering */
const PRIORITY_ORDER_EXPR = `CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`;

class SQLiteTaskRepository implements TaskRepository {
  constructor(private db: Database.Database) {}

  findById(id: number): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    return row ?? null;
  }

  findAll(filter?: TaskFilter, sort?: TaskSortOptions): Task[] {
    const { query, params } = this.buildFindAllQuery(filter, sort);
    return this.db.prepare(query).all(...params) as unknown as Task[];
  }

  private buildFindAllQuery(
    filter?: TaskFilter,
    sort?: TaskSortOptions
  ): { query: string; params: (string | number)[] } {
    const params: (string | number)[] = [];
    const hasTagFilter = !!(filter?.tagIds && filter.tagIds.length > 0);
    const tablePrefix = hasTagFilter ? 'tasks.' : '';
    let query = this.buildBaseQuery(filter, params);
    query += this.buildFilterClauses(filter, tablePrefix, params);
    query += this.buildOrderClause(sort, tablePrefix);
    return { query, params };
  }

  private buildBaseQuery(filter: TaskFilter | undefined, params: (string | number)[]): string {
    if (filter?.tagIds && filter.tagIds.length > 0) {
      const placeholders = filter.tagIds.map(() => '?').join(', ');
      params.push(...filter.tagIds);
      return `SELECT DISTINCT tasks.* FROM tasks INNER JOIN task_tags ON tasks.id = task_tags.task_id WHERE task_tags.tag_id IN (${placeholders})`;
    }
    return 'SELECT * FROM tasks WHERE 1=1';
  }

  private buildFilterClauses(filter: TaskFilter | undefined, tablePrefix: string, params: (string | number)[]): string {
    let clause = '';
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (statuses.length > 0) {
        clause += ` AND ${tablePrefix}status IN (${statuses.map(() => '?').join(', ')})`;
        params.push(...statuses);
      }
    }
    if (filter?.author) {
      clause += ` AND ${tablePrefix}author = ?`;
      params.push(filter.author);
    }
    if (filter?.assignees) {
      clause += ` AND ${tablePrefix}assignees LIKE ?`;
      params.push(`%${filter.assignees}%`);
    }
    if (filter?.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      if (priorities.length > 0) {
        clause += ` AND ${tablePrefix}priority IN (${priorities.map(() => '?').join(', ')})`;
        params.push(...priorities);
      }
    }
    if (filter?.search) {
      clause += ` AND (${tablePrefix}title LIKE ? OR ${tablePrefix}body LIKE ?)`;
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern);
    }
    return clause;
  }

  private buildOrderClause(sort: TaskSortOptions | undefined, tablePrefix: string): string {
    const sortField = sort?.field ?? 'created_at';
    const sortOrder = sort?.order === 'asc' ? 'ASC' : 'DESC';
    if (sortField === 'priority') {
      return ` ORDER BY ${PRIORITY_ORDER_EXPR} ${sortOrder}, ${tablePrefix}id ${sortOrder}`;
    }
    return ` ORDER BY ${tablePrefix}${sortField} ${sortOrder}, ${tablePrefix}id ${sortOrder}`;
  }

  create(input: CreateTaskInput & { status: TaskStatus; created_at: string; updated_at: string }): Task {
    const result = this.db
      .prepare(
        `INSERT INTO tasks (title, body, author, assignees, status, priority, parent_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title,
        input.body ?? null,
        input.author ?? null,
        input.assignees ?? null,
        input.status,
        input.priority !== undefined ? input.priority : null,
        input.parent_id !== undefined ? input.parent_id : null,
        input.created_at,
        input.updated_at
      );

    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, input: Partial<UpdateTaskInput & { updated_at: string }>): Task | null {
    const { updates, params } = this.buildUpdateClauses(input);
    if (updates.length === 0) {
      return this.findById(id);
    }
    params.push(id);
    this.db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  private buildUpdateClauses(input: Partial<UpdateTaskInput & { updated_at: string }>): {
    updates: string[];
    params: (string | number | null)[];
  } {
    const fields: Array<[string, keyof typeof input, (v: unknown) => string | number | null]> = [
      ['title', 'title', (v) => v as string],
      ['body', 'body', (v) => v as string | null],
      ['author', 'author', (v) => v as string | null],
      ['assignees', 'assignees', (v) => (v as string) || null],
      ['status', 'status', (v) => v as string],
      ['priority', 'priority', (v) => v as string | null],
      ['parent_id', 'parent_id', (v) => v as number | null],
      ['updated_at', 'updated_at', (v) => v as string],
    ];
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    for (const [col, key, transform] of fields) {
      if (input[key] !== undefined) {
        updates.push(`${col} = ?`);
        params.push(transform(input[key]));
      }
    }
    return { updates, params };
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  findChildren(parentId: number): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC')
      .all(parentId) as unknown as Task[];
  }

  countByStatus(): Record<TaskStatus, number> {
    const results = this.db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all() as Array<{
      status: TaskStatus;
      count: number;
    }>;

    const countMap: Record<TaskStatus, number> = {
      icebox: 0,
      backlog: 0,
      ready: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      closed: 0,
      archive: 0,
    };

    for (const row of results) {
      countMap[row.status] = row.count;
    }

    return countMap;
  }

  findForPurge(beforeDate: string, statuses: TaskStatus[]): Task[] {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => '?').join(', ');
    const query = `SELECT * FROM tasks WHERE status IN (${placeholders}) AND updated_at < ? ORDER BY updated_at ASC`;
    return this.db.prepare(query).all(...statuses, beforeDate) as unknown as Task[];
  }

  deleteMany(ids: number[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  }
}

class SQLiteTagRepository implements TagRepository {
  constructor(private db: Database.Database) {}

  findById(id: number): Tag | null {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
    return row ?? null;
  }

  findByName(name: string): Tag | null {
    const row = this.db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as Tag | undefined;
    return row ?? null;
  }

  findAll(): Tag[] {
    return this.db.prepare('SELECT * FROM tags ORDER BY created_at DESC, id DESC').all() as unknown as Tag[];
  }

  create(input: CreateTagInput & { created_at: string }): Tag {
    const result = this.db
      .prepare('INSERT INTO tags (name, created_at) VALUES (?, ?)')
      .run(input.name, input.created_at);
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, input: UpdateTagInput): Tag | null {
    this.db.prepare('UPDATE tags SET name = COALESCE(?, name) WHERE id = ?').run(input.name ?? null, id);
    return this.findById(id);
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

class SQLiteTaskBlockRepository implements TaskBlockRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateTaskBlockInput & { created_at: string }): TaskBlock {
    const result = this.db
      .prepare('INSERT INTO task_blocks (blocker_task_id, blocked_task_id, created_at) VALUES (?, ?, ?)')
      .run(input.blocker_task_id, input.blocked_task_id, input.created_at);
    return this.db
      .prepare('SELECT * FROM task_blocks WHERE id = ?')
      .get(result.lastInsertRowid as number) as unknown as TaskBlock;
  }

  delete(blockerId: number, blockedId: number): boolean {
    const result = this.db
      .prepare('DELETE FROM task_blocks WHERE blocker_task_id = ? AND blocked_task_id = ?')
      .run(blockerId, blockedId);
    return result.changes > 0;
  }

  findBlockedTaskIds(blockerId: number): number[] {
    const rows = this.db
      .prepare('SELECT blocked_task_id FROM task_blocks WHERE blocker_task_id = ?')
      .all(blockerId) as Array<{ blocked_task_id: number }>;
    return rows.map((r) => r.blocked_task_id);
  }

  findBlockerTaskIds(blockedId: number): number[] {
    const rows = this.db
      .prepare('SELECT blocker_task_id FROM task_blocks WHERE blocked_task_id = ?')
      .all(blockedId) as Array<{ blocker_task_id: number }>;
    return rows.map((r) => r.blocker_task_id);
  }

  findAll(): Array<{ blocker_task_id: number; blocked_task_id: number }> {
    return this.db.prepare('SELECT blocker_task_id, blocked_task_id FROM task_blocks').all() as Array<{
      blocker_task_id: number;
      blocked_task_id: number;
    }>;
  }
}

class SQLiteTaskTagRepository implements TaskTagRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateTaskTagInput & { created_at: string }): TaskTag {
    const result = this.db
      .prepare('INSERT INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, ?)')
      .run(input.task_id, input.tag_id, input.created_at);
    return this.db
      .prepare('SELECT * FROM task_tags WHERE id = ?')
      .get(result.lastInsertRowid as number) as unknown as TaskTag;
  }

  delete(taskId: number, tagId: number): boolean {
    const result = this.db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(taskId, tagId);
    return result.changes > 0;
  }

  exists(taskId: number, tagId: number): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM task_tags WHERE task_id = ? AND tag_id = ?')
      .get(taskId, tagId) as { count: number };
    return row.count > 0;
  }

  findTagIdsByTaskId(taskId: number): number[] {
    const rows = this.db
      .prepare('SELECT tag_id FROM task_tags WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as Array<{ tag_id: number }>;
    return rows.map((r) => r.tag_id);
  }

  findTagsByTaskId(taskId: number): Tag[] {
    return this.db
      .prepare(
        `SELECT t.* FROM tags t
         INNER JOIN task_tags tt ON t.id = tt.tag_id
         WHERE tt.task_id = ?
         ORDER BY tt.created_at ASC`
      )
      .all(taskId) as unknown as Tag[];
  }

  findTaskIdsByTagId(tagId: number): number[] {
    const rows = this.db
      .prepare('SELECT task_id FROM task_tags WHERE tag_id = ? ORDER BY created_at ASC')
      .all(tagId) as Array<{ task_id: number }>;
    return rows.map((r) => r.task_id);
  }

  findTasksByTagId(tagId: number): Task[] {
    return this.db
      .prepare(
        `SELECT t.* FROM tasks t
         INNER JOIN task_tags tt ON t.id = tt.task_id
         WHERE tt.tag_id = ?
         ORDER BY tt.created_at ASC`
      )
      .all(tagId) as unknown as Task[];
  }

  findAllGroupedByTaskId(): Map<number, Tag[]> {
    const rows = this.db
      .prepare(
        `SELECT tt.task_id, t.*
         FROM tags t
         INNER JOIN task_tags tt ON t.id = tt.tag_id
         ORDER BY tt.task_id, tt.created_at ASC`
      )
      .all() as unknown as Array<{ task_id: number } & Tag>;

    const result = new Map<number, Tag[]>();
    for (const row of rows) {
      const taskId = row.task_id;
      const tag: Tag = { id: row.id, name: row.name, created_at: row.created_at };
      if (!result.has(taskId)) result.set(taskId, []);
      result.get(taskId)!.push(tag);
    }
    return result;
  }
}

class SQLiteMetadataRepository implements MetadataRepository {
  constructor(private db: Database.Database) {}

  set(input: CreateTaskMetadataInput & { created_at: string; updated_at: string }): TaskMetadata {
    const existing = this.findByKey(input.task_id, input.key);
    if (existing) {
      return this.update(input.task_id, input.key, input.value, input.updated_at)!;
    }
    this.db
      .prepare('INSERT INTO task_metadata (task_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(input.task_id, input.key, input.value, input.created_at, input.updated_at);
    return this.findByKey(input.task_id, input.key)!;
  }

  findByKey(taskId: number, key: string): TaskMetadata | null {
    const row = this.db.prepare('SELECT * FROM task_metadata WHERE task_id = ? AND key = ?').get(taskId, key) as
      | TaskMetadata
      | undefined;
    return row ?? null;
  }

  findByTaskId(taskId: number): TaskMetadata[] {
    return this.db
      .prepare('SELECT * FROM task_metadata WHERE task_id = ? ORDER BY created_at DESC, id DESC')
      .all(taskId) as unknown as TaskMetadata[];
  }

  delete(taskId: number, key: string): boolean {
    const result = this.db.prepare('DELETE FROM task_metadata WHERE task_id = ? AND key = ?').run(taskId, key);
    return result.changes > 0;
  }

  deleteAllForTask(taskId: number): number {
    const result = this.db.prepare('DELETE FROM task_metadata WHERE task_id = ?').run(taskId);
    return result.changes;
  }

  findAllGroupedByTaskId(): Map<number, TaskMetadata[]> {
    const rows = this.db
      .prepare('SELECT * FROM task_metadata ORDER BY task_id, created_at DESC, id DESC')
      .all() as unknown as TaskMetadata[];

    const result = new Map<number, TaskMetadata[]>();
    for (const row of rows) {
      const taskId = row.task_id;
      if (!result.has(taskId)) result.set(taskId, []);
      result.get(taskId)!.push(row);
    }
    return result;
  }

  update(taskId: number, key: string, value: string, updatedAt: string): TaskMetadata | null {
    this.db
      .prepare('UPDATE task_metadata SET value = ?, updated_at = ? WHERE task_id = ? AND key = ?')
      .run(value, updatedAt, taskId, key);
    return this.findByKey(taskId, key);
  }
}

class SQLiteCommentRepository implements CommentRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateTaskCommentInput & { created_at: string; updated_at: string }): TaskComment {
    const result = this.db
      .prepare('INSERT INTO task_comments (task_id, author, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(input.task_id, input.author ?? null, input.content, input.created_at, input.updated_at);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): TaskComment | null {
    const row = this.db.prepare('SELECT * FROM task_comments WHERE id = ?').get(id) as TaskComment | undefined;
    return row ?? null;
  }

  findByTaskId(taskId: number): TaskComment[] {
    return this.db
      .prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as unknown as TaskComment[];
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM task_comments WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteAllForTask(taskId: number): number {
    const result = this.db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(taskId);
    return result.changes;
  }

  update(id: number, content: string, updatedAt: string): TaskComment | null {
    const result = this.db
      .prepare('UPDATE task_comments SET content = ?, updated_at = ? WHERE id = ?')
      .run(content, updatedAt, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  findByTaskIds(taskIds: number[]): Map<number, TaskComment[]> {
    if (taskIds.length === 0) return new Map();
    const placeholders = taskIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM task_comments WHERE task_id IN (${placeholders}) ORDER BY task_id, created_at ASC`)
      .all(...taskIds) as unknown as TaskComment[];

    const result = new Map<number, TaskComment[]>();
    for (const row of rows) {
      const taskId = row.task_id;
      if (!result.has(taskId)) result.set(taskId, []);
      result.get(taskId)!.push(row);
    }
    return result;
  }

  updateTimestamps(id: number, createdAt: string, updatedAt: string): void {
    this.db
      .prepare('UPDATE task_comments SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(createdAt, updatedAt, id);
  }
}

class SQLiteRunLogRepository implements RunLogRepository {
  constructor(private db: Database.Database) {}

  create(taskId: number, startedAt: string): number {
    const result = this.db
      .prepare(
        `INSERT INTO task_run_logs (task_id, started_at, finished_at, exit_code, events) VALUES (?, ?, NULL, NULL, '[]')`
      )
      .run(taskId, startedAt);
    return result.lastInsertRowid as number;
  }

  updateFinished(id: number, finishedAt: string, exitCode: number, events: string): void {
    this.db
      .prepare(`UPDATE task_run_logs SET finished_at = ?, exit_code = ?, events = ? WHERE id = ?`)
      .run(finishedAt, exitCode, events, id);
  }

  updateSessionId(id: number, sessionId: string): void {
    this.db.prepare(`UPDATE task_run_logs SET session_id = ? WHERE id = ?`).run(sessionId, id);
  }

  updateEvents(id: number, events: string): void {
    this.db.prepare(`UPDATE task_run_logs SET events = ? WHERE id = ?`).run(events, id);
  }

  findLatestByTaskId(taskId: number): RunLogRow | null {
    const row = this.db
      .prepare(`SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1`)
      .get(taskId) as RunLogRow | undefined;
    return row ?? null;
  }

  findByTaskId(taskId: number, limit: number): RunLogRow[] {
    return this.db
      .prepare(`SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?`)
      .all(taskId, limit) as unknown as RunLogRow[];
  }

  findIdsByTaskId(taskId: number): number[] {
    const rows = this.db
      .prepare(`SELECT id FROM task_run_logs WHERE task_id = ? ORDER BY started_at DESC`)
      .all(taskId) as { id: number }[];
    return rows.map((r) => r.id);
  }

  deleteMany(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM task_run_logs WHERE id IN (${placeholders})`).run(...ids);
  }
}

/**
 * SQLite implementation of StorageBackend
 */
export class SQLiteStorageBackend implements StorageBackend {
  readonly tasks: TaskRepository;
  readonly tags: TagRepository;
  readonly blocks: TaskBlockRepository;
  readonly taskTags: TaskTagRepository;
  readonly metadata: MetadataRepository;
  readonly comments: CommentRepository;
  readonly runLogs: RunLogRepository;

  constructor(private db: Database.Database) {
    this.tasks = new SQLiteTaskRepository(db);
    this.tags = new SQLiteTagRepository(db);
    this.blocks = new SQLiteTaskBlockRepository(db);
    this.taskTags = new SQLiteTaskTagRepository(db);
    this.metadata = new SQLiteMetadataRepository(db);
    this.comments = new SQLiteCommentRepository(db);
    this.runLogs = new SQLiteRunLogRepository(db);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  updateTaskTimestamps(id: number, createdAt: string, updatedAt: string): void {
    this.db.prepare('UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?').run(createdAt, updatedAt, id);
  }

  getBoardUpdatedAtSignature(): string | null {
    const baseRow = this.db
      .prepare(
        `SELECT MAX(updated_at) as max_updated_at FROM (
          SELECT updated_at FROM tasks UNION ALL SELECT updated_at FROM task_metadata
        )`
      )
      .get() as { max_updated_at: string | null };
    const tagsRow = this.db
      .prepare('SELECT MAX(created_at) as max_created_at, COUNT(*) as count FROM task_tags')
      .get() as { max_created_at: string | null; count: number };
    const blocksRow = this.db
      .prepare('SELECT MAX(created_at) as max_created_at, COUNT(*) as count FROM task_blocks')
      .get() as { max_created_at: string | null; count: number };

    if (baseRow.max_updated_at === null && tagsRow.max_created_at === null && blocksRow.max_created_at === null)
      return null;
    return `${baseRow.max_updated_at}|${tagsRow.max_created_at}|${tagsRow.count}|${blocksRow.max_created_at}|${blocksRow.count}`;
  }

  close(): void {
    this.db.close();
  }
}
