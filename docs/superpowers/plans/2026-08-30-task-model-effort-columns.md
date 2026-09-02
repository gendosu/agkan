# タスク単位 model/effort override のカラム化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タスク単位の Claude model/effort override を `task_metadata` の汎用キーから `tasks` テーブルの専用カラム4本へ移し、CLI・Board API から一貫して読み書きできるようにする。

**Architecture:** `priority` / `branch` のカラム化と同じパターンを踏襲する。新規マイグレーションで4カラムを追加し既存 metadata をバックフィル後に削除、`src/models/Task.ts` と `sqlite-storage-backend.ts` にフィールドを通し、`src/board/taskModelOverride.ts` を `MetadataService` ベースから `TaskService` ベースへ書き換える。`BulkRunService` の重複解決ロジックは `resolveModelAndEffort` に一元化する。

**Tech Stack:** TypeScript / better-sqlite3 / Hono / commander / vitest / pnpm

**Spec:** `docs/superpowers/specs/2026-08-30-task-model-effort-columns-design.md`

**Base branch:** `upstream/main`（`gendosu/agkan` の main。v3.20.2 リリース済み、コミット `a9573bd` 時点。Task 0 でここから作業ブランチを作成する）

## Global Constraints

- 追加するカラムは4本、すべて `TEXT DEFAULT NULL`: `model_planning`, `model_run`, `effort_planning`, `effort_run`
- 有効な model alias は `['fable', 'opus', 'sonnet', 'haiku']`（`src/board/claudePromptBuilder.ts` の `MODEL_ALIASES` を唯一の正とする）
- 有効な effort level は `['low', 'medium', 'high', 'xhigh', 'max']`（既存の `VALID_EFFORT_LEVELS`、`src/board/claudePromptBuilder.ts:35`）
- 移行対象の `task_metadata` キーは `'model:planning'`, `'model:run'`, `'effort:planning'`, `'effort:run'` の4つ。バックフィル後に該当行を削除する
- CLI フラグ名は `--model-planning`, `--model-run`, `--effort-planning`, `--effort-run`。空文字でクリア
- `task list --json` には4フィールドを含めない（`branch` と同じ除外方針）
- `src/board/client/detailPanelHtml.ts` / `src/board/boardRenderer.ts` のクライアント側ドロップダウンは変更しない（スコープ外）
- `#724` のプロンプト文字列重複（`exitInstruction` / `branchInstruction`）は解消しない（スコープ外）
- テストコマンド: `pnpm exec vitest run <path>`。型チェック: `pnpm run type-check`。lint: `pnpm run lint`
- コミットメッセージは英語、Conventional Commits 形式
- beta ブランチにのみ存在する multi-agent 対応（`src/db/config.ts` の `resolveModelSettings` など）はベースの upstream/main に存在しない。本計画のコードはそれを一切参照しない

---

### Task 0: 作業ブランチの作成

**Files:** なし（git 操作のみ）

- [ ] **Step 1: upstream/main を取得して作業ブランチを作成する**

```bash
git fetch upstream
git checkout -b feat/task-model-effort-columns upstream/main
```

- [ ] **Step 2: 基点を確認する**

Run: `git log --oneline -1`
Expected: `a9573bd Merge pull request #393 from gendosu/chore/release-v3.20.2`（またはそれ以降の upstream/main コミット）

---

### Task 1: マイグレーション（4カラム追加 + task_metadata バックフィル・削除）

**Files:**
- Create: `src/db/migrations/20260830000000_add_model_effort_overrides_to_tasks.ts`
- Modify: `src/db/migrations/index.ts:1-30`
- Test: `tests/db/migrations/add_model_effort_overrides_to_tasks.test.ts`

**Interfaces:**
- Consumes: `MigratableDatabase`（`src/db/migrations/types.ts:4-9`。`exec(sql)` / `prepare(sql)` を持ち、prepared statement は `all(...args)` / `run(...args)` を受け付ける）
- Produces: `up(db: MigratableDatabase): void` — `tasks` テーブルに `model_planning` / `model_run` / `effort_planning` / `effort_run`（すべて `TEXT DEFAULT NULL`）を追加し、`task_metadata` の対応キーをカラムへ移して該当行を削除する。以降の全タスクはこの4カラムが存在する前提で書かれている

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/migrations/add_model_effort_overrides_to_tasks.test.ts` を新規作成する。

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../../src/db/migrations/20260830000000_add_model_effort_overrides_to_tasks';

function createDbWithTables(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE task_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(task_id, key)
    );
  `);
  return db;
}

function insertTask(db: Database.Database, title: string): number {
  db.exec(`INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('${title}', 'backlog', '', '')`);
  return (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
}

function insertMetadata(db: Database.Database, taskId: number, key: string, value: string): void {
  db.prepare(
    `INSERT INTO task_metadata (task_id, key, value, created_at, updated_at) VALUES (?, ?, ?, '', '')`
  ).run(taskId, key, value);
}

function taskColumns(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
}

describe('add_model_effort_overrides_to_tasks migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbWithTables();
  });

  it('adds the four override columns when they do not exist', () => {
    up(db);
    const columns = taskColumns(db);
    expect(columns).toContain('model_planning');
    expect(columns).toContain('model_run');
    expect(columns).toContain('effort_planning');
    expect(columns).toContain('effort_run');
  });

  it('is idempotent when the columns already exist', () => {
    db.exec(`ALTER TABLE tasks ADD COLUMN model_planning TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE tasks ADD COLUMN effort_run TEXT DEFAULT NULL`);
    expect(() => up(db)).not.toThrow();
    const columns = taskColumns(db);
    expect(columns).toContain('model_planning');
    expect(columns).toContain('model_run');
    expect(columns).toContain('effort_planning');
    expect(columns).toContain('effort_run');
  });

  it('defaults to null for existing rows', () => {
    insertTask(db, 'existing');
    up(db);
    const row = db.prepare('SELECT model_planning, model_run, effort_planning, effort_run FROM tasks').get() as {
      model_planning: string | null;
      model_run: string | null;
      effort_planning: string | null;
      effort_run: string | null;
    };
    expect(row.model_planning).toBeNull();
    expect(row.model_run).toBeNull();
    expect(row.effort_planning).toBeNull();
    expect(row.effort_run).toBeNull();
  });

  it('backfills all four keys from task_metadata and deletes the rows', () => {
    const taskId = insertTask(db, 'with-overrides');
    insertMetadata(db, taskId, 'model:planning', 'opus');
    insertMetadata(db, taskId, 'model:run', 'sonnet');
    insertMetadata(db, taskId, 'effort:planning', 'low');
    insertMetadata(db, taskId, 'effort:run', 'xhigh');

    up(db);

    const row = db
      .prepare('SELECT model_planning, model_run, effort_planning, effort_run FROM tasks WHERE id = ?')
      .get(taskId) as {
      model_planning: string;
      model_run: string;
      effort_planning: string;
      effort_run: string;
    };
    expect(row.model_planning).toBe('opus');
    expect(row.model_run).toBe('sonnet');
    expect(row.effort_planning).toBe('low');
    expect(row.effort_run).toBe('xhigh');

    const remaining = db.prepare('SELECT COUNT(*) as n FROM task_metadata').get() as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('leaves unrelated metadata keys untouched', () => {
    const taskId = insertTask(db, 'mixed');
    insertMetadata(db, taskId, 'model:run', 'haiku');
    insertMetadata(db, taskId, 'owner', 'alice');

    up(db);

    const owner = db.prepare(`SELECT value FROM task_metadata WHERE task_id = ? AND key = 'owner'`).get(taskId) as {
      value: string;
    };
    expect(owner.value).toBe('alice');
    const modelRun = db.prepare(`SELECT * FROM task_metadata WHERE task_id = ? AND key = 'model:run'`).get(taskId);
    expect(modelRun).toBeUndefined();
  });

  it('does not overwrite a column that already holds a value, but still deletes the metadata row', () => {
    const taskId = insertTask(db, 'preset');
    db.exec(`ALTER TABLE tasks ADD COLUMN model_run TEXT DEFAULT NULL`);
    db.prepare('UPDATE tasks SET model_run = ? WHERE id = ?').run('fable', taskId);
    insertMetadata(db, taskId, 'model:run', 'haiku');

    up(db);

    const row = db.prepare('SELECT model_run FROM tasks WHERE id = ?').get(taskId) as { model_run: string };
    expect(row.model_run).toBe('fable');
    const meta = db.prepare(`SELECT * FROM task_metadata WHERE task_id = ? AND key = 'model:run'`).get(taskId);
    expect(meta).toBeUndefined();
  });

  it('skips blank metadata values but still deletes them', () => {
    const taskId = insertTask(db, 'blank');
    insertMetadata(db, taskId, 'effort:run', '   ');

    up(db);

    const row = db.prepare('SELECT effort_run FROM tasks WHERE id = ?').get(taskId) as { effort_run: string | null };
    expect(row.effort_run).toBeNull();
    const meta = db.prepare(`SELECT * FROM task_metadata WHERE task_id = ? AND key = 'effort:run'`).get(taskId);
    expect(meta).toBeUndefined();
  });

  it('does nothing when no override metadata exists', () => {
    insertTask(db, 'plain');
    expect(() => up(db)).not.toThrow();
    const row = db.prepare('SELECT model_run FROM tasks').get() as { model_run: string | null };
    expect(row.model_run).toBeNull();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/db/migrations/add_model_effort_overrides_to_tasks.test.ts`
Expected: FAIL — `Failed to resolve import ".../20260830000000_add_model_effort_overrides_to_tasks"`

- [ ] **Step 3: マイグレーションを実装する**

`src/db/migrations/20260830000000_add_model_effort_overrides_to_tasks.ts` を新規作成する。

```typescript
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/db/migrations/add_model_effort_overrides_to_tasks.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: マイグレーションを登録する**

`src/db/migrations/index.ts` を以下の内容に置き換える。

```typescript
export type { MigratableDatabase, Migration } from './types';

import type { Migration } from './types';
import { up as initialSchema } from './20260328000000_initial_schema';
import { up as addSessionId } from './20260329000000_add_session_id_to_task_run_logs';
import { up as addIsArchived } from './20260412000000_add_is_archived_to_tasks';
import { up as addBranchToTasks } from './20260516000000_add_branch_to_tasks';
import { up as addModelEffortOverridesToTasks } from './20260830000000_add_model_effort_overrides_to_tasks';

export const migrations: Migration[] = [
  {
    version: '20260328000000',
    description: 'initial_schema',
    up: initialSchema,
  },
  {
    version: '20260329000000',
    description: 'add_session_id_to_task_run_logs',
    up: addSessionId,
  },
  {
    version: '20260412000000',
    description: 'add_is_archived_to_tasks',
    up: addIsArchived,
  },
  {
    version: '20260516000000',
    description: 'add_branch_to_tasks',
    up: addBranchToTasks,
  },
  {
    version: '20260830000000',
    description: 'add_model_effort_overrides_to_tasks',
    up: addModelEffortOverridesToTasks,
  },
];
```

- [ ] **Step 6: マイグレーション実行系のテストを実行する**

Run: `pnpm exec vitest run tests/db/`
Expected: PASS。`tests/db/schema.test.ts` の件数アサーションは `realMigrations.length` を参照しているため（`tests/db/schema.test.ts:72`）ハードコードによる失敗は起きない

- [ ] **Step 7: コミット**

```bash
git add src/db/migrations/20260830000000_add_model_effort_overrides_to_tasks.ts src/db/migrations/index.ts tests/db/migrations/add_model_effort_overrides_to_tasks.test.ts
git commit -m "feat(db): add model/effort override columns to tasks with metadata backfill"
```

---

### Task 2: Task モデル型と SQLite ストレージバックエンドに4フィールドを通す

**Files:**
- Modify: `src/models/Task.ts:22-79`
- Modify: `src/db/adapters/sqlite-storage-backend.ts:144-200`
- Test: `tests/TaskService.test.ts`（`createTask` describe に追加 / `updateTask` describe に追加）

**Interfaces:**
- Consumes: Task 1 の4カラム
- Produces:
  - `Task` に `model_planning: string | null` / `model_run: string | null` / `effort_planning: string | null` / `effort_run: string | null`
  - `CreateTaskInput` / `UpdateTaskInput` に `model_planning?: string | null` / `model_run?: string | null` / `effort_planning?: string | null` / `effort_run?: string | null`
  - `taskService.createTask({ ..., model_run: 'sonnet' })` と `taskService.updateTask(id, { effort_run: 'xhigh' })` が動作する。以降の全タスクがこのインターフェースに依存する
- 読み取り側（`findById` / `findAll` / `findChildren` / `findForPurge`）は `SELECT *` を使っているため（`src/db/adapters/sqlite-storage-backend.ts:50,76,78,209,241`）変更不要

- [ ] **Step 1: 失敗するテストを書く**

`tests/TaskService.test.ts` の `describe('createTask', ...)` の中、`it('branch becomes null when not specified', ...)`（`tests/TaskService.test.ts:159-163`）の直後に追加する。

```typescript
    it('Create task with model/effort overrides specified', () => {
      const task = taskService.createTask({
        title: 'Test Task',
        model_planning: 'opus',
        model_run: 'sonnet',
        effort_planning: 'low',
        effort_run: 'xhigh',
      });

      expect(task.model_planning).toBe('opus');
      expect(task.model_run).toBe('sonnet');
      expect(task.effort_planning).toBe('low');
      expect(task.effort_run).toBe('xhigh');
    });

    it('model/effort overrides become null when not specified', () => {
      const task = taskService.createTask({ title: 'Test Task' });

      expect(task.model_planning).toBeNull();
      expect(task.model_run).toBeNull();
      expect(task.effort_planning).toBeNull();
      expect(task.effort_run).toBeNull();
    });
```

`describe('updateTask', ...)` の中、`it('Can update branch', ...)`（`tests/TaskService.test.ts:1103-1115`）の直後に追加する。

```typescript
    it('Can update model/effort overrides', () => {
      const createdTask = taskService.createTask({ title: 'Test Task' });

      const updatedTask = taskService.updateTask(createdTask.id, {
        model_planning: 'fable',
        model_run: 'haiku',
        effort_planning: 'medium',
        effort_run: 'max',
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask!.model_planning).toBe('fable');
      expect(updatedTask!.model_run).toBe('haiku');
      expect(updatedTask!.effort_planning).toBe('medium');
      expect(updatedTask!.effort_run).toBe('max');

      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask!.model_run).toBe('haiku');
    });

    it('Can clear model/effort overrides by setting null', () => {
      const createdTask = taskService.createTask({ title: 'Test Task', model_run: 'sonnet', effort_run: 'high' });

      const updatedTask = taskService.updateTask(createdTask.id, { model_run: null, effort_run: null });

      expect(updatedTask!.model_run).toBeNull();
      expect(updatedTask!.effort_run).toBeNull();
    });

    it('Leaves model/effort overrides untouched when not part of the update', () => {
      const createdTask = taskService.createTask({ title: 'Test Task', model_run: 'sonnet' });

      const updatedTask = taskService.updateTask(createdTask.id, { title: 'Renamed' });

      expect(updatedTask!.title).toBe('Renamed');
      expect(updatedTask!.model_run).toBe('sonnet');
    });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/TaskService.test.ts -t 'model/effort'`
Expected: FAIL — `Object literal may only specify known properties` の型エラー、または `expect(received).toBe('opus')` で `undefined` を受け取る

- [ ] **Step 3: Task モデルにフィールドを追加する**

`src/models/Task.ts` の `Task` interface（`branch: string | null;` の直後）に追加する。

```typescript
export interface Task {
  id: number;
  title: string;
  body: string | null;
  author: string | null;
  assignees: string | null;
  status: TaskStatus;
  priority: Priority | null;
  created_at: string;
  updated_at: string;
  parent_id: number | null;
  is_archived: 0 | 1;
  branch: string | null;
  /** Claude model alias used for planning runs of this task (null = fall back to config) */
  model_planning: string | null;
  /** Claude model alias used for pr/run runs of this task (null = fall back to config) */
  model_run: string | null;
  /** Reasoning effort used for planning runs of this task (null = fall back to config) */
  effort_planning: string | null;
  /** Reasoning effort used for pr/run runs of this task (null = fall back to config) */
  effort_run: string | null;
}
```

`CreateTaskInput` の `branch?: string | null;` の直後に追加する。

```typescript
  branch?: string | null;
  model_planning?: string | null;
  model_run?: string | null;
  effort_planning?: string | null;
  effort_run?: string | null;
```

`UpdateTaskInput` の `branch?: string | null;` の直後に、同じ4行を追加する。

```typescript
  branch?: string | null;
  model_planning?: string | null;
  model_run?: string | null;
  effort_planning?: string | null;
  effort_run?: string | null;
```

- [ ] **Step 4: SQLite ストレージバックエンドの INSERT / UPDATE に通す**

`src/db/adapters/sqlite-storage-backend.ts` の `create()`（144-164行）を置き換える。

```typescript
  create(input: CreateTaskInput & { status: TaskStatus; created_at: string; updated_at: string }): Task {
    const result = this.db
      .prepare(
        `INSERT INTO tasks (title, body, author, assignees, status, priority, parent_id, branch, model_planning, model_run, effort_planning, effort_run, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title,
        input.body ?? null,
        input.author ?? null,
        input.assignees ?? null,
        input.status,
        input.priority !== undefined ? input.priority : null,
        input.parent_id !== undefined ? input.parent_id : null,
        input.branch !== undefined ? input.branch : null,
        input.model_planning !== undefined ? input.model_planning : null,
        input.model_run !== undefined ? input.model_run : null,
        input.effort_planning !== undefined ? input.effort_planning : null,
        input.effort_run !== undefined ? input.effort_run : null,
        input.created_at,
        input.updated_at
      );

    return this.findById(result.lastInsertRowid as number)!;
  }
```

`buildUpdateClauses()`（176-200行）の `fields` 配列を置き換える。

```typescript
    const fields: Array<[string, keyof typeof input, (v: unknown) => string | number | null]> = [
      ['title', 'title', (v) => v as string],
      ['body', 'body', (v) => v as string | null],
      ['author', 'author', (v) => v as string | null],
      ['assignees', 'assignees', (v) => (v as string) || null],
      ['status', 'status', (v) => v as string],
      ['priority', 'priority', (v) => v as string | null],
      ['parent_id', 'parent_id', (v) => v as number | null],
      ['branch', 'branch', (v) => v as string | null],
      ['model_planning', 'model_planning', (v) => v as string | null],
      ['model_run', 'model_run', (v) => v as string | null],
      ['effort_planning', 'effort_planning', (v) => v as string | null],
      ['effort_run', 'effort_run', (v) => v as string | null],
      ['updated_at', 'updated_at', (v) => v as string],
    ];
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/TaskService.test.ts`
Expected: PASS（既存テストを含めすべて）

- [ ] **Step 6: 型チェックを実行する**

Run: `pnpm run type-check`
Expected: エラーなし。`Task` に必須フィールドが4本増えるが、コードベースに `Task` オブジェクトリテラルを手組みしている箇所は無く（`src/db/adapters/sqlite-storage-backend.ts:50` 等の `as Task` キャストは DB の行に対するもので影響を受けない）、追加の修正は不要

- [ ] **Step 7: コミット**

```bash
git add src/models/Task.ts src/db/adapters/sqlite-storage-backend.ts tests/TaskService.test.ts
git commit -m "feat(models): thread model/effort override columns through Task and the SQLite backend"
```

---

### Task 3: `MODEL_ALIASES` / `isValidModelAlias` を追加する

**Files:**
- Modify: `src/board/claudePromptBuilder.ts:35-39`
- Test: `tests/board/claudePromptBuilder.test.ts:80-91`

**Interfaces:**
- Produces:
  - `export const MODEL_ALIASES = ['fable', 'opus', 'sonnet', 'haiku'] as const`
  - `export function isValidModelAlias(model: string): model is (typeof MODEL_ALIASES)[number]`
  - Task 5（Board API バリデーション）と Task 7 / Task 8（CLI バリデーション）が両方を import する

- [ ] **Step 1: 失敗するテストを書く**

`tests/board/claudePromptBuilder.test.ts` の import 文（16-22行）を差し替える。

```typescript
import {
  parseClaudeCommand,
  buildClaudePrompt,
  isValidEffortLevel,
  VALID_EFFORT_LEVELS,
  isValidModelAlias,
  MODEL_ALIASES,
  resolveModelAndEffort,
} from '../../src/board/claudePromptBuilder';
```

`describe('isValidEffortLevel / VALID_EFFORT_LEVELS', ...)`（80-91行）の直後に追加する。

```typescript
describe('isValidModelAlias / MODEL_ALIASES', () => {
  it('lists exactly the aliases the board dropdown offers', () => {
    expect([...MODEL_ALIASES]).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
  });

  it('accepts each documented alias', () => {
    for (const alias of MODEL_ALIASES) {
      expect(isValidModelAlias(alias)).toBe(true);
    }
  });

  it('rejects unknown aliases', () => {
    expect(isValidModelAlias('gpt-5')).toBe(false);
    expect(isValidModelAlias('Opus')).toBe(false);
    expect(isValidModelAlias('')).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/board/claudePromptBuilder.test.ts -t 'isValidModelAlias'`
Expected: FAIL — `isValidModelAlias is not a function` / import が解決できない

- [ ] **Step 3: 実装する**

`src/board/claudePromptBuilder.ts` の `VALID_EFFORT_LEVELS` 定義（35-39行）の直後に追加する。

```typescript
export const VALID_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export function isValidEffortLevel(effort: string): effort is (typeof VALID_EFFORT_LEVELS)[number] {
  return (VALID_EFFORT_LEVELS as readonly string[]).includes(effort);
}

/**
 * Claude model aliases accepted for task-level overrides.
 * Single source of truth: the board client dropdown and the CLI flags both
 * validate against this list.
 */
export const MODEL_ALIASES = ['fable', 'opus', 'sonnet', 'haiku'] as const;

export function isValidModelAlias(model: string): model is (typeof MODEL_ALIASES)[number] {
  return (MODEL_ALIASES as readonly string[]).includes(model);
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/board/claudePromptBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/board/claudePromptBuilder.ts tests/board/claudePromptBuilder.test.ts
git commit -m "feat(board): add MODEL_ALIASES and isValidModelAlias to claudePromptBuilder"
```

---

### Task 4: override の読み書きを task_metadata から tasks カラムへ切り替える

`taskModelOverride.ts` の第一引数の型を `MetadataService` → `TaskService` に変える変更は、3つの呼び出し元（`claudePromptBuilder.ts` / `BulkRunService.ts` / `taskRoutes.ts`）を同時に壊す。型が一貫した状態を保つため、このタスクは1コミットで一括して行う。

**Files:**
- Modify: `src/board/taskModelOverride.ts`（全面書き換え）
- Modify: `src/board/claudePromptBuilder.ts:6,51-62`
- Modify: `src/board/routes/claudeRoutes.ts:17-23,44`
- Modify: `src/board/routes/taskRoutes.ts:114-115,162-163`
- Modify: `src/board/BulkRunService.ts:1-7,29-34,140-166`
- Modify: `src/board/boardRoutes.ts:55-56`
- Test: `tests/board/taskModelOverride.test.ts`（全面書き換え）
- Test: `tests/board/claudePromptBuilder.test.ts:14-15,28-31,116-148`
- Test: `tests/board/bulkRunService.test.ts:559-596`
- Test: `tests/board/claudeRoutes.test.ts:274,304,330` 付近

**Interfaces:**
- Consumes: Task 2 の `Task.model_planning` 他4フィールド、`TaskService.getTask(id): Task | null`（`src/services/TaskService.ts:100`）、`TaskService.updateTask(id, input): Task | null`（`src/services/TaskService.ts:152`）
- Produces:
  - `getTaskModelOverride(taskService: TaskService, taskId: number, kind: ModelOverrideKind): string | undefined`
  - `getTaskEffortOverride(taskService: TaskService, taskId: number, kind: ModelOverrideKind): string | undefined`
  - `persistTaskModelOverrides(taskId: number, rawModels: unknown, taskService: TaskService): void`
  - `persistTaskEffortOverrides(taskId: number, rawEfforts: unknown, taskService: TaskService): void`
  - `resolveModelAndEffort(taskService: TaskService | undefined, taskId: number, command: ClaudeCommand): ResolvedModelEffort`
  - `registerClaudeRoutes(app: Hono, claudeProcess: PtySessionService, ts: TaskService, gitService: GitService): void`（`ms: MetadataService` 引数を削除）
  - `new BulkRunService(ts: TaskService, tbs: TaskBlockService, claudeProcess: PtySessionService, taskService?: TaskService)`
  - **削除**: `taskModelMetadataKey` / `taskEffortMetadataKey`（メタデータキーは Task 1 のマイグレーションファイル内にインライン化済み。`src/db/migrations/*` から `src/board/*` を import しないため）

- [ ] **Step 1: 失敗するテストを書く（taskModelOverride）**

`tests/board/taskModelOverride.test.ts` を以下の内容で全面的に置き換える。

```typescript
/**
 * Tests for task-level model/effort override helpers (src/board/taskModelOverride.ts)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../../src/db/reset';
import { getStorageBackend } from '../../src/db/connection';
import { TaskService } from '../../src/services/TaskService';
import {
  getTaskModelOverride,
  getTaskEffortOverride,
  persistTaskModelOverrides,
  persistTaskEffortOverrides,
} from '../../src/board/taskModelOverride';

beforeEach(() => {
  resetDatabase();
});

function buildTaskService(): TaskService {
  return new TaskService(getStorageBackend());
}

describe('getTaskModelOverride / persistTaskModelOverrides', () => {
  it('returns undefined when no override is set', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBeUndefined();
    expect(getTaskModelOverride(ts, task.id, 'run')).toBeUndefined();
  });

  it('returns undefined for a task that does not exist', () => {
    const ts = buildTaskService();
    expect(getTaskModelOverride(ts, 9999, 'run')).toBeUndefined();
  });

  it('persists and reads back a model override', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus', run: 'haiku' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBe('opus');
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('haiku');
  });

  it('writes the values into the tasks columns, not task_metadata', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { run: 'sonnet' }, ts);
    expect(ts.getTask(task.id)!.model_run).toBe('sonnet');
    expect(getStorageBackend().metadata.findByTaskId(task.id)).toHaveLength(0);
  });

  it('clears an override when given an empty string', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBe('opus');
    persistTaskModelOverrides(task.id, { planning: '' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBeUndefined();
    expect(ts.getTask(task.id)!.model_planning).toBeNull();
  });

  it('trims surrounding whitespace before storing', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { run: '  sonnet  ' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('sonnet');
  });

  it('ignores keys not present in the input and leaves existing overrides untouched', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus', run: 'haiku' }, ts);
    persistTaskModelOverrides(task.id, { planning: 'sonnet' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBe('sonnet');
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('haiku');
  });

  it('silently ignores invalid input (non-object)', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(() => persistTaskModelOverrides(task.id, 'not-an-object', ts)).not.toThrow();
    expect(() => persistTaskModelOverrides(task.id, null, ts)).not.toThrow();
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBeUndefined();
  });
});

describe('getTaskEffortOverride / persistTaskEffortOverrides', () => {
  it('returns undefined when no override is set', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(getTaskEffortOverride(ts, task.id, 'planning')).toBeUndefined();
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBeUndefined();
  });

  it('persists and reads back an effort override', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { planning: 'low', run: 'xhigh' }, ts);
    expect(getTaskEffortOverride(ts, task.id, 'planning')).toBe('low');
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('xhigh');
  });

  it('clears an override when given an empty string', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { run: 'max' }, ts);
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('max');
    persistTaskEffortOverrides(task.id, { run: '' }, ts);
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBeUndefined();
  });

  it('is independent from model overrides on the same task', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { run: 'high' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'run')).toBeUndefined();
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('high');

    persistTaskModelOverrides(task.id, { run: 'sonnet' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('sonnet');
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('high');
  });

  it('silently ignores invalid input (non-object)', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(() => persistTaskEffortOverrides(task.id, 'not-an-object', ts)).not.toThrow();
    expect(() => persistTaskEffortOverrides(task.id, undefined, ts)).not.toThrow();
    expect(getTaskEffortOverride(ts, task.id, 'planning')).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/board/taskModelOverride.test.ts`
Expected: FAIL — 型エラー（`TaskService` を `MetadataService` の位置に渡している）、および `expect(getTaskModelOverride(ts, task.id, 'run')).toBe('sonnet')` が `undefined` を受け取る

- [ ] **Step 3: `taskModelOverride.ts` を書き換える**

`src/board/taskModelOverride.ts` を以下の内容で全面的に置き換える。

```typescript
import { TaskService } from '../services/TaskService';
import type { UpdateTaskInput } from '../models/Task';

export type ModelOverrideKind = 'planning' | 'run';
type OverrideCategory = 'model' | 'effort';

/** tasks table column holding the override for a given category/kind pair */
type OverrideColumn = 'model_planning' | 'model_run' | 'effort_planning' | 'effort_run';

function overrideColumn(category: OverrideCategory, kind: ModelOverrideKind): OverrideColumn {
  return `${category}_${kind}` as OverrideColumn;
}

function getTaskOverride(
  taskService: TaskService,
  taskId: number,
  category: OverrideCategory,
  kind: ModelOverrideKind
): string | undefined {
  const task = taskService.getTask(taskId);
  const trimmed = task?.[overrideColumn(category, kind)]?.trim();
  return trimmed || undefined;
}

export function getTaskModelOverride(
  taskService: TaskService,
  taskId: number,
  kind: ModelOverrideKind
): string | undefined {
  return getTaskOverride(taskService, taskId, 'model', kind);
}

export function getTaskEffortOverride(
  taskService: TaskService,
  taskId: number,
  kind: ModelOverrideKind
): string | undefined {
  return getTaskOverride(taskService, taskId, 'effort', kind);
}

export interface TaskModelOverrides {
  planning?: string;
  run?: string;
}

export interface TaskEffortOverrides {
  planning?: string;
  run?: string;
}

function persistTaskOverrides(
  taskId: number,
  rawValues: unknown,
  taskService: TaskService,
  category: OverrideCategory
): void {
  if (!rawValues || typeof rawValues !== 'object') return;
  const values = rawValues as Record<string, unknown>;
  const input: UpdateTaskInput = {};
  (['planning', 'run'] as const).forEach((kind) => {
    if (!(kind in values)) return;
    const raw = values[kind];
    input[overrideColumn(category, kind)] = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  });
  if (Object.keys(input).length === 0) return;
  taskService.updateTask(taskId, input);
}

export function persistTaskModelOverrides(taskId: number, rawModels: unknown, taskService: TaskService): void {
  persistTaskOverrides(taskId, rawModels, taskService, 'model');
}

export function persistTaskEffortOverrides(taskId: number, rawEfforts: unknown, taskService: TaskService): void {
  persistTaskOverrides(taskId, rawEfforts, taskService, 'effort');
}
```

- [ ] **Step 4: `taskModelOverride` のテストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/taskModelOverride.test.ts`
Expected: PASS（13 tests）

- [ ] **Step 5: `resolveModelAndEffort` の引数を `TaskService` に変える**

`src/board/claudePromptBuilder.ts` の import 文（6行目）を差し替える。

```typescript
import { TaskService } from '../services/TaskService';
```

`resolveModelAndEffort`（51-62行）を置き換える。

```typescript
/**
 * Resolve the model/effort to use for a Claude run.
 * Priority: task-level override (UI selection) > config file > default.
 * 'pr' and 'run' commands both use the 'run' model configuration.
 * `taskService` is optional so callers that intentionally skip task-level
 * overrides (BulkRunService constructed without one) share the same code path.
 */
export function resolveModelAndEffort(
  taskService: TaskService | undefined,
  taskId: number,
  command: ClaudeCommand
): ResolvedModelEffort {
  const config = loadConfig();
  const overrideKind: ModelOverrideKind = command === 'planning' ? 'planning' : 'run';
  const rawConfig = command === 'planning' ? config.models?.planning : config.models?.run;
  const model =
    (taskService ? getTaskModelOverride(taskService, taskId, overrideKind) : undefined) ??
    rawConfig?.model?.trim() ??
    undefined;
  const effort =
    (taskService ? getTaskEffortOverride(taskService, taskId, overrideKind) : undefined) ??
    rawConfig?.effort?.trim() ??
    undefined;
  return { model, effort };
}
```

- [ ] **Step 6: `claudeRoutes.ts` から不要になった `ms` 引数を削除する**

`src/board/routes/claudeRoutes.ts` の import 文から `MetadataService` の行（4行目）を削除し、`registerClaudeRoutes` のシグネチャ（17-23行）を置き換える。

```typescript
export function registerClaudeRoutes(
  app: Hono,
  claudeProcess: PtySessionService,
  ts: TaskService,
  gitService: GitService
): void {
```

44行目を置き換える。

```typescript
    const { model, effort } = resolveModelAndEffort(ts, taskId, command);
```

- [ ] **Step 7: `taskRoutes.ts` の永続化呼び出しを `ts` に切り替える**

`src/board/routes/taskRoutes.ts` の114-115行を置き換える。

```typescript
    persistTaskMetadata(task.id, body.metadata, ms);
    persistTaskModelOverrides(task.id, body.models, ts);
    persistTaskEffortOverrides(task.id, body.efforts, ts);
```

162-163行を置き換える。

```typescript
    if (body.models !== undefined) persistTaskModelOverrides(id, body.models, ts);
    if (body.efforts !== undefined) persistTaskEffortOverrides(id, body.efforts, ts);
```

`registerPatchAndDeleteTaskRoutes(app, ts, ms)` の `ms` 引数は PATCH 経路では未使用になる。`registerPatchAndDeleteTaskRoutes` の宣言（153行）を `function registerPatchAndDeleteTaskRoutes(app: Hono, ts: TaskService): void {` に変更し、186行の呼び出しを `registerPatchAndDeleteTaskRoutes(app, ts);` に変更する。

- [ ] **Step 8: `BulkRunService` を `resolveModelAndEffort` に一元化する**

`src/board/BulkRunService.ts` の import 文（1-7行）を置き換える。

```typescript
import { TaskService } from '../services/TaskService';
import { TaskBlockService } from '../services/TaskBlockService';
import { PtySessionService } from '../terminal/PtySessionService';
import { PRIORITY_ORDER } from '../models';
import { resolveModelAndEffort } from './claudePromptBuilder';
```

コンストラクタ（29-34行）を置き換える。

```typescript
  constructor(
    private ts: TaskService,
    private tbs: TaskBlockService,
    private claudeProcess: PtySessionService,
    private taskService?: TaskService
  ) {}
```

`buildLaunchParams`（140-166行）を置き換える。

```typescript
  private buildLaunchParams(taskId: number): {
    prompt: string;
    ptyCommand: 'pr' | 'run';
    model: string | undefined;
    effort: string | undefined;
  } {
    const command = this.command!;
    const ptyCommand: 'pr' | 'run' = command === 'pr' ? 'pr' : 'run';
    const exitInstruction =
      "\n\nWhen you have completed this task, send 'exit' as a prompt (not as a bash command) to end this session.";
    const prompt =
      command === 'pr'
        ? `Task ID: ${taskId}\n/agkan-subtask${exitInstruction}`
        : `Task ID: ${taskId}\n/agkan-subtask-direct${exitInstruction}`;
    const { model, effort } = resolveModelAndEffort(this.taskService, taskId, 'run');
    return {
      prompt,
      ptyCommand,
      model,
      effort,
    };
  }
```

- [ ] **Step 9: `boardRoutes.ts` の呼び出し元を更新する**

`src/board/boardRoutes.ts` の55-56行を置き換える。

```typescript
    registerClaudeRoutes(app, services.ptySessionService, ts, gitService);
    const bulkRunService = new BulkRunService(ts, tbs, services.ptySessionService, ts);
```

- [ ] **Step 10: 既存テストのセットアップをカラム書き込みに置き換える（claudePromptBuilder）**

`tests/board/claudePromptBuilder.test.ts` の `MetadataService` import（14行）を削除し、`buildServices`（28-31行）を置き換える。

```typescript
function buildServices() {
  const db = getStorageBackend();
  return { ts: new TaskService(db) };
}
```

`describe('resolveModelAndEffort', ...)` 内の4つの `it` を置き換える（116-148行）。

```typescript
  it('returns undefined for both when no config or override is set', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: undefined, effort: undefined });
  });

  it('falls back to the run config for both pr and run commands', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { model: 'claude-sonnet-4-6', effort: 'high' } } });

    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: 'claude-sonnet-4-6', effort: 'high' });
    expect(resolveModelAndEffort(ts, task.id, 'pr')).toEqual({ model: 'claude-sonnet-4-6', effort: 'high' });
  });

  it('uses the planning config only for the planning command', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { planning: { effort: 'low' } } });

    expect(resolveModelAndEffort(ts, task.id, 'planning')).toEqual({ model: undefined, effort: 'low' });
    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: undefined, effort: undefined });
  });

  it('prefers a task-level override over the config file', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { effort: 'high' } } });
    persistTaskEffortOverrides(task.id, { run: 'xhigh' }, ts);
    persistTaskModelOverrides(task.id, { run: 'opus' }, ts);

    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: 'opus', effort: 'xhigh' });
  });

  it('skips task-level overrides when no task service is supplied', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { effort: 'high' } } });
    persistTaskEffortOverrides(task.id, { run: 'xhigh' }, ts);

    expect(resolveModelAndEffort(undefined, task.id, 'run')).toEqual({ model: undefined, effort: 'high' });
  });
```

- [ ] **Step 11: 既存テストのセットアップをカラム書き込みに置き換える（bulkRunService）**

`tests/board/bulkRunService.test.ts` の `describe('BulkRunService model/effort override resolution', ...)`（559-596行）を置き換える。

```typescript
describe('BulkRunService model/effort override resolution', () => {
  it('uses task-level effort override in preference to config', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'Effort Task', status: 'ready', priority: 'high' });
    ts.updateTask(task.id, { effort_run: 'xhigh' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty, ts);

    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(task.id, expect.any(String), 'run', undefined, 'xhigh');

    service.stop();
  });

  it('uses task-level model override in preference to config', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'Model Task', status: 'ready', priority: 'high' });
    ts.updateTask(task.id, { model_run: 'opus' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty, ts);

    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(task.id, expect.any(String), 'run', 'opus', undefined);

    service.stop();
  });

  it('falls back to no effort when no override or config is set', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'No Effort Task', status: 'ready', priority: 'high' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty, ts);

    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(task.id, expect.any(String), 'run', undefined, undefined);

    service.stop();
  });

  it('ignores task-level overrides when constructed without a task service', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'Ignored Override Task', status: 'ready', priority: 'high' });
    ts.updateTask(task.id, { effort_run: 'xhigh' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(task.id, expect.any(String), 'run', undefined, undefined);

    service.stop();
  });
});
```

- [ ] **Step 12: 既存テストのセットアップをカラム書き込みに置き換える（claudeRoutes）**

`tests/board/claudeRoutes.test.ts` の3箇所の `services.ms.setMetadata(...)` を差し替える。

`it('uses task-level effort override in preference to config', ...)` 内（`tests/board/claudeRoutes.test.ts:283` 付近）:

```typescript
    services.ts.updateTask(task.id, { effort_run: 'xhigh' });
```

`it('uses task-level effort override for the planning command with the planning config key', ...)` 内（`tests/board/claudeRoutes.test.ts:309` 付近）:

```typescript
    services.ts.updateTask(task.id, { effort_planning: 'max' });
```

`it('returns 400 when the task-level effort override is invalid', ...)` 内（`tests/board/claudeRoutes.test.ts:334` 付近）:

```typescript
    services.ts.updateTask(task.id, { effort_run: 'ultra' });
```

- [ ] **Step 13: board のテスト一式を実行する**

Run: `pnpm exec vitest run tests/board/`
Expected: PASS

- [ ] **Step 14: 型チェックと lint を実行する**

Run: `pnpm run type-check && pnpm run lint`
Expected: エラーなし（未使用 import / 未使用引数が残っていれば lint がここで落ちる。落ちたら該当箇所を削除する）

- [ ] **Step 15: コミット**

```bash
git add src/board/taskModelOverride.ts src/board/claudePromptBuilder.ts src/board/routes/claudeRoutes.ts src/board/routes/taskRoutes.ts src/board/BulkRunService.ts src/board/boardRoutes.ts tests/board/taskModelOverride.test.ts tests/board/claudePromptBuilder.test.ts tests/board/bulkRunService.test.ts tests/board/claudeRoutes.test.ts
git commit -m "refactor(board): read and write task model/effort overrides from tasks columns"
```

---

### Task 5: Board API で不正な model/effort 値を 400 で拒否する

**Files:**
- Modify: `src/board/routes/taskRoutes.ts:1-10,95-118,153-165`
- Test: `tests/board/boardRoutes.test.ts`（`describe('POST /api/tasks', ...)` と `describe('PATCH /api/tasks/:id', ...)` に追加）

**Interfaces:**
- Consumes: Task 3 の `MODEL_ALIASES` / `isValidModelAlias` / `VALID_EFFORT_LEVELS` / `isValidEffortLevel`
- Produces: POST `/api/tasks` と PATCH `/api/tasks/:id` が `body.models` / `body.efforts` に不正な非空文字列を含む場合 400 と `{ error: string }` を返す。空文字はクリア指示として通す

- [ ] **Step 1: 失敗するテストを書く**

`tests/board/boardRoutes.test.ts` の `describe('POST /api/tasks', ...)` の末尾（`tests/board/boardRoutes.test.ts:300` 付近の最後の `it` の後）に追加する。

```typescript
  it('stores model and effort overrides on the created task', async () => {
    const services = buildServices();
    const app = buildApp(services);
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Override Task',
          models: { planning: 'opus', run: 'sonnet' },
          efforts: { planning: 'low', run: 'xhigh' },
        }),
      })
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number };
    const task = services.ts.getTask(created.id)!;
    expect(task.model_planning).toBe('opus');
    expect(task.model_run).toBe('sonnet');
    expect(task.effort_planning).toBe('low');
    expect(task.effort_run).toBe('xhigh');
  });

  it('returns 400 for an invalid model alias and does not create the task', async () => {
    const services = buildServices();
    const app = buildApp(services);
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Bad Model', models: { run: 'gpt-5' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Invalid model/);
    expect(services.ts.listTasks()).toHaveLength(0);
  });

  it('returns 400 for an invalid effort level', async () => {
    const services = buildServices();
    const app = buildApp(services);
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Bad Effort', efforts: { run: 'ultra' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Invalid effort level/);
  });

  it('accepts an empty string override as a clear instruction', async () => {
    const services = buildServices();
    const app = buildApp(services);
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Cleared', models: { run: '' }, efforts: { run: '' } }),
      })
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number };
    expect(services.ts.getTask(created.id)!.model_run).toBeNull();
  });
```

`describe('PATCH /api/tasks/:id', ...)` の末尾に追加する。

```typescript
  it('updates model and effort overrides', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Original', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: { run: 'haiku' }, efforts: { planning: 'medium' } }),
      })
    );
    expect(res.status).toBe(200);
    const updated = services.ts.getTask(task.id)!;
    expect(updated.model_run).toBe('haiku');
    expect(updated.effort_planning).toBe('medium');
  });

  it('returns 400 for an invalid model alias and leaves the task unchanged', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Original', status: 'backlog', model_run: 'sonnet' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Renamed', models: { run: 'gpt-5' } }),
      })
    );
    expect(res.status).toBe(400);
    const unchanged = services.ts.getTask(task.id)!;
    expect(unchanged.title).toBe('Original');
    expect(unchanged.model_run).toBe('sonnet');
  });

  it('returns 400 for an invalid effort level on PATCH', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Original', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efforts: { run: 'ultra' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Invalid effort level/);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/board/boardRoutes.test.ts -t 'Invalid'`
Expected: FAIL — 400 を期待したところで 201 / 200 が返る

- [ ] **Step 3: バリデーションを実装する**

`src/board/routes/taskRoutes.ts` の import 文（1-9行）の末尾に追加する。

```typescript
import {
  MODEL_ALIASES,
  isValidModelAlias,
  VALID_EFFORT_LEVELS,
  isValidEffortLevel,
} from '../claudePromptBuilder';
```

`persistTaskMetadata` の直前（`src/board/routes/taskRoutes.ts:84` の上）に追加する。

```typescript
function validateOverrideValues(
  rawValues: unknown,
  isValid: (value: string) => boolean,
  label: string,
  validValues: readonly string[]
): string | undefined {
  if (!rawValues || typeof rawValues !== 'object') return undefined;
  const values = rawValues as Record<string, unknown>;
  for (const kind of ['planning', 'run'] as const) {
    const raw = values[kind];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    // An empty value is the UI's "clear this override" instruction, not a bad value.
    if (trimmed === '') continue;
    if (!isValid(trimmed)) {
      return `Invalid ${label} "${trimmed}". Must be one of: ${validValues.join(', ')}`;
    }
  }
  return undefined;
}

function validateOverrideBody(body: { models?: unknown; efforts?: unknown }): string | undefined {
  return (
    validateOverrideValues(body.models, isValidModelAlias, 'model', MODEL_ALIASES) ??
    validateOverrideValues(body.efforts, isValidEffortLevel, 'effort level', VALID_EFFORT_LEVELS)
  );
}
```

`registerCreateTaskRoute` の本体（96-117行）で、`const status = ...` の直前に検証を挿入する。

```typescript
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return c.json({ error: 'Title is required' }, 400);
    }
    const overrideError = validateOverrideBody(body);
    if (overrideError) return c.json({ error: overrideError }, 400);
    const status = body.status && STATUSES.includes(body.status) ? body.status : 'backlog';
```

`registerPatchAndDeleteTaskRoutes` の PATCH ハンドラ（154-165行）で、`buildTaskUpdateInput` の直後に検証を挿入する。

```typescript
    const body = await c.req.json<TaskPatchBody>();
    const { input, error } = buildTaskUpdateInput(body);
    if (error) return c.json({ error }, 400);
    const overrideError = validateOverrideBody(body);
    if (overrideError) return c.json({ error: overrideError }, 400);
    const task = ts.updateTask(id, input);
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/board/boardRoutes.test.ts`
Expected: PASS

- [ ] **Step 5: board のテスト一式で退行がないことを確認する**

Run: `pnpm exec vitest run tests/board/`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/board/routes/taskRoutes.ts tests/board/boardRoutes.test.ts
git commit -m "feat(board): reject invalid model/effort override values in the task API"
```

---

### Task 6: ExportImportService に4フィールドを通す

**Files:**
- Modify: `src/services/ExportImportService.ts:19-39,112-130,159-183`
- Test: `tests/services/ExportImportService.test.ts:151-157,618-653,773-795`

**Interfaces:**
- Consumes: Task 2 の `Task` / `CreateTaskInput` の4フィールド
- Produces: `ExportedTask` に `model_planning?: string | null` / `model_run?: string | null` / `effort_planning?: string | null` / `effort_run?: string | null`（旧形式のエクスポートファイルとの後方互換のため optional）

- [ ] **Step 1: 失敗するテストを書く**

`tests/services/ExportImportService.test.ts` の `it('should export priority and branch', ...)`（151-157行）の直後に追加する。

```typescript
    it('should export model and effort overrides', () => {
      taskService.createTask({
        title: 'Override Task',
        model_planning: 'opus',
        model_run: 'sonnet',
        effort_planning: 'low',
        effort_run: 'xhigh',
      });

      const data = service.exportData();
      expect(data.tasks[0].model_planning).toBe('opus');
      expect(data.tasks[0].model_run).toBe('sonnet');
      expect(data.tasks[0].effort_planning).toBe('low');
      expect(data.tasks[0].effort_run).toBe('xhigh');
    });
```

`it('should restore priority, branch, and archived status', ...)`（618行〜）の直後に追加する。

```typescript
    it('should restore model and effort overrides', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Override Restored Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
            model_planning: 'fable',
            model_run: 'haiku',
            effort_planning: 'medium',
            effort_run: 'max',
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].model_planning).toBe('fable');
      expect(tasks[0].model_run).toBe('haiku');
      expect(tasks[0].effort_planning).toBe('medium');
      expect(tasks[0].effort_run).toBe('max');
    });

    it('should import an old-format export without model/effort overrides', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Legacy Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      expect(tasks[0].model_planning).toBeNull();
      expect(tasks[0].model_run).toBeNull();
      expect(tasks[0].effort_planning).toBeNull();
      expect(tasks[0].effort_run).toBeNull();
    });
```

`it('should preserve priority, branch, and archived status through export and import cycle', ...)`（773行〜）の直後に追加する。

```typescript
    it('should preserve model and effort overrides through export and import cycle', () => {
      taskService.createTask({
        title: 'Round Trip Overrides',
        model_planning: 'opus',
        model_run: 'sonnet',
        effort_planning: 'low',
        effort_run: 'xhigh',
      });

      const exportedData = service.exportData();

      resetDatabase();

      const newService = new ExportImportService(getStorageBackend());
      newService.importData(exportedData);

      const newTaskService = new TaskService(getStorageBackend());
      const importedTasks = newTaskService.listTasks();
      expect(importedTasks).toHaveLength(1);
      expect(importedTasks[0].model_planning).toBe('opus');
      expect(importedTasks[0].model_run).toBe('sonnet');
      expect(importedTasks[0].effort_planning).toBe('low');
      expect(importedTasks[0].effort_run).toBe('xhigh');
    });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/services/ExportImportService.test.ts -t 'model and effort'`
Expected: FAIL — `ExportedTask` に該当プロパティが無い型エラー、または `expect(received).toBe('opus')` が `undefined` を受け取る

- [ ] **Step 3: 実装する**

`src/services/ExportImportService.ts` の `ExportedTask` interface（19-39行）に追加する。`branch?` の直後に置く。

```typescript
  /** Optional for backward compatibility with export files created before this field existed */
  branch?: string | null;
  /** Optional for backward compatibility with export files created before this field existed */
  model_planning?: string | null;
  /** Optional for backward compatibility with export files created before this field existed */
  model_run?: string | null;
  /** Optional for backward compatibility with export files created before this field existed */
  effort_planning?: string | null;
  /** Optional for backward compatibility with export files created before this field existed */
  effort_run?: string | null;
  /** Optional for backward compatibility with export files created before this field existed */
  is_archived?: 0 | 1;
```

`buildExportedTask` の return 文（112-129行）の `branch: task.branch,` の直後に追加する。

```typescript
      priority: task.priority,
      branch: task.branch,
      model_planning: task.model_planning,
      model_run: task.model_run,
      effort_planning: task.effort_planning,
      effort_run: task.effort_run,
      is_archived: task.is_archived,
```

`importTask` の `createTask` 呼び出し（162-171行）の `branch:` の直後に追加する。

```typescript
      priority: exportedTask.priority ?? undefined,
      branch: exportedTask.branch ?? undefined,
      model_planning: exportedTask.model_planning ?? undefined,
      model_run: exportedTask.model_run ?? undefined,
      effort_planning: exportedTask.effort_planning ?? undefined,
      effort_run: exportedTask.effort_run ?? undefined,
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/services/ExportImportService.test.ts tests/board/exportImportRoutes.test.ts tests/cli/commands/export.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/services/ExportImportService.ts tests/services/ExportImportService.test.ts
git commit -m "feat(services): export and import task model/effort overrides"
```

---

### Task 7: CLI `task update` に4フラグを追加する

**Files:**
- Modify: `src/cli/commands/task/update-helpers.ts:1-21,26-37,57-64,86-122,178-190`
- Modify: `src/cli/commands/task/update.ts:1-41,81-102`
- Test: `tests/cli/commands/task/update.test.ts`（`describe('--branch option', ...)`（884行〜）の直後に追加）

**Interfaces:**
- Consumes: Task 2 の `UpdateTaskInput` の4フィールド、Task 3 の `MODEL_ALIASES` / `isValidModelAlias` / `VALID_EFFORT_LEVELS` / `isValidEffortLevel`
- Produces:
  - `export function validateModelAlias(val: string, formatter: OutputFormatter): boolean`
  - `export function validateEffortLevel(val: string, formatter: OutputFormatter): boolean`
  - `UpdateOptions` に `modelPlanning?` / `modelRun?` / `effortPlanning?` / `effortRun?`（commander が `--model-planning` を `options.modelPlanning` にマップする）
  - `SUPPORTED_FIELDS` に `'model_planning'`, `'model_run'`, `'effort_planning'`, `'effort_run'`

- [ ] **Step 1: 失敗するテストを書く**

`tests/cli/commands/task/update.test.ts` の `describe('--branch option', ...)` ブロックの閉じ括弧の直後に追加する。

```typescript
  describe('model/effort override options', () => {
    it('should have the four override options registered', () => {
      const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
      const updateCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'update');
      const optionNames = updateCommand?.options.map((o) => o.long) ?? [];
      expect(optionNames).toContain('--model-planning');
      expect(optionNames).toContain('--model-run');
      expect(optionNames).toContain('--effort-planning');
      expect(optionNames).toContain('--effort-run');
    });

    it('should update all four overrides with flags', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Override test' });

      const { exitCode } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--model-planning',
        'opus',
        '--model-run',
        'sonnet',
        '--effort-planning',
        'low',
        '--effort-run',
        'xhigh',
      ]);
      expect(exitCode).toBeUndefined();

      const updated = taskService.getTask(task.id);
      expect(updated?.model_planning).toBe('opus');
      expect(updated?.model_run).toBe('sonnet');
      expect(updated?.effort_planning).toBe('low');
      expect(updated?.effort_run).toBe('xhigh');
    });

    it('should clear an override when the flag value is an empty string', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Clear test', model_run: 'sonnet', effort_run: 'high' });

      const { exitCode } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--model-run',
        '',
        '--effort-run',
        '',
      ]);
      expect(exitCode).toBeUndefined();

      const updated = taskService.getTask(task.id);
      expect(updated?.model_run).toBeNull();
      expect(updated?.effort_run).toBeNull();
    });

    it('should reject an invalid model alias', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Invalid model test' });

      const { exitCode, errors } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--model-run',
        'gpt-5',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid model: gpt-5');
      expect(taskService.getTask(task.id)?.model_run).toBeNull();
    });

    it('should reject an invalid effort level', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Invalid effort test' });

      const { exitCode, errors } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--effort-run',
        'ultra',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort: ultra');
      expect(taskService.getTask(task.id)?.effort_run).toBeNull();
    });

    it('should update an override with positional syntax', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Positional test' });

      const { exitCode } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'model_run',
        'haiku',
      ]);
      expect(exitCode).toBeUndefined();

      expect(taskService.getTask(task.id)?.model_run).toBe('haiku');
    });

    it('should reject an invalid value with positional syntax', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Positional invalid test' });

      const { exitCode, errors } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'effort_planning',
        'ultra',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort: ultra');
    });
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/update.test.ts -t 'model/effort override options'`
Expected: FAIL — `expect(optionNames).toContain('--model-planning')` が失敗

- [ ] **Step 3: `update-helpers.ts` を実装する**

import 文（1-9行）に追加する。

```typescript
import chalk from 'chalk';
import { isPriority } from '../../../models/Priority';
import { validateTaskStatus } from '../../utils/validators';
import { OutputFormatter } from '../../utils/output-formatter';
import { readBodyFromFile } from './add-helpers';
import {
  MODEL_ALIASES,
  isValidModelAlias,
  VALID_EFFORT_LEVELS,
  isValidEffortLevel,
} from '../../../board/claudePromptBuilder';
```

`UpdateOptions`（11-21行）を置き換える。

```typescript
export interface UpdateOptions {
  title?: string;
  status?: string;
  body?: string;
  author?: string;
  assignees?: string;
  priority?: string;
  branch?: string;
  modelPlanning?: string;
  modelRun?: string;
  effortPlanning?: string;
  effortRun?: string;
  file?: string;
  json?: boolean;
}
```

`isFlagMode`（26-37行）の `flagFields` 配列を置き換える。

```typescript
  const flagFields = [
    options.title,
    options.status,
    options.body,
    options.author,
    options.assignees,
    options.priority,
    options.branch,
    options.modelPlanning,
    options.modelRun,
    options.effortPlanning,
    options.effortRun,
  ];
```

`validatePriority`（57-64行）の直後に追加する。

```typescript
/**
 * Validates a Claude model alias and exits on failure.
 * An empty string is accepted: it is the "clear this override" value.
 */
export function validateModelAlias(val: string, formatter: OutputFormatter): boolean {
  if (val === '' || isValidModelAlias(val)) return true;
  formatter.error(`Invalid model: ${val}. Valid models: ${MODEL_ALIASES.join(', ')}`, () => {
    console.error(chalk.red(`\nInvalid model: ${val}`));
    console.error(`Valid models: ${MODEL_ALIASES.join(', ')}\n`);
  });
  return false;
}

/**
 * Validates a reasoning effort level and exits on failure.
 * An empty string is accepted: it is the "clear this override" value.
 */
export function validateEffortLevel(val: string, formatter: OutputFormatter): boolean {
  if (val === '' || isValidEffortLevel(val)) return true;
  formatter.error(`Invalid effort: ${val}. Valid efforts: ${VALID_EFFORT_LEVELS.join(', ')}`, () => {
    console.error(chalk.red(`\nInvalid effort: ${val}`));
    console.error(`Valid efforts: ${VALID_EFFORT_LEVELS.join(', ')}\n`);
  });
  return false;
}

const MODEL_FIELDS = ['model_planning', 'model_run'];
const EFFORT_FIELDS = ['effort_planning', 'effort_run'];
```

`buildFlagModeInput`（86-117行）の `flagFields` と検証ループを置き換える。

```typescript
  const flagFields: Record<string, string | undefined> = {
    title: options.title,
    status: options.status,
    body: options.body,
    author: options.author,
    assignees: options.assignees,
    priority: options.priority,
    branch: options.branch,
    model_planning: options.modelPlanning,
    model_run: options.modelRun,
    effort_planning: options.effortPlanning,
    effort_run: options.effortRun,
  };
```

```typescript
  const updateInput: Record<string, string> = {};
  for (const [key, val] of Object.entries(flagFields)) {
    if (val === undefined) continue;
    if (key === 'status' && !validateStatus(val, formatter)) return null;
    if (key === 'priority' && !validatePriority(val, formatter)) return null;
    if (MODEL_FIELDS.includes(key) && !validateModelAlias(val, formatter)) return null;
    if (EFFORT_FIELDS.includes(key) && !validateEffortLevel(val, formatter)) return null;
    updateInput[key] = val;
  }
  return updateInput;
```

`SUPPORTED_FIELDS` と `SUPPORTED_FLAGS`（119-122行）を置き換える。

```typescript
export const SUPPORTED_FIELDS = [
  'status',
  'title',
  'body',
  'author',
  'assignees',
  'priority',
  'branch',
  'model_planning',
  'model_run',
  'effort_planning',
  'effort_run',
] as const;
type SupportedField = (typeof SUPPORTED_FIELDS)[number];

// Field names use snake_case but the flags they map to are kebab-case (--model-planning).
const SUPPORTED_FLAGS = SUPPORTED_FIELDS.map((field) => `--${field.replace(/_/g, '-')}`).join(', ');
```

`buildPositionalModeInput`（178-190行）の検証部分を置き換える。

```typescript
  if (!validateFieldName(field, formatter)) return null;
  const resolvedValue = resolvePositionalValue(field, value, options, formatter);
  if (resolvedValue === null) return null;
  if (field === 'status' && !validateStatus(resolvedValue, formatter)) return null;
  if (field === 'priority' && !validatePriority(resolvedValue, formatter)) return null;
  if (MODEL_FIELDS.includes(field) && !validateModelAlias(resolvedValue, formatter)) return null;
  if (EFFORT_FIELDS.includes(field) && !validateEffortLevel(resolvedValue, formatter)) return null;
  return { [field]: resolvedValue };
```

- [ ] **Step 4: `update.ts` を実装する**

import 文（5-21行）に追加する。

```typescript
import { MODEL_ALIASES, VALID_EFFORT_LEVELS } from '../../../board/claudePromptBuilder';
```

`applyTaskUpdate`（23-41行）の `taskService.updateTask` 呼び出しに、`branch` の spread の直後で4つ追加する。

```typescript
    ...(updateInput.branch !== undefined && {
      branch: updateInput.branch === '' ? null : updateInput.branch,
    }),
    ...(updateInput.model_planning !== undefined && {
      model_planning: updateInput.model_planning === '' ? null : updateInput.model_planning,
    }),
    ...(updateInput.model_run !== undefined && {
      model_run: updateInput.model_run === '' ? null : updateInput.model_run,
    }),
    ...(updateInput.effort_planning !== undefined && {
      effort_planning: updateInput.effort_planning === '' ? null : updateInput.effort_planning,
    }),
    ...(updateInput.effort_run !== undefined && {
      effort_run: updateInput.effort_run === '' ? null : updateInput.effort_run,
    }),
```

`setupTaskUpdateCommand`（86-101行）の `.option('--branch ...')` の直後に4行追加する。

```typescript
    .option('--branch <branch>', 'Update git branch name (or empty to clear)')
    .option('--model-planning <alias>', `Update planning model (${MODEL_ALIASES.join(', ')}, or empty to clear)`)
    .option('--model-run <alias>', `Update run model (${MODEL_ALIASES.join(', ')}, or empty to clear)`)
    .option(
      '--effort-planning <level>',
      `Update planning reasoning effort (${VALID_EFFORT_LEVELS.join(', ')}, or empty to clear)`
    )
    .option(
      '--effort-run <level>',
      `Update run reasoning effort (${VALID_EFFORT_LEVELS.join(', ')}, or empty to clear)`
    )
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/update.test.ts`
Expected: PASS（既存テストを含めすべて）

- [ ] **Step 6: コミット**

```bash
git add src/cli/commands/task/update-helpers.ts src/cli/commands/task/update.ts tests/cli/commands/task/update.test.ts
git commit -m "feat(cli): add model/effort override flags to task update"
```

---

### Task 8: CLI `task add` に4フラグを追加する

**Files:**
- Modify: `src/cli/commands/task/add-helpers.ts:1-12,95-109`
- Modify: `src/cli/commands/task/add.ts:16-24,35-54,104-112,160-171`
- Test: `tests/cli/commands/task/add.test.ts`（`describe('--branch option', ...)`（597行〜）の直後に追加）

**Interfaces:**
- Consumes: Task 2 の `CreateTaskInput` の4フィールド、Task 3 の `MODEL_ALIASES` / `isValidModelAlias` / `VALID_EFFORT_LEVELS` / `isValidEffortLevel`
- Produces:
  - `export interface ModelEffortOptions { modelPlanning?: string; modelRun?: string; effortPlanning?: string; effortRun?: string }`
  - `export function validateModelEffortOptions(options: ModelEffortOptions): string | null` — 最初に見つかった不正値のエラーメッセージ、すべて妥当なら `null`
  - `taskToJson` が4フィールドを含む（`task add --json` の `task` / `parent` / `blockedBy` / `blocking` すべてに反映される）

- [ ] **Step 1: 失敗するテストを書く**

`tests/cli/commands/task/add.test.ts` の `describe('--branch option', ...)` ブロックの閉じ括弧の直後に追加する。

```typescript
  describe('model/effort override options', () => {
    it('should have the four override options registered', () => {
      const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
      const addCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'add');
      const optionNames = addCommand?.options.map((o) => o.long) ?? [];
      expect(optionNames).toContain('--model-planning');
      expect(optionNames).toContain('--model-run');
      expect(optionNames).toContain('--effort-planning');
      expect(optionNames).toContain('--effort-run');
    });

    it('should create a task with all four overrides', async () => {
      const { logs } = await runCommand(program, [
        'task',
        'add',
        'Override Task',
        '--model-planning',
        'opus',
        '--model-run',
        'sonnet',
        '--effort-planning',
        'low',
        '--effort-run',
        'xhigh',
        '--json',
      ]);

      const output = JSON.parse(logs[0]);
      expect(output.task.model_planning).toBe('opus');
      expect(output.task.model_run).toBe('sonnet');
      expect(output.task.effort_planning).toBe('low');
      expect(output.task.effort_run).toBe('xhigh');
    });

    it('should persist the overrides in the database', async () => {
      await runCommand(program, ['task', 'add', 'Persisted Overrides', '--model-run', 'haiku']);

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks[0].model_run).toBe('haiku');
    });

    it('should default the overrides to null when the flags are omitted', async () => {
      await runCommand(program, ['task', 'add', 'No Overrides']);

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks[0].model_planning).toBeNull();
      expect(tasks[0].model_run).toBeNull();
      expect(tasks[0].effort_planning).toBeNull();
      expect(tasks[0].effort_run).toBeNull();
    });

    it('should reject an invalid model alias and not create the task', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Bad Model',
        '--model-run',
        'gpt-5',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('--model-run');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject an invalid effort level and not create the task', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Bad Effort',
        '--effort-planning',
        'ultra',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('--effort-planning');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/add.test.ts -t 'model/effort override options'`
Expected: FAIL — `expect(optionNames).toContain('--model-planning')` が失敗

- [ ] **Step 3: `add-helpers.ts` を実装する**

import 文（6-12行）に追加する。

```typescript
import {
  MODEL_ALIASES,
  isValidModelAlias,
  VALID_EFFORT_LEVELS,
  isValidEffortLevel,
} from '../../../board/claudePromptBuilder';
```

`taskToJson`（95-109行）の直前に追加する。

```typescript
export interface ModelEffortOptions {
  modelPlanning?: string;
  modelRun?: string;
  effortPlanning?: string;
  effortRun?: string;
}

/**
 * Validate the four task-level model/effort override flags.
 * @returns Error message for the first invalid value, or null when all are valid
 */
export function validateModelEffortOptions(options: ModelEffortOptions): string | null {
  const checks: Array<[string, string | undefined, (value: string) => boolean, readonly string[]]> = [
    ['--model-planning', options.modelPlanning, isValidModelAlias, MODEL_ALIASES],
    ['--model-run', options.modelRun, isValidModelAlias, MODEL_ALIASES],
    ['--effort-planning', options.effortPlanning, isValidEffortLevel, VALID_EFFORT_LEVELS],
    ['--effort-run', options.effortRun, isValidEffortLevel, VALID_EFFORT_LEVELS],
  ];
  for (const [flag, value, isValid, validValues] of checks) {
    if (value === undefined) continue;
    if (!isValid(value)) {
      return `Invalid ${flag} value: ${value}. Valid values: ${validValues.join(', ')}`;
    }
  }
  return null;
}
```

`taskToJson`（95-109行）を置き換える。

```typescript
function taskToJson(task: Task): object {
  return {
    id: task.id,
    title: task.title,
    body: task.body,
    author: task.author,
    assignees: task.assignees,
    status: task.status,
    priority: task.priority,
    parent_id: task.parent_id,
    branch: task.branch,
    model_planning: task.model_planning,
    model_run: task.model_run,
    effort_planning: task.effort_planning,
    effort_run: task.effort_run,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}
```

- [ ] **Step 4: `add.ts` を実装する**

`./add-helpers` からの import（16-24行）に `validateModelEffortOptions` を加える。

```typescript
import {
  readBodyFromFile,
  parseBlockIds,
  resolveTagIds,
  addBlockRelationships,
  fetchRelatedTasks,
  buildTaskJsonData,
  printTaskCreated,
  validateModelEffortOptions,
} from './add-helpers';
import { MODEL_ALIASES, VALID_EFFORT_LEVELS } from '../../../board/claudePromptBuilder';
```

`.option('--branch ...')`（49行）の直後に4行追加する。

```typescript
    .option('--branch <branch>', 'Git branch name for the task')
    .option('--model-planning <alias>', `Claude model for planning runs (${MODEL_ALIASES.join(', ')})`)
    .option('--model-run <alias>', `Claude model for implementation runs (${MODEL_ALIASES.join(', ')})`)
    .option('--effort-planning <level>', `Reasoning effort for planning runs (${VALID_EFFORT_LEVELS.join(', ')})`)
    .option('--effort-run <level>', `Reasoning effort for implementation runs (${VALID_EFFORT_LEVELS.join(', ')})`)
```

priority のバリデーション（104-111行）の直後に追加する。

```typescript
        const modelEffortError = validateModelEffortOptions(options);
        if (modelEffortError) {
          formatter.error(modelEffortError, () => {
            console.error(chalk.red(`\nError: ${modelEffortError}\n`));
          });
          process.exit(1);
          return;
        }
```

`taskService.createTask` の呼び出し（161-171行）の `branch:` の直後に4行追加する。

```typescript
              branch: options.branch ?? null,
              model_planning: options.modelPlanning ?? null,
              model_run: options.modelRun ?? null,
              effort_planning: options.effortPlanning ?? null,
              effort_run: options.effortRun ?? null,
              tagIds,
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/add.test.ts`
Expected: PASS（既存テストを含めすべて）

- [ ] **Step 6: コミット**

```bash
git add src/cli/commands/task/add.ts src/cli/commands/task/add-helpers.ts tests/cli/commands/task/add.test.ts
git commit -m "feat(cli): add model/effort override flags to task add"
```

---

### Task 9: CLI `task get` / `task copy` に4フィールドを露出し CHANGELOG を更新する

**Files:**
- Modify: `src/cli/commands/task/get.ts:18-31,49-64,192-215`
- Modify: `src/cli/commands/task/copy.ts:60-92`
- Modify: `CHANGELOG.md:8`（`## [Unreleased]` 見出し直下）
- Modify: `CHANGELOG.ja.md:8`（同上）
- Test: `tests/cli/commands/task/get.test.ts`（`describe('branch field', ...)`（450行〜）の直後に追加）
- Test: `tests/cli/commands/task/copy.test.ts`（`describe('branch field', ...)`（218行〜）の直後に追加）

**Interfaces:**
- Consumes: Task 2 の `Task` の4フィールド
- Produces: `task get --json` の `task` / `parent` / `children` / `blockedBy` / `blocking` すべてに4フィールドが載る。`task get`（プレーンテキスト）は値が設定されているときのみ `Model (planning):` / `Model (run):` / `Effort (planning):` / `Effort (run):` を出力する。`task copy` は4フィールドをコピーし `--json` に含める

- [ ] **Step 1: 失敗するテストを書く（get）**

`tests/cli/commands/task/get.test.ts` の `describe('branch field', ...)` ブロックの閉じ括弧の直後に追加する。

```typescript
  describe('model/effort override fields', () => {
    it('should include the four overrides in JSON output', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({
        title: 'Override Task',
        model_planning: 'opus',
        model_run: 'sonnet',
        effort_planning: 'low',
        effort_run: 'xhigh',
      });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id), '--json']);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.task.model_planning).toBe('opus');
      expect(parsed.task.model_run).toBe('sonnet');
      expect(parsed.task.effort_planning).toBe('low');
      expect(parsed.task.effort_run).toBe('xhigh');
    });

    it('should include nulls in JSON output when the overrides are not set', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'No Override Task' });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id), '--json']);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.task.model_planning).toBeNull();
      expect(parsed.task.model_run).toBeNull();
      expect(parsed.task.effort_planning).toBeNull();
      expect(parsed.task.effort_run).toBeNull();
    });

    it('should display the overrides in plain text output', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({
        title: 'Override Task',
        model_run: 'sonnet',
        effort_run: 'xhigh',
      });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Model (run):');
      expect(output).toContain('sonnet');
      expect(output).toContain('Effort (run):');
      expect(output).toContain('xhigh');
    });

    it('should not display the overrides in plain text output when not set', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'No Override Task' });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).not.toContain('Model (run):');
      expect(output).not.toContain('Effort (run):');
    });
  });
```

- [ ] **Step 2: 失敗するテストを書く（copy）**

`tests/cli/commands/task/copy.test.ts` の `describe('branch field', ...)` ブロックの閉じ括弧の直後に追加する。

```typescript
  describe('model/effort override fields', () => {
    it('should copy the four overrides from the original task', async () => {
      const original = taskService.createTask({
        title: 'Task with overrides',
        model_planning: 'opus',
        model_run: 'sonnet',
        effort_planning: 'low',
        effort_run: 'xhigh',
      });

      const { logs } = await runCommand(program, ['task', 'copy', String(original.id), '--json']);
      const output = JSON.parse(logs[0]);

      const copied = taskService.getTask(output.task.id);
      expect(copied?.model_planning).toBe('opus');
      expect(copied?.model_run).toBe('sonnet');
      expect(copied?.effort_planning).toBe('low');
      expect(copied?.effort_run).toBe('xhigh');
    });

    it('should include the overrides in JSON output when copying', async () => {
      const original = taskService.createTask({ title: 'Task with overrides', model_run: 'haiku' });

      const { logs } = await runCommand(program, ['task', 'copy', String(original.id), '--json']);
      const output = JSON.parse(logs[0]);

      expect(output.task.model_run).toBe('haiku');
    });

    it('should copy null overrides when the original has none', async () => {
      const original = taskService.createTask({ title: 'Task without overrides' });

      const { logs } = await runCommand(program, ['task', 'copy', String(original.id), '--json']);
      const output = JSON.parse(logs[0]);

      const copied = taskService.getTask(output.task.id);
      expect(copied?.model_planning).toBeNull();
      expect(copied?.model_run).toBeNull();
      expect(copied?.effort_planning).toBeNull();
      expect(copied?.effort_run).toBeNull();
    });
  });
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/get.test.ts tests/cli/commands/task/copy.test.ts -t 'model/effort override fields'`
Expected: FAIL — `expect(parsed.task.model_planning).toBe('opus')` が `undefined` を受け取る

- [ ] **Step 4: `get.ts` を実装する**

`TaskOutputData` interface（18-31行）の `branch: string | null;` の直後に追加する。

```typescript
  branch: string | null;
  model_planning: string | null;
  model_run: string | null;
  effort_planning: string | null;
  effort_run: string | null;
  created_at: string;
  updated_at: string;
```

`formatTaskOutput`（49-64行）の `branch: task.branch,` の直後に追加する。

```typescript
    branch: task.branch,
    model_planning: task.model_planning,
    model_run: task.model_run,
    effort_planning: task.effort_planning,
    effort_run: task.effort_run,
    created_at: task.created_at,
    updated_at: task.updated_at,
```

`renderTaskHeader`（192-215行）の `if (task.branch) { ... }` ブロックの直後に追加する。

```typescript
  if (task.model_planning) {
    console.log(`${chalk.bold('Model (planning):')} ${task.model_planning}`);
  }
  if (task.model_run) {
    console.log(`${chalk.bold('Model (run):')} ${task.model_run}`);
  }
  if (task.effort_planning) {
    console.log(`${chalk.bold('Effort (planning):')} ${task.effort_planning}`);
  }
  if (task.effort_run) {
    console.log(`${chalk.bold('Effort (run):')} ${task.effort_run}`);
  }
```

- [ ] **Step 5: `copy.ts` を実装する**

`taskService.createTask` 呼び出し（60-69行）の `branch:` の直後に追加する。

```typescript
          branch: original.branch ?? undefined,
          model_planning: original.model_planning ?? undefined,
          model_run: original.model_run ?? undefined,
          effort_planning: original.effort_planning ?? undefined,
          effort_run: original.effort_run ?? undefined,
          status: options.status as TaskStatus,
```

JSON 出力（80-92行）の `branch: copied.branch,` の直後に追加する。

```typescript
              branch: copied.branch,
              model_planning: copied.model_planning,
              model_run: copied.model_run,
              effort_planning: copied.effort_planning,
              effort_run: copied.effort_run,
              created_at: copied.created_at,
              updated_at: copied.updated_at,
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/get.test.ts tests/cli/commands/task/copy.test.ts`
Expected: PASS

- [ ] **Step 7: CHANGELOG を更新する**

`CHANGELOG.md` の `## [Unreleased]` セクションは現在空（見出しの直後に `## [3.20.2]` が続く）。`## [Unreleased]` の直下に `### Added` と `### Changed` を新設する。

```markdown
## [Unreleased]

### Added
- Add `--model-planning`, `--model-run`, `--effort-planning`, and `--effort-run` flags to `agkan task add` and `agkan task update` for setting the Claude model alias (`fable`, `opus`, `sonnet`, `haiku`) and reasoning effort (`low`, `medium`, `high`, `xhigh`, `max`) used when running a task. Pass an empty string to `task update` to clear an override. The values are also exposed in `agkan task get --json`, copied by `agkan task copy`, and included in export/import

### Changed
- Move task-level Claude model/effort overrides from `task_metadata` rows (`model:planning` / `model:run` / `effort:planning` / `effort:run`) to dedicated `tasks` table columns. Existing metadata rows are migrated automatically on the next run and then removed
```

`CHANGELOG.ja.md` も同様に、`## [Unreleased]`（現在空）の直下に `### 追加` と `### 変更` を新設する。

```markdown
## [Unreleased]

### 追加
- `agkan task add` / `agkan task update` に `--model-planning`, `--model-run`, `--effort-planning`, `--effort-run` フラグを追加。タスク実行時に使う Claude のモデルエイリアス（`fable`, `opus`, `sonnet`, `haiku`）と reasoning effort（`low`, `medium`, `high`, `xhigh`, `max`）をタスク単位で指定できる。`task update` で空文字を渡すとクリアされる。値は `agkan task get --json` にも出力され、`agkan task copy` でコピーされ、export/import にも含まれる

### 変更
- タスク単位の Claude model/effort override の保存先を、`task_metadata` の行（`model:planning` / `model:run` / `effort:planning` / `effort:run`）から `tasks` テーブルの専用カラムへ変更。既存の metadata は次回起動時のマイグレーションで自動的に移行され、元の行は削除される
```

- [ ] **Step 8: agkan タスク #724 の本文をスコープ縮小後の内容に更新する**

spec の決定事項に従い、#724 はクローズせず、残っている懸念（プロンプト文字列の重複）だけに本文を絞る。model/effort 解決ロジックの重複は Task 4 で解消済みのため本文から落とす。

まず新しい本文を書き出す。

```bash
cat > /tmp/agkan-724-body.md <<'EOF'
親タスク #634（boardRoutes.tsゴッドファイル解消）関連の技術的負債。#721（Claudeプロンプト組み立て・effort/model解決の抽出）の自己レビューで発見。

## 現状（2026-08-30 更新）

model/effort 解決ロジックの重複は、タスク単位 model/effort override のカラム化（docs/superpowers/plans/2026-08-30-task-model-effort-columns.md）で解消済み。`BulkRunService.buildLaunchParams` は `resolveModelAndEffort(this.taskService, taskId, 'run')` を呼ぶ形に統一された。本タスクの残りはプロンプト文字列の重複のみ。

## 残っている対象

- src/board/BulkRunService.ts の `buildLaunchParams` が、src/board/claudePromptBuilder.ts の `buildClaudePrompt` とほぼ同一のプロンプト組み立てを独立して保持している:
  - exitInstruction の文字列リテラル
  - `/agkan-subtask` / `/agkan-subtask-direct` のプロンプト分岐

## 注意点

- BulkRunService は意図的に `branchInstruction` を省略しているため、プロンプト部分の統合は単純な置き換えではなく設計判断が必要
- 副次的に、model alias / effort レベルの許容値配列が src/board/boardRenderer.ts と src/board/client/detailPanelHtml.ts にも重複している。claudePromptBuilder.ts の `MODEL_ALIASES` / `VALID_EFFORT_LEVELS` を正とし、boardRenderer.ts 側だけでも import に置き換えられる可能性がある（client 側は別 tsconfig プロジェクトのため要検討）

## 完了条件

- BulkRunService.ts のプロンプト組み立てが claudePromptBuilder.ts を再利用し、重複コードが解消されている
- 挙動は変更しない（BulkRunService の branchInstruction 省略という既存差異は維持するか、統合方針を明示的に決めた上で反映する）
- 既存テストが全て通る
EOF
```

本文を反映する（`--file` は body フィールド専用のフラグ）。

```bash
agkan task update 724 --file /tmp/agkan-724-body.md
```

確認（status が `backlog` のままでクローズされていないこと、本文が入れ替わっていること）。

```bash
agkan task get 724 --json | head -5
```

Expected: `"status": "backlog"` のまま、本文冒頭に「現状（2026-08-30 更新）」が含まれる

- [ ] **Step 9: 全体検証を実行する**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし（format:check が落ちたら `pnpm run format` を実行してから再実行する）

Run: `pnpm exec vitest run`
Expected: PASS（全テスト。約15分かかる）

- [ ] **Step 10: コミット**

```bash
git add src/cli/commands/task/get.ts src/cli/commands/task/copy.ts tests/cli/commands/task/get.test.ts tests/cli/commands/task/copy.test.ts CHANGELOG.md CHANGELOG.ja.md
git commit -m "feat(cli): expose task model/effort overrides in task get and task copy"
```

---

## 検討した代替案

- **JSON 1カラム（`tasks.run_options`）に4値をまとめる** — 採らなかった。クエリ・ソートができず、既存の平坦カラム規約（`priority` / `branch`）と不整合になるため（spec のアプローチ比較 B）。
- **`task_metadata` を残して二重書き込みする** — 採らなかった。参照元の分岐が残り「単一の正」が失われるため（spec の決定事項）。
- **`BulkRunService` の4番目の引数を削除して既存の `this.ts` を使う** — 採らなかった。spec 設計詳細5が `ms?: MetadataService` を `taskService?: TaskService` へ「置き換える」と明示しており、この optional 引数が、引数3つで構築する既存テスト（`tests/board/bulkRunService.test.ts` の18箇所）に config のみの解決経路を残す唯一の手段であるため。結果として `boardRoutes.ts` で `ts` を2回渡す形になる。
- **`taskModelMetadataKey` / `taskEffortMetadataKey` を export したままマイグレーションから import する** — 採らなかった。`src/db/migrations/*` から `src/board/*` への依存は既存の依存方向と逆で、マイグレーションが将来のアプリコード変更に引きずられるため。キー文字列はマイグレーションファイル内にインライン化した。
- **`task list --json` にも4フィールドを露出する** — 採らなかった。`branch` の既存の除外方針を踏襲する（spec のスコープ外事項）。
