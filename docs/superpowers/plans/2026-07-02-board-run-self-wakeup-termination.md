# Board run セッションの自己再開ハング解消（status基準の終了判定）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Board run（PTY 内の Claude Code）が実装完了後も `/loop` 自己再開で終了しない問題を、Stop フックが「タスクが run の目標statusへ到達した」ことを検出して確実にセッションを終了させることで解消する。

**Architecture:** `command → 目標status` の純粋写像を共有ヘルパ化し、PTY 起動時に `BOARD_TARGET_STATUS` env を注入する。board に token 認証付きの内部 status 取得エンドポイントを新設する。Stop フック（`hook-stop.mjs`）は、目標status到達を検出したら背景ジョブ/ScheduleWakeup ガードを上書きして `complete` を POST する。対話ガード（AskUserQuestion/Monitor）と構造ガード（stop_hook_active/サブエージェント）は尊重する。

**Tech Stack:** TypeScript, Node.js (ESM `.mjs` hook), Hono, node-pty, vitest。

## Global Constraints

- 到達判定ルール: `status === targetStatus || status === 'done' || status === 'closed'`。
- 目標status写像: `pr → 'review'`、`run`/`direct` → `'done'`、`planning → null`（対象外）。
- `TaskStatus` 型: `'icebox' | 'backlog' | 'ready' | 'in_progress' | 'review' | 'done' | 'closed'`（`src/models/Task.ts:16`、`src/models/index.ts` から re-export）。
- 内部フックエンドポイントの認証は `x-hook-token` ヘッダを `verifyHookToken` で検証（既存 `/api/internal/hooks/stop` と同一）。
- `BOARD_TARGET_STATUS` 未設定時（planning / 旧環境）はフックの status 判定を完全にスキップ＝現状維持（後方互換）。
- コミットメッセージは英語。テストは vitest（`pnpm test` はフルスイートで約15分。個別テストは対象ファイル指定で実行）。
- 作業ブランチ: `feat/665-board-run-self-wakeup-termination`（agkan #665）。
- 設計仕様: `docs/superpowers/specs/2026-07-02-board-run-self-wakeup-termination-design.md`。

---

## Task 0: 作業ブランチ作成

**Files:**
- なし（git 操作のみ）

- [ ] **Step 1: ブランチを作成して切り替える**

Run:
```bash
git checkout main && git pull --ff-only && git checkout -b feat/665-board-run-self-wakeup-termination
```
Expected: `Switched to a new branch 'feat/665-board-run-self-wakeup-termination'`

（注: main が最新でない/リモート未設定の場合は `git checkout -b feat/665-board-run-self-wakeup-termination` のみで可。）

---

## Task 1: `runTargetStatus` 共有ヘルパ

`command → 目標status` の写像を単一の純粋関数に集約する。

**Files:**
- Create: `src/utils/runTargetStatus.ts`
- Test: `tests/utils/runTargetStatus.test.ts`

**Interfaces:**
- Produces: `runTargetStatus(command: string): TaskStatus | null`

- [ ] **Step 1: 失敗するテストを書く**

Create `tests/utils/runTargetStatus.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runTargetStatus } from '../../src/utils/runTargetStatus';

describe('runTargetStatus', () => {
  it('returns review for pr', () => {
    expect(runTargetStatus('pr')).toBe('review');
  });
  it('returns done for run', () => {
    expect(runTargetStatus('run')).toBe('done');
  });
  it('returns done for direct', () => {
    expect(runTargetStatus('direct')).toBe('done');
  });
  it('returns null for planning', () => {
    expect(runTargetStatus('planning')).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run tests/utils/runTargetStatus.test.ts`
Expected: FAIL（`Cannot find module '../../src/utils/runTargetStatus'`）

- [ ] **Step 3: 最小実装を書く**

Create `src/utils/runTargetStatus.ts`:
```ts
import type { TaskStatus } from '../models';

/**
 * Board run の command から run 完了の目標status を返す。
 * - pr        → 'review'
 * - run/direct → 'done'
 * - planning  → null（目標statusを持たない = status基準の終了判定対象外）
 */
export function runTargetStatus(command: string): TaskStatus | null {
  if (command === 'planning') return null;
  if (command === 'pr') return 'review';
  return 'done';
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run tests/utils/runTargetStatus.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add src/utils/runTargetStatus.ts tests/utils/runTargetStatus.test.ts
git commit -m "feat(board): add runTargetStatus helper mapping run command to target status"
```

---

## Task 2: `buildHookEnv` 抽出と `BOARD_TARGET_STATUS` 注入

PTY へ渡す board フック env の構築を純粋関数へ抽出し、目標statusを持つ command のとき `BOARD_TARGET_STATUS` を追加する。

**Files:**
- Create: `src/terminal/buildHookEnv.ts`
- Modify: `src/terminal/PtySessionService.ts:7`（`getHookToken` import 削除）, `src/terminal/PtySessionService.ts:137-142`（`buildHookEnv` 呼び出しに置換）
- Test: `tests/terminal/buildHookEnv.test.ts`

**Interfaces:**
- Consumes: `runTargetStatus` (Task 1), `getHookToken` from `src/utils/hookToken`
- Produces: `buildHookEnv(taskId: number, boardApiUrl: string | null, command: string): Record<string, string>`

- [ ] **Step 1: 失敗するテストを書く**

Create `tests/terminal/buildHookEnv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildHookEnv } from '../../src/terminal/buildHookEnv';

describe('buildHookEnv', () => {
  it('returns empty object when boardApiUrl is null', () => {
    expect(buildHookEnv(5, null, 'run')).toEqual({});
  });

  it('returns empty object when boardApiUrl is empty string', () => {
    expect(buildHookEnv(5, '', 'run')).toEqual({});
  });

  it('injects BOARD_TASK_ID / BOARD_API_URL / BOARD_HOOK_TOKEN and BOARD_TARGET_STATUS=review for pr', () => {
    const env = buildHookEnv(5, 'http://127.0.0.1:9999', 'pr');
    expect(env.BOARD_TASK_ID).toBe('5');
    expect(env.BOARD_API_URL).toBe('http://127.0.0.1:9999');
    expect(env.BOARD_HOOK_TOKEN).toEqual(expect.any(String));
    expect(env.BOARD_TARGET_STATUS).toBe('review');
  });

  it('injects BOARD_TARGET_STATUS=done for run', () => {
    expect(buildHookEnv(5, 'http://127.0.0.1:9999', 'run').BOARD_TARGET_STATUS).toBe('done');
  });

  it('injects BOARD_TARGET_STATUS=done for direct', () => {
    expect(buildHookEnv(5, 'http://127.0.0.1:9999', 'direct').BOARD_TARGET_STATUS).toBe('done');
  });

  it('omits BOARD_TARGET_STATUS for planning but keeps the other vars', () => {
    const env = buildHookEnv(5, 'http://127.0.0.1:9999', 'planning');
    expect(env.BOARD_TARGET_STATUS).toBeUndefined();
    expect(env.BOARD_TASK_ID).toBe('5');
    expect(env.BOARD_API_URL).toBe('http://127.0.0.1:9999');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run tests/terminal/buildHookEnv.test.ts`
Expected: FAIL（`Cannot find module '../../src/terminal/buildHookEnv'`）

- [ ] **Step 3: 最小実装を書く**

Create `src/terminal/buildHookEnv.ts`:
```ts
import { getHookToken } from '../utils/hookToken';
import { runTargetStatus } from '../utils/runTargetStatus';

/**
 * Board hook 用の環境変数を構築する。
 * - boardApiUrl が未設定(null/'')ならフック無効 = 空オブジェクト。
 * - command が目標statusを持つ(pr/run/direct)場合は BOARD_TARGET_STATUS を付与する。
 *   planning は目標statusを持たないため付与しない。
 */
export function buildHookEnv(taskId: number, boardApiUrl: string | null, command: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (boardApiUrl === null || boardApiUrl === '') return env;
  env.BOARD_TASK_ID = String(taskId);
  env.BOARD_API_URL = boardApiUrl;
  env.BOARD_HOOK_TOKEN = getHookToken();
  const targetStatus = runTargetStatus(command);
  if (targetStatus) env.BOARD_TARGET_STATUS = targetStatus;
  return env;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run tests/terminal/buildHookEnv.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: `PtySessionService` を `buildHookEnv` 利用に置換**

Edit `src/terminal/PtySessionService.ts`。

行 7 の import を削除（`getHookToken` は本ファイル内で 141 行のみの使用のため、置換後は不要）:
```ts
import { getHookToken } from '../utils/hookToken';
```
→ 削除。代わりにファイル上部の import 群へ追加:
```ts
import { buildHookEnv } from './buildHookEnv';
```

行 137-142 を置換:
```ts
    const hookEnv: Record<string, string> = {};
    if (this.boardApiUrl !== null && this.boardApiUrl !== '') {
      hookEnv.BOARD_TASK_ID = String(taskId);
      hookEnv.BOARD_API_URL = this.boardApiUrl;
      hookEnv.BOARD_HOOK_TOKEN = getHookToken();
    }
```
→
```ts
    const hookEnv = buildHookEnv(taskId, this.boardApiUrl, command);
```

- [ ] **Step 6: 型チェック・lint・関連テストを確認**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/terminal/buildHookEnv.test.ts tests/board/claudeRoutes.test.ts`
Expected: 型エラーなし、PASS。
（`getHookToken` の未使用 import が残っていれば tsc/lint が検出するので必ず削除する。）

- [ ] **Step 7: コミット**

```bash
git add src/terminal/buildHookEnv.ts src/terminal/PtySessionService.ts tests/terminal/buildHookEnv.test.ts
git commit -m "feat(board): inject BOARD_TARGET_STATUS into run PTY env via buildHookEnv"
```

---

## Task 3: 内部 status 取得エンドポイント `GET /api/internal/tasks/:id/status`

Stop フックが現在の task status を取得するための token 認証付き内部エンドポイントを追加する。

**Files:**
- Modify: `src/board/boardRoutes.ts:707-710`（`HookRouteDeps` に `taskService` 追加）, `src/board/boardRoutes.ts:712-742`（`registerHookRoutes` に GET ルート追加）, `src/board/boardRoutes.ts:590`（`runTargetStatus` 利用に統一）
- Modify: `src/board/server.ts:85`（`registerHookRoutes` へ `taskService` を配線）
- Test: `tests/board/boardRoutes.test.ts`（`hook receiver routes` describe 内、`buildHookApp` ヘルパ拡張＋新規テスト、及び 1341-1347 の単体テスト修正）

**Interfaces:**
- Consumes: `runTargetStatus` (Task 1), `TaskService.getTask(id): Task | null`, `verifyHookToken`
- Produces: HTTP `GET /api/internal/tasks/:id/status` → `200 { status }` / `401` / `400` / `404`
- Produces: `HookRouteDeps.taskService: Pick<TaskService, 'getTask'>`

- [ ] **Step 1: 失敗するテストを書く**

Edit `tests/board/boardRoutes.test.ts`。まず import に `runTargetStatus` は不要。`hook receiver routes` describe（1240 行付近）の `buildHookApp` を、`taskService` を差し込めるよう変更する。

`buildHookApp`（現 1241-1251）を置換:
```ts
  function buildHookApp(opts?: {
    attentionStateService?: AttentionStateService;
    ptyStopProcess?: (taskId: number) => boolean;
    taskService?: BoardServices['ts'];
  }): Hono {
    const app = new Hono();
    const attention = opts?.attentionStateService ?? new AttentionStateService();
    const ptySessionService = { stopProcess: opts?.ptyStopProcess ?? vi.fn().mockReturnValue(true) };
    const services = buildServices();
    registerBoardRoutes(app, { ...services, attentionStateService: attention });
    registerHookRoutes(app, {
      attentionStateService: attention,
      ptySessionService,
      taskService: opts?.taskService ?? services.ts,
    });
    return app;
  }
```

同 describe 内に新規テストを追加:
```ts
  it('GET /api/internal/tasks/:id/status returns status with valid token', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Status Task', status: 'review' });
    const app = buildHookApp({ taskService: services.ts });
    const res = await app.fetch(
      new Request(`http://localhost/api/internal/tasks/${task.id}/status`, {
        method: 'GET',
        headers: { 'x-hook-token': getHookToken() },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'review' });
  });

  it('GET /api/internal/tasks/:id/status returns 401 without token', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Status Task', status: 'review' });
    const app = buildHookApp({ taskService: services.ts });
    const res = await app.fetch(
      new Request(`http://localhost/api/internal/tasks/${task.id}/status`, { method: 'GET' })
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/internal/tasks/:id/status returns 400 for invalid id', async () => {
    const app = buildHookApp();
    const res = await app.fetch(
      new Request('http://localhost/api/internal/tasks/notanumber/status', {
        method: 'GET',
        headers: { 'x-hook-token': getHookToken() },
      })
    );
    expect(res.status).toBe(400);
  });

  it('GET /api/internal/tasks/:id/status returns 404 when task not found', async () => {
    const app = buildHookApp();
    const res = await app.fetch(
      new Request('http://localhost/api/internal/tasks/999999/status', {
        method: 'GET',
        headers: { 'x-hook-token': getHookToken() },
      })
    );
    expect(res.status).toBe(404);
  });
```

`buildHookApp` の型変更に伴い、1334-1363 の単体テスト（`registerHookRoutes(app, { attentionStateService: attention, ptySessionService })`）へ `taskService` を追加する（1347 行付近）:
```ts
    registerHookRoutes(app, { attentionStateService: attention, ptySessionService, taskService: services.ts });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run tests/board/boardRoutes.test.ts -t "internal/tasks"`
Expected: FAIL（ルート未実装のため 404、及び `HookRouteDeps` に `taskService` が無く型エラー）

- [ ] **Step 3: `HookRouteDeps` とエンドポイントを実装**

Edit `src/board/boardRoutes.ts`。

`HookRouteDeps`（707-710）を置換:
```ts
export interface HookRouteDeps {
  attentionStateService: AttentionStateService;
  ptySessionService: { stopProcess: (taskId: number) => boolean };
  taskService: Pick<TaskService, 'getTask'>;
}
```

`registerHookRoutes`（712）内、`POST /api/internal/hooks/stop` の直後（741 の `}` の後、742 の関数末尾 `}` の前）へ GET ルートを追加:
```ts
  app.get('/api/internal/tasks/:id/status', (c) => {
    const token = c.req.header('x-hook-token');
    if (!verifyHookToken(token)) {
      return c.body('', 401);
    }
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }
    const task = deps.taskService.getTask(id);
    if (!task) {
      return c.json({ error: 'task not found' }, 404);
    }
    return c.json({ status: task.status });
  });
```

- [ ] **Step 4: `server.ts` の配線を更新**

Edit `src/board/server.ts:85`:
```ts
  registerHookRoutes(app, { attentionStateService, ptySessionService: ptyService });
```
→
```ts
  registerHookRoutes(app, { attentionStateService, ptySessionService: ptyService, taskService: services.ts });
```

- [ ] **Step 5: `boardRoutes.ts:590` を `runTargetStatus` 利用へ統一（DRY）**

`src/board/boardRoutes.ts` 上部の import 群へ追加:
```ts
import { runTargetStatus } from '../utils/runTargetStatus';
```
行 590 を置換:
```ts
      const targetStatus = command === 'pr' ? 'review' : 'done';
```
→
```ts
      const targetStatus = runTargetStatus(command) ?? 'done';
```
（この分岐は `command ∈ {pr, run}` のみ到達するため `?? 'done'` は planning 対策の保険。挙動は不変。）

- [ ] **Step 6: テストが通ることを確認**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/board/boardRoutes.test.ts`
Expected: 型エラーなし、PASS（既存の hook receiver routes ＋ 新規 4 テスト含む）

- [ ] **Step 7: コミット**

```bash
git add src/board/boardRoutes.ts src/board/server.ts tests/board/boardRoutes.test.ts
git commit -m "feat(board): add token-authed GET /api/internal/tasks/:id/status for hooks"
```

---

## Task 4: `hook-stop.mjs` に status 到達判定を追加（順序リファクタ込み）

Stop フックに、目標status到達時は背景ジョブ/ScheduleWakeup ガードを上書きして `complete` を送るロジックを追加する。サブエージェント判定を前方へ移し、`session` ファイルの unlink は POST 直前のみ行うよう分離する。

**Files:**
- Modify: `src/hooks/hook-stop.mjs:88-167`（`main()` の順序リファクタ＋ status 判定追加、及びヘルパ関数追加）
- Test: `tests/hooks/hook-stop.test.ts`（`makeServer` 拡張＋新規テスト群）

**Interfaces:**
- Consumes: `GET /api/internal/tasks/:id/status`（Task 3）, env `BOARD_TARGET_STATUS`（Task 2）
- 到達判定: `status === targetStatus || status === 'done' || status === 'closed'`

- [ ] **Step 1: `makeServer` を GET status 対応に拡張（テスト基盤）**

Edit `tests/hooks/hook-stop.test.ts`。`makeServer`（13-32）を置換:
```ts
function makeServer(): Promise<{
  server: Server;
  port: number;
  captured: Capture[];
  setStatus: (s: string | null) => void;
  setStatusHttpCode: (code: number) => void;
}> {
  return new Promise((resolveFn) => {
    const captured: Capture[] = [];
    let currentStatus: string | null = null;
    let statusHttpCode = 200;
    const server = createServer((req, res) => {
      if (req.method === 'GET' && (req.url ?? '').includes('/status')) {
        res.statusCode = statusHttpCode;
        res.end(JSON.stringify(statusHttpCode === 200 ? { status: currentStatus } : { error: 'err' }));
        return;
      }
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        captured.push({ url: req.url, body: data ? JSON.parse(data) : null });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolveFn({
          server,
          port: addr.port,
          captured,
          setStatus: (s) => {
            currentStatus = s;
          },
          setStatusHttpCode: (code) => {
            statusHttpCode = code;
          },
        });
      }
    });
  });
}
```

`beforeEach`（55-57）を、毎テストで status モックをリセットするよう置換:
```ts
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hook-stop-'));
    svr.setStatus(null);
    svr.setStatusHttpCode(200);
  });
```

- [ ] **Step 2: 失敗する新規テストを追加**

`tests/hooks/hook-stop.test.ts` の `describe('hook-stop.mjs', ...)` 末尾（718 の閉じ括弧の直前）に追加:
```ts
  it('posts complete when BOARD_TARGET_STATUS is reached even with an unfinished background job (self-wakeup regression)', async () => {
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bg-sr',
                name: 'Task',
                input: { description: 'self-review', prompt: 'review', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'bg-sr', content: 'Task running in background.' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-sr', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '30',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 30, reason: 'complete' });
  });

  it('posts complete when BOARD_TARGET_STATUS is reached and last tool is ScheduleWakeup with no background job', async () => {
    svr.setStatus('done');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'No further action needed.' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-2', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '31',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'done',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.body).toEqual({ taskId: 31, reason: 'complete' });
  });

  it('treats done/closed as reached when target is review', async () => {
    svr.setStatus('done');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'wake-3', name: 'ScheduleWakeup', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '32',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.at(-1)?.body).toEqual({ taskId: 32, reason: 'complete' });
  });

  it('does NOT post when target is done but status is only review, and a background job is unfinished', async () => {
    const before = svr.captured.length;
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 'bg-x', name: 'Bash', input: { command: 'npm test', run_in_background: true } },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'bg-x', content: 'Command running in background with ID: bk-x' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-4', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '33',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'done',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when BOARD_TARGET_STATUS is set but not reached and last tool is AskUserQuestion', async () => {
    const before = svr.captured.length;
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'ask-x', name: 'AskUserQuestion', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '34',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('falls back to normal flow (no crash) when the status endpoint returns non-200', async () => {
    svr.setStatusHttpCode(500);
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '35',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    // status 判定はスキップされ、通常フロー(最後が Read・背景ジョブ無し)で complete を送る
    expect(svr.captured.at(-1)?.body).toEqual({ taskId: 35, reason: 'complete' });
  });
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm exec vitest run tests/hooks/hook-stop.test.ts`
Expected: 新規テスト（特に「self-wakeup regression」と「target done but review」）が FAIL。既存テストは PASS。

- [ ] **Step 4: `hook-stop.mjs` を実装（順序リファクタ＋ status 判定）**

Edit `src/hooks/hook-stop.mjs`。ファイル末尾の `main()` 直前（86 行 `isBackgroundJobComplete` の後）へヘルパを2つ追加:
```js
// Board から現在の task status を取得し、run の目標statusへ到達済みかを判定する。
// 到達 = current が target と一致、または done/closed（terminal）に達している。
// 取得に失敗（ネットワーク/非200）した場合は false を返し、通常のガード判定へフォールバックする。
async function isTargetStatusReached(apiUrl, token, taskId, targetStatus) {
  try {
    const res = await fetch(`${apiUrl}/api/internal/tasks/${taskId}/status`, {
      method: 'GET',
      headers: { 'x-hook-token': token },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const status = data && data.status;
    return status === targetStatus || status === 'done' || status === 'closed';
  } catch (err) {
    process.stderr.write(`hook-stop: status check failed: ${(err && err.message) || err}\n`);
    return false;
  }
}

// 完了を board へ通知する。メインセッションのセッションファイルを片付けてから POST する。
async function notifyComplete(apiUrl, token, taskId, sessionFile) {
  await fs.unlink(sessionFile).catch(() => {});
  try {
    const res = await fetch(`${apiUrl}/api/internal/hooks/stop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hook-token': token,
      },
      body: JSON.stringify({ taskId, reason: 'complete' }),
    });
    if (!res.ok) {
      process.stderr.write(`hook-stop: API responded ${res.status}\n`);
    }
  } catch (err) {
    process.stderr.write(`hook-stop: ${(err && err.message) || err}\n`);
  }
}
```

`main()`（88-167）の本体を、以下の順序に置換する（env/payload/stop_hook_active/transcript 読込までは現状維持、それ以降を差し替え）:
```ts
  const entries = parseTranscript(jsonl);

  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId)) return;

  // メインセッション判定（サブエージェントの Stop は board へ通知しない）。
  // ここではまだ unlink しない（対話ガード等で return する場合に判別情報を失わないため）。
  // unlink は実際に complete を送る notifyComplete 内でのみ行う。
  const sessionFile = `/tmp/board-main-session-${taskIdRaw}`;
  try {
    const mainSessionId = (await fs.readFile(sessionFile, 'utf-8')).trim();
    if (mainSessionId && mainSessionId !== payload?.session_id) {
      return; // サブエージェントの Stop
    }
  } catch {
    // ファイルが無い場合（hook-session-start 未使用など）はメインとして続行
  }

  const lastTool = findLastToolUse(entries);
  if (lastTool?.name === 'AskUserQuestion') return;
  // Monitor は background プロセスのイベント待ち。complete を送ると待機を中断してしまう。
  if (lastTool?.name === 'Monitor') return;

  // status 基準の終了判定: 目標statusに到達していれば、背景ジョブ/ScheduleWakeup ガードを
  // 上書きして complete を送る（エージェント自身が status を前進させた事実を終了信号とする）。
  const targetStatus = process.env.BOARD_TARGET_STATUS;
  if (targetStatus) {
    const reached = await isTargetStatusReached(apiUrl, token, taskId, targetStatus);
    if (reached) {
      await notifyComplete(apiUrl, token, taskId, sessionFile);
      return;
    }
  }

  // 背景 Bash/Task が過去ターンで起動され未完了なら、complete を送らずセッションを維持する。
  const backgroundJobIds = findBackgroundJobToolUses(entries);
  const hasUnfinishedBackgroundJob = backgroundJobIds.some((id) => !isBackgroundJobComplete(entries, id));
  if (hasUnfinishedBackgroundJob) return;

  await notifyComplete(apiUrl, token, taskId, sessionFile);
```

（注: 置換により、旧 134-166 行のインラインの `taskId` 解決・サブエージェント判定・fetch POST は上記に統合され消える。`findLastToolUse` / `findBackgroundJobToolUses` / `isBackgroundJobComplete` の既存関数はそのまま利用する。）

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm exec vitest run tests/hooks/hook-stop.test.ts`
Expected: PASS（既存 19 ＋ 新規 6）。特に:
- self-wakeup regression（taskId 30）→ complete 送信
- target done but review + bg 未完（taskId 33）→ 送らない
- AskUserQuestion + status 到達（taskId 34）→ 送らない
- status endpoint 500（taskId 35）→ 通常フローで complete

- [ ] **Step 6: 型チェック**

Run: `pnpm exec tsc --noEmit`
Expected: 型エラーなし（`.mjs` は型チェック対象外だが、テスト・他 TS の整合を確認）

- [ ] **Step 7: コミット**

```bash
git add src/hooks/hook-stop.mjs tests/hooks/hook-stop.test.ts
git commit -m "fix(hooks): terminate board run session when task reaches target status"
```

---

## Task 5: 全体テストと仕上げ

**Files:**
- なし（検証・ドキュメント確認）

- [ ] **Step 1: 変更ファイル群の型チェック・lint**

Run: `pnpm exec tsc --noEmit && pnpm run lint`
Expected: エラーなし。

- [ ] **Step 2: 関連テストの一括実行**

Run:
```bash
pnpm exec vitest run tests/utils/runTargetStatus.test.ts tests/terminal/buildHookEnv.test.ts tests/board/boardRoutes.test.ts tests/hooks/hook-stop.test.ts tests/board/claudeRoutes.test.ts
```
Expected: 全 PASS。

- [ ] **Step 3: CHANGELOG 追記（Unreleased / Fixed）**

`CHANGELOG.md` と `CHANGELOG.ja.md` の `## [Unreleased]` の `### Fixed` / `### 修正` へ追記:
- EN: `- Fix Board run sessions not terminating when the agent finishes via /loop self-wakeup, by ending the session once the task reaches its target status (#665)`
- JA: `- Board run で /loop 自己再開により実装完了後もセッションが終了しない問題を、タスクが目標statusへ到達した時点で終了するよう修正 (#665)`

- [ ] **Step 4: コミット**

```bash
git add CHANGELOG.md CHANGELOG.ja.md
git commit -m "docs: add changelog entry for board run session termination fix"
```

- [ ] **Step 5: フルスイート（push フックがテストを実行するため、push は明示指示を得てから）**

Run: `pnpm test`（約15分）
Expected: 全 PASS。完了後、PR 作成・push はユーザーの指示を待つ。

---

## Self-Review

- **Spec coverage:**
  - 触点① env 注入 → Task 2。
  - 触点② 内部 status API → Task 3。
  - 触点③ hook 判定＋順序リファクタ → Task 4。
  - 共有ヘルパ `runTargetStatus` → Task 1（＋ boardRoutes:590 統一を Task 3 Step 5）。
  - 到達判定ルール（target || done || closed）→ Task 4 `isTargetStatusReached` ＋ テスト（taskId 32/33）。
  - 判定順序（対話ガード尊重・背景ジョブ/Wakeup 上書き）→ Task 4 Step 4 ＋ テスト（taskId 30/34）。
  - 後方互換（BOARD_TARGET_STATUS 未設定＝現状維持）→ 既存テスト継続 PASS ＋ Task 4 の env 無しケース。
  - planning 対象外 → `runTargetStatus('planning')===null`（Task 1）＋ buildHookEnv が付与しない（Task 2）。
- **Placeholder scan:** TODO/TBD 無し。全ステップに実コード・実コマンド・期待結果を記載。
- **Type consistency:** `runTargetStatus(command): TaskStatus | null`、`buildHookEnv(taskId, boardApiUrl, command): Record<string,string>`、`HookRouteDeps.taskService: Pick<TaskService,'getTask'>`、hook 側 `isTargetStatusReached(apiUrl, token, taskId, targetStatus)` / `notifyComplete(apiUrl, token, taskId, sessionFile)` — タスク間で名称・引数一致。
