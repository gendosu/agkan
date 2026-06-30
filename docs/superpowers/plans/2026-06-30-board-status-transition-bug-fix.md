# Board Status Transition Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs: (1) RunAll が done に移行しない、(2) planning セッションが途中で強制停止される。

**Architecture:**
Bug 1 は `BulkRunService.launchTask()` の subscribeOutput コールバックにサーバー側の done 自動更新を追加する。Bug 2 は `PtySessionService.getSession()` を新設し、`/api/internal/hooks/stop` エンドポイントで planning コマンドを除外する。

**Tech Stack:** TypeScript, Vitest, Hono

## Global Constraints

- コミットメッセージは英語
- テストは `tests/` 以下の既存ファイルに追加
- `pnpm test` でテストを実行する（15分かかる）
- タグは main ブランチに付ける（実装は beta ブランチで行う）

---

## File Map

| ファイル | 変更種別 | 変更内容 |
|---|---|---|
| `src/board/BulkRunService.ts` | Modify | subscribeOutput に exitCode=0 時の done 更新を追加 |
| `src/terminal/PtySessionService.ts` | Modify | `getSession()` メソッドを追加 |
| `src/board/boardRoutes.ts` | Modify | `HookRouteDeps` に `getSession` を追加、hook-stop で planning をスキップ |
| `tests/board/bulkRunService.test.ts` | Modify | done 自動更新のテストを追加 |
| `tests/board/boardRoutes.test.ts` | Modify | planning スキップのテストを追加 |

---

### Task 1: BulkRun 完了時に done へ自動更新

**Files:**
- Modify: `src/board/BulkRunService.ts:160-190`
- Test: `tests/board/bulkRunService.test.ts`

**Interfaces:**
- Consumes: `this.ts.updateTask(taskId, { status: 'done' })` — TaskService の既存メソッド
- Produces: exitCode=0 の場合のみタスクステータスを done に更新する副作用

- [ ] **Step 1: テストを書く**

`tests/board/bulkRunService.test.ts` の末尾、`describe('BulkRunService - Run all loop continuity regression', ...)` ブロックの**前**（`describe('BulkRunService task selection', ...)` の後）に新しい describe ブロックを追加する：

```typescript
describe('BulkRunService - status update on completion', () => {
  it('updates task status to done when process exits with exitCode 0', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    const startProcess = vi.fn().mockImplementation(async (taskId: number) => {
      ts.updateTask(taskId, { status: 'in_progress' });
    });

    let outputCallback: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      outputCallback = cb;
      return () => {};
    });

    const pty = buildMockPty({ startProcess, subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');
    expect(ts.getTask(task.id)?.status).toBe('in_progress');

    outputCallback?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();

    expect(ts.getTask(task.id)?.status).toBe('done');
  });

  it('does not update task status to done when process exits with non-zero exitCode', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    const startProcess = vi.fn().mockImplementation(async (taskId: number) => {
      ts.updateTask(taskId, { status: 'in_progress' });
    });

    let outputCallback: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      outputCallback = cb;
      return () => {};
    });

    const pty = buildMockPty({ startProcess, subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');
    expect(ts.getTask(task.id)?.status).toBe('in_progress');

    outputCallback?.({ kind: 'done', exitCode: 129 });
    await Promise.resolve();

    // Status must remain in_progress on non-zero exit
    expect(ts.getTask(task.id)?.status).toBe('in_progress');
  });

  it('does not update task status to done when subscribeOutput fires error', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    const startProcess = vi.fn().mockImplementation(async (taskId: number) => {
      ts.updateTask(taskId, { status: 'in_progress' });
    });

    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      cb({ kind: 'error', message: 'No session found' });
      return () => {};
    });

    const pty = buildMockPty({ startProcess, subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(ts.getTask(task.id)?.status).toBe('in_progress');
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認**

```bash
pnpm test tests/board/bulkRunService.test.ts
```

Expected: "updates task status to done when process exits with exitCode 0" が FAIL

- [ ] **Step 3: BulkRunService.ts を修正**

`src/board/BulkRunService.ts:183-189` の subscribeOutput コールバックを修正する：

```typescript
// 変更前
let unsubscribe: (() => void) | undefined;
unsubscribe = this.claudeProcess.subscribeOutput(taskId, (evt) => {
  if (evt.kind === 'done' || evt.kind === 'error') {
    unsubscribe?.();
    advance();
  }
});

// 変更後
let unsubscribe: (() => void) | undefined;
unsubscribe = this.claudeProcess.subscribeOutput(taskId, (evt) => {
  if (evt.kind === 'done' && evt.exitCode === 0) {
    this.ts.updateTask(taskId, { status: 'done' });
  }
  if (evt.kind === 'done' || evt.kind === 'error') {
    unsubscribe?.();
    advance();
  }
});
```

- [ ] **Step 4: テストを実行して通ることを確認**

```bash
pnpm test tests/board/bulkRunService.test.ts
```

Expected: すべてのテストが PASS

- [ ] **Step 5: コミット**

```bash
git add src/board/BulkRunService.ts tests/board/bulkRunService.test.ts
git commit -m "fix(board): auto-update task status to done when BulkRun completes with exitCode 0"
```

---

### Task 2: planning セッションを hook-stop で停止しない

**Files:**
- Modify: `src/terminal/PtySessionService.ts` — `getSession()` メソッド追加
- Modify: `src/board/boardRoutes.ts:712-715, 732-746` — `HookRouteDeps` 拡張 + planning チェック
- Test: `tests/board/boardRoutes.test.ts`

**Interfaces:**
- Produces:
  - `PtySessionService.getSession(taskId: number): { command: string } | undefined`
  - `HookRouteDeps.ptySessionService.getSession?: (taskId: number) => { command: string } | undefined`

- [ ] **Step 1: テストを書く**

`tests/board/boardRoutes.test.ts` の hook receiver routes describe ブロック内、既存テストの末尾（`it('GET /api/board/stream ...` の前）に追加する：

```typescript
it('POST /api/internal/hooks/stop does not stop planning sessions', async () => {
  const ptyStop = vi.fn().mockReturnValue(true);
  const app = new Hono();
  const attention = new AttentionStateService();
  const ptySessionService = {
    stopProcess: ptyStop,
    getSession: vi.fn().mockReturnValue({ command: 'planning' }),
  };
  registerBoardRoutes(app, { ...buildServices(), ptySessionService: undefined });
  registerHookRoutes(app, { attentionStateService: attention, ptySessionService });

  const res = await app.fetch(
    new Request('http://localhost/api/internal/hooks/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hook-token': getHookToken() },
      body: JSON.stringify({ taskId: 42, reason: 'complete' }),
    })
  );
  expect(res.status).toBe(200);
  expect(ptyStop).not.toHaveBeenCalled();
});

it('POST /api/internal/hooks/stop stops non-planning sessions', async () => {
  const ptyStop = vi.fn().mockReturnValue(true);
  const app = new Hono();
  const attention = new AttentionStateService();
  const ptySessionService = {
    stopProcess: ptyStop,
    getSession: vi.fn().mockReturnValue({ command: 'run' }),
  };
  registerBoardRoutes(app, { ...buildServices(), ptySessionService: undefined });
  registerHookRoutes(app, { attentionStateService: attention, ptySessionService });

  const res = await app.fetch(
    new Request('http://localhost/api/internal/hooks/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hook-token': getHookToken() },
      body: JSON.stringify({ taskId: 42, reason: 'complete' }),
    })
  );
  expect(res.status).toBe(200);
  expect(ptyStop).toHaveBeenCalledWith(42);
});
```

- [ ] **Step 2: テストを実行して失敗することを確認**

```bash
pnpm test tests/board/boardRoutes.test.ts
```

Expected: "does not stop planning sessions" が FAIL

- [ ] **Step 3: PtySessionService に getSession() を追加**

`src/terminal/PtySessionService.ts` の `listRunningTasks()` メソッド（行361）の直前に追加する：

```typescript
getSession(taskId: number): { command: string } | undefined {
  const info = this.sessions.get(taskId);
  return info ? { command: info.command } : undefined;
}
```

- [ ] **Step 4: boardRoutes.ts の HookRouteDeps を拡張する**

`src/board/boardRoutes.ts:714` の `HookRouteDeps` インターフェースを変更する：

```typescript
// 変更前
export interface HookRouteDeps {
  attentionStateService: AttentionStateService;
  ptySessionService: { stopProcess: (taskId: number) => boolean };
}

// 変更後
export interface HookRouteDeps {
  attentionStateService: AttentionStateService;
  ptySessionService: {
    stopProcess: (taskId: number) => boolean;
    getSession?: (taskId: number) => { command: string } | undefined;
  };
}
```

- [ ] **Step 5: hook-stop エンドポイントに planning チェックを追加する**

`src/board/boardRoutes.ts:742-744` を変更する：

```typescript
// 変更前
if (body.reason === 'complete') {
  deps.ptySessionService.stopProcess(id);
}

// 変更後
if (body.reason === 'complete') {
  const session = deps.ptySessionService.getSession?.(id);
  if (session?.command !== 'planning') {
    deps.ptySessionService.stopProcess(id);
  }
}
```

- [ ] **Step 6: テストを実行して通ることを確認**

```bash
pnpm test tests/board/boardRoutes.test.ts
```

Expected: すべてのテストが PASS（既存の "calls ptySessionService.stopProcess" テストも引き続き PASS すること）

- [ ] **Step 7: コミット**

```bash
git add src/terminal/PtySessionService.ts src/board/boardRoutes.ts tests/board/boardRoutes.test.ts
git commit -m "fix(board): skip hook-stop for planning sessions to prevent premature termination"
```
