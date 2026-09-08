# modelCatalog の main 先行マージ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `beta` の modelCatalog の仕組みを `main` へ先行投入する。組み込みカタログは Claude の 4 モデルのみとし、Codex を動かすコードは残したままドキュメントからは伏せる。

**Architecture:** `main` から新しいブランチを切り、`beta` から `src/` `tests/` `documentation/` `CHANGELOG*` をファイル単位で取り込む。取り込み直後は `beta` と同じ挙動（Codex 行あり）にしておき、次に既定カタログの Codex 行に依存しているテストを「テスト自身が Codex 行入りカタログを設定する」形へ移してから、既定カタログから Codex 行を落とす。最後にドキュメントと `agkan init` テンプレートから Codex 記述を削り、CHANGELOG を `## [Unreleased]` 節に書き直す。

**Tech Stack:** TypeScript / Node.js / Vitest / Hono / node-pty / js-yaml / pnpm

**Spec:** `docs/superpowers/specs/2026-09-05-model-catalog-main-merge-design.md`

## Global Constraints

- 作業ブランチは `feat/model-catalog-main`。ベースは `main`（= `upstream/main` = `147fdca`）
- コミットメッセージは英語の Conventional Commits。本文末尾に必ず次の 2 行を付ける:
  - `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA`
- 各コミットの時点で `pnpm run type-check` と `pnpm run lint` が通ること
- `CHANGELOG.md` と `CHANGELOG.ja.md` は必ず同時に更新する（`.claude/rules/versioning.md`）。`CHANGELOG.ja.md` の見出しは日本語（`### 追加` / `### 変更`）
- リリース済みの `## [3.21.0] - 2026-09-02` 節には一切手を触れない（タグ `v3.21.0` = `0b3e2c3`）
- `docs/superpowers/` と `README.md` / `README.ja.md` は `main` 側へ持ち込まない
- 個別テストは `npx vitest run <path>` で実行する。全体（`pnpm test`）は約 15 分かかるので Task 6 まで回さない
- `git push` にはテストを走らせる hook が設定されている。push は Task 6 でのみ行う

---

### Task 1: 作業ブランチの作成と beta からの取り込み

**Files:**
- Create: なし（ブランチ作成とファイルコピー）
- Modify: `src/board/routes/claudeRoutes.ts`、`src/terminal/PtySessionService.ts`（診断ログの除去）
- Test: 既存テスト一式

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `feat/model-catalog-main` ブランチ。`src/db/modelCatalog.ts` の `DEFAULT_MODEL_CATALOG` / `resolveModelCatalog` / `findCatalogEntry` / `effortsForDefaultCli` / `validateOverridePair`、`src/db/config.ts` の `AgentTool` / `resolveAgentTool` / `resolveModelSettings` / `buildCodexPermissionArgs` が以降のタスクから使える状態になる

- [ ] **Step 1: ブランチを作る**

```bash
cd /home/gen/products/gendosu/agkan-private
git checkout main
git status --short   # 空であること
git checkout -b feat/model-catalog-main
```

- [ ] **Step 2: beta からファイル単位で取り込む**

```bash
git checkout beta -- src/ tests/ documentation/
git status --short | head -60
```

`docs/`、`README.md` / `README.ja.md`、`CHANGELOG.md` / `CHANGELOG.ja.md` が一覧に出ていないことを目視で確認する。

CHANGELOG を `beta` から取り込まないのは、`beta` 側がリリース済みの `## [3.21.0] - 2026-09-02` 節を書き換えており、取り込むとこのブランチの履歴に「3.21.0 節に触れたコミット」が残るためである（Global Constraints に反する）。Unreleased 節は Task 5 でゼロから書く。

- [ ] **Step 3: 診断ログ 1／3 を戻す（claudeRoutes.ts）**

`src/board/routes/claudeRoutes.ts` の `registerClaudeRoutes` 内、`claudeProcess.subscribeOutput(taskId, (evt) => {` の直後にある次の 5 行を削除する。

```typescript
        if (evt.kind === 'done' || evt.kind === 'error') {
          console.error(
            `[diag][boardRoutes.subscribe] taskId=${taskId} command=${command} evt=${JSON.stringify(evt)} userStopped=${claudeProcess.isUserStopped(taskId)} at=${new Date().toISOString()}`
          );
        }
```

- [ ] **Step 4: 診断ログ 2／3 を戻す（PtySessionService.ts の spawn ログ）**

`src/terminal/PtySessionService.ts` の `throw e;` を含む try/catch の直後にある次の 4 行を削除する。

```typescript
    console.error(
      `[diag][spawn] taskId=${taskId} pid=${ptyProcess.pid} command=${command} bin=${CLAUDE_BIN} args=${JSON.stringify(args)} at=${new Date().toISOString()}`
    );

```

- [ ] **Step 5: 診断ログ 3／3 を戻す（PtySessionService.ts の onExit / done-emit ログ）**

`src/terminal/PtySessionService.ts` の `ptyProcess.onExit` を元の分割代入に戻し、2 つのログを削除する。

変更前:

```typescript
    ptyProcess.onExit(({ exitCode, signal }) => {
      const code = exitCode ?? 0;

      console.error(
        `[diag][onExit] taskId=${taskId} pid=${ptyProcess.pid} rawExitCode=${String(exitCode)} signal=${String(signal)} normalized=${code} exitSubscribers=${info.exitSubscribers.size} at=${new Date().toISOString()}`
      );

      if (info.promptTimer !== null) {
```

変更後:

```typescript
    ptyProcess.onExit(({ exitCode }) => {
      const code = exitCode ?? 0;

      if (info.promptTimer !== null) {
```

さらに同じ関数内の `const doneEvent: OutputEvent = { kind: 'done', exitCode: code };` の直後にある次の 3 行を削除する。

```typescript
      console.error(
        `[diag][done-emit] taskId=${taskId} exitCode=${code} exitSubscribers=${info.exitSubscribers.size} at=${new Date().toISOString()}`
      );
```

- [ ] **Step 6: 診断ログが残っていないことを確認**

Run: `grep -rn "\[diag\]" src/`
Expected: 出力なし

- [ ] **Step 7: ビルドと静的チェック**

Run: `pnpm run build && pnpm run type-check && pnpm run lint`
Expected: すべて成功

- [ ] **Step 8: 取り込んだ範囲のテストを実行**

Run:
```bash
npx vitest run tests/db/ tests/board/ tests/cli/ tests/terminal/
```
Expected: 全件 PASS（`beta` と同じコードなので落ちるテストはない）

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -F - <<'MSG'
feat(config,board,cli): add multi-agent support and the model catalog

Port the modelCatalog mechanism and the multi-agent groundwork it builds
on from the beta branch. A task that selects a model also selects the cli
that runs it; the catalog is the single source of truth for the valid
model/effort pairs across the CLI, the board API, and the board UI.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA
MSG
```

---

### Task 2: 既定カタログの Codex 行に依存するテストを自前カタログへ移す

既定カタログから Codex 行を落とすと 23 件のテストが落ちる（実測値）。うち 13 件は「別 cli の model を選ぶと cli も切り替わる」「effort リストが異なる行どうしのペア検証」という multi-agent の挙動を検証しており、Codex 行そのものが必要である。本タスクではこの 13 件を **テストが自分でカタログを設定する** 形に移し、既定カタログから独立させる。残る 10 件（`tests/db/modelCatalog.test.ts` の 9 件と `tests/cli/commands/config/get.test.ts` の 1 件）は期待値を書き換えるだけなので Task 3 で扱う。このタスクの時点では挙動は一切変わらず、テストは通ったままになる。

`loadConfig()` はテストモードで `<cwd>/.agkan-test.yml` を読む。テストファイルは vitest の fork プールで並列実行されるため、リポジトリ直下の共有 `.agkan-test.yml` に書くと他ファイルと競合する。既存テストはこれを避けるために `process.cwd()` を一時ディレクトリにモックするパターンを使っており（`tests/board/boardRoutes.test.ts:742-758`、`tests/board/claudeRoutes.test.ts:465-479`、`tests/cli/commands/task/add.test.ts:762-777`、`tests/cli/commands/task/update.test.ts:1116-1132`）、本タスクでも同じパターンに揃える。

**Files:**
- Modify: `tests/board/boardRenderer.test.ts:388-421`
- Modify: `tests/board/claudePromptBuilder.test.ts:110-131`
- Modify: `tests/board/boardRoutes.test.ts:403-417`, `:681-696`, `:713-729`
- Modify: `tests/board/claudeRoutes.test.ts:435-452`
- Modify: `tests/board/bulkRunService.test.ts:637-654`
- Modify: `tests/cli/commands/task/add.test.ts:719-735`
- Modify: `tests/cli/commands/task/update.test.ts:1032-1080`

**Interfaces:**
- Consumes: Task 1 の `resolveModelCatalog(config)`（`config.modelCatalog` があれば組み込み既定を丸ごと置き換える）と `ModelCatalogEntry`（`{ cli: AgentTool; model: string; efforts: string[] }`）
- Produces: 上記テストが `DEFAULT_MODEL_CATALOG` の中身に依存しなくなる。Task 3 で既定カタログから Codex 行を消しても落ちない

- [ ] **Step 1: 共通のカタログ定数を決める**

以下を、このタスクで触る各テストファイルの import 群の直後に定義する。内容は Task 1 時点の `DEFAULT_MODEL_CATALOG` と同じである。型注釈は必須で、これがないと `cli` が `string` に推論されて `Config.modelCatalog?: ModelCatalogEntry[]` への代入が型エラーになる。

```typescript
import type { ModelCatalogEntry } from '../../src/db/modelCatalog';

const CATALOG_WITH_CODEX: ModelCatalogEntry[] = [
  { cli: 'claude', model: 'fable', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'claude', model: 'opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'claude', model: 'sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'claude', model: 'haiku', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low', 'medium', 'high', 'xhigh'] },
];
```

import のパスはファイルの深さに合わせる。`tests/cli/commands/task/*.test.ts` では `'../../../../src/db/modelCatalog'` になる。

- [ ] **Step 2: boardRenderer.test.ts を直す**

`describe('renderBoard model catalog wiring', ...)`（`:388`）の `beforeEach` が返す config にカタログを持たせる。

変更前（`:389-391`）:

```typescript
  beforeEach(() => {
    vi.mocked(configModule.loadConfig).mockReturnValue({});
  });
```

変更後:

```typescript
  beforeEach(() => {
    vi.mocked(configModule.loadConfig).mockReturnValue({ modelCatalog: CATALOG_WITH_CODEX });
  });
```

`:417` の `follows the configured agent when seeding the effort options` は `agent: 'codex'` だけを返しているので、こちらにもカタログを足す。

変更前:

```typescript
    vi.mocked(configModule.loadConfig).mockReturnValue({ agent: 'codex' });
```

変更後:

```typescript
    vi.mocked(configModule.loadConfig).mockReturnValue({ agent: 'codex', modelCatalog: CATALOG_WITH_CODEX });
```

- [ ] **Step 3: boardRenderer.test.ts のテストを実行**

Run: `npx vitest run tests/board/boardRenderer.test.ts`
Expected: 全件 PASS

- [ ] **Step 4: claudePromptBuilder.test.ts を直す**

このファイルには `writeConfig`（`:96-98`）がある。カタログに依存する 2 テストの先頭で呼ぶ。

変更後（`:110-131` を丸ごと置き換える）:

```typescript
  it('takes the agent from the catalog row of the task-level model override', () => {
    writeConfig({ modelCatalog: CATALOG_WITH_CODEX });
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5.6-sol' });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'codex',
      model: 'gpt-5.6-sol',
      effort: undefined,
    });
  });

  it('throws when the task-level model is not in the catalog', () => {
    writeConfig({ modelCatalog: CATALOG_WITH_CODEX });
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5' });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(LaunchSettingsError);
    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Task model "gpt-5" is not in modelCatalog. Must be one of: fable, opus, sonnet, haiku, gpt-5.6-sol'
    );
  });
```

- [ ] **Step 5: claudePromptBuilder.test.ts のテストを実行**

Run: `npx vitest run tests/board/claudePromptBuilder.test.ts`
Expected: 全件 PASS

- [ ] **Step 6: boardRoutes.test.ts の 1 件目を直す**

`accepts a codex model from the catalog together with a codex-only effort`（`:403-417`）を次で置き換える。

```typescript
  it('accepts a codex model from the catalog together with a codex-only effort', async () => {
    const services = buildServices();
    const app = buildApp(services);
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-board-routes-test-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
    try {
      fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Codex Task', models: { run: 'gpt-5.6-sol' }, efforts: { run: 'none' } }),
        })
      );
      expect(res.status).toBe(201);
      const created = (await res.json()) as { model_run: string | null; effort_run: string | null };
      expect(created.model_run).toBe('gpt-5.6-sol');
      expect(created.effort_run).toBe('none');
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 7: boardRoutes.test.ts の 2 件目を直す**

`validates a new model against the stored effort`（`:681-696`）を次で置き換える。

```typescript
  it('validates a new model against the stored effort', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Stored Effort', status: 'backlog', effort_run: 'max' });
    const app = buildApp(services);
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-board-routes-test-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
    try {
      fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ models: { run: 'gpt-5.6-sol' } }),
        })
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toMatch(/Invalid effort "max" for model "gpt-5.6-sol"/);
      expect(services.ts.getTask(task.id)!.model_run).toBeNull();
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 8: boardRoutes.test.ts の 3 件目を直す**

`accepts a new model/effort pair that clears the stored effort in the same request`（`:713-729`）を次で置き換える。

```typescript
  it('accepts a new model/effort pair that clears the stored effort in the same request', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Swap', status: 'backlog', model_run: 'opus', effort_run: 'max' });
    const app = buildApp(services);
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-board-routes-test-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
    try {
      fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ models: { run: 'gpt-5.6-sol' }, efforts: { run: '' } }),
        })
      );
      expect(res.status).toBe(200);
      const updated = services.ts.getTask(task.id)!;
      expect(updated.model_run).toBe('gpt-5.6-sol');
      expect(updated.effort_run).toBeNull();
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 9: boardRoutes.test.ts のテストを実行**

Run: `npx vitest run tests/board/boardRoutes.test.ts`
Expected: 全件 PASS

- [ ] **Step 10: claudeRoutes.test.ts を直す**

`passes the cli of the task-level model row to startProcess`（`:435-452`）を次で置き換える。

```typescript
  it('passes the cli of the task-level model row to startProcess', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Codex Model Task', status: 'backlog' });
    services.ts.updateTask(task.id, { model_run: 'gpt-5.6-sol', effort_run: 'none' });
    const app = buildApp(services);

    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-claude-routes-test-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
    try {
      fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
      const res = await app.fetch(
        new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'run' }),
        })
      );

      expect(res.status).toBe(201);
      expect(mock.startProcess).toHaveBeenCalledWith(
        task.id,
        expect.any(String),
        'run',
        'gpt-5.6-sol',
        'none',
        'codex'
      );
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });
```

Run: `npx vitest run tests/board/claudeRoutes.test.ts`
Expected: 全件 PASS

- [ ] **Step 11: bulkRunService.test.ts を直す**

このファイルには `fs` / `os` / `path` / `yaml` の import がまだない。ファイル冒頭の import 群に次を足す。

```typescript
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
```

そのうえで `passes the cli of the task-level model row to startProcess`（`:637-654`）を次で置き換える。

```typescript
  it('passes the cli of the task-level model row to startProcess', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'Codex Task', status: 'ready', priority: 'high' });
    ts.updateTask(task.id, { model_run: 'gpt-5.6-sol', effort_run: 'none' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty, ts);

    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-bulk-run-test-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
    try {
      fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));

      await service.start('direct');

      expect(startProcess).toHaveBeenCalledWith(task.id, expect.any(String), 'run', 'gpt-5.6-sol', 'none', 'codex');
    } finally {
      service.stop();
      cwdSpy.mockRestore();
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });
```

`service.stop()` は元は最終行にあったが、`finally` へ移して例外時も確実に止まるようにする。

Run: `npx vitest run tests/board/bulkRunService.test.ts`
Expected: 全件 PASS

- [ ] **Step 12: task/add.test.ts を直す**

`should accept a codex model from the catalog with a codex-only effort`（`:719-735`）を次で置き換える。このファイルは `fs` / `os` / `path` / `yaml` を既に import している（`:762-777` の describe が使っている）。

```typescript
    it('should accept a codex model from the catalog with a codex-only effort', async () => {
      const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-task-add-test-'));
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
      try {
        fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
        const { exitCode } = await runCommand(program, [
          'task',
          'add',
          'Codex Task',
          '--model-run',
          'gpt-5.6-sol',
          '--effort-run',
          'none',
        ]);
        expect(exitCode).toBeUndefined();

        const taskService = new TaskService();
        const tasks = taskService.listTasks();
        expect(tasks[0].model_run).toBe('gpt-5.6-sol');
        expect(tasks[0].effort_run).toBe('none');
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tmpCwd, { recursive: true, force: true });
      }
    });
```

Run: `npx vitest run tests/cli/commands/task/add.test.ts`
Expected: 全件 PASS

- [ ] **Step 13: task/update.test.ts を直す**

2 テストが対象。このファイルも `fs` / `os` / `path` / `yaml` を既に import している。

`should validate a new model against the stored effort`（`:1032-1046`）を次で置き換える。

```typescript
    it('should validate a new model against the stored effort', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Stored effort test', effort_run: 'max' });

      const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-task-update-test-'));
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
      try {
        fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
        const { exitCode, errors } = await runCommand(program, [
          'task',
          'update',
          String(task.id),
          '--model-run',
          'gpt-5.6-sol',
        ]);
        expect(exitCode).toBe(1);
        expect(errors.join('\n')).toContain('Invalid effort "max" for model "gpt-5.6-sol"');
        expect(taskService.getTask(task.id)?.model_run).toBeNull();
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tmpCwd, { recursive: true, force: true });
      }
    });
```

`should accept a model/effort swap sent in one command`（`:1062-1080`）を次で置き換える。

```typescript
    it('should accept a model/effort swap sent in one command', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Swap test', model_run: 'opus', effort_run: 'max' });

      const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-task-update-test-'));
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
      try {
        fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
        const { exitCode } = await runCommand(program, [
          'task',
          'update',
          String(task.id),
          '--model-run',
          'gpt-5.6-sol',
          '--effort-run',
          'none',
        ]);
        expect(exitCode).toBeUndefined();

        const updated = taskService.getTask(task.id);
        expect(updated?.model_run).toBe('gpt-5.6-sol');
        expect(updated?.effort_run).toBe('none');
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tmpCwd, { recursive: true, force: true });
      }
    });
```

Run: `npx vitest run tests/cli/commands/task/update.test.ts`
Expected: 全件 PASS

- [ ] **Step 14: 触れたテストをまとめて実行**

Run:
```bash
npx vitest run tests/board/boardRenderer.test.ts tests/board/claudePromptBuilder.test.ts \
  tests/board/boardRoutes.test.ts tests/board/claudeRoutes.test.ts tests/board/bulkRunService.test.ts \
  tests/cli/commands/task/add.test.ts tests/cli/commands/task/update.test.ts
```
Expected: 全件 PASS

- [ ] **Step 15: 静的チェックとコミット**

```bash
pnpm run type-check && pnpm run lint
git add tests/
git commit -F - <<'MSG'
test: pin the codex catalog row in tests that exercise cross-cli launches

The tests that check "selecting a model selects its cli" relied on the
codex row being present in the built-in catalog. Give each of them an
explicit modelCatalog so they keep testing cross-cli behaviour once the
built-in default carries claude rows only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA
MSG
```

---

### Task 3: 既定カタログから Codex 行を削除する

**Files:**
- Modify: `src/db/modelCatalog.ts:17`, `:24`
- Modify: `tests/db/modelCatalog.test.ts:12`, `:14-34`, `:106-121`, `:124-133`, `:135-167`
- Modify: `tests/cli/commands/config/get.test.ts:53-68`

**Interfaces:**
- Consumes: Task 2 で自前カタログに移したテスト群
- Produces: `DEFAULT_MODEL_CATALOG` が Claude の `fable` / `opus` / `sonnet` / `haiku` の 4 行のみになる

- [ ] **Step 1: 失敗するテストを書く（既定カタログの中身）**

`tests/db/modelCatalog.test.ts:15-23` を書き換える。

変更前:

```typescript
  it('lists the four claude models and the codex model', () => {
    expect(DEFAULT_MODEL_CATALOG.map((e) => `${e.cli}[${e.model}]`)).toEqual([
      'claude[fable]',
      'claude[opus]',
      'claude[sonnet]',
      'claude[haiku]',
      'codex[gpt-5.6-sol]',
    ]);
  });
```

変更後:

```typescript
  it('lists the four claude models', () => {
    expect(DEFAULT_MODEL_CATALOG.map((e) => `${e.cli}[${e.model}]`)).toEqual([
      'claude[fable]',
      'claude[opus]',
      'claude[sonnet]',
      'claude[haiku]',
    ]);
  });
```

さらに `:31-33` の `gives the codex row its own effort list` を削除する。

```typescript
  it('gives the codex row its own effort list', () => {
    expect(DEFAULT_MODEL_CATALOG.find((e) => e.cli === 'codex')!.efforts).toEqual(CODEX_EFFORTS);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run tests/db/modelCatalog.test.ts -t "lists the four claude models"`
Expected: FAIL。`codex[gpt-5.6-sol]` が余分だという差分が出る

- [ ] **Step 3: 既定カタログから Codex 行を削除**

`src/db/modelCatalog.ts` の `:24` を削除し、参照がなくなる `:17` の `CODEX_EFFORTS` も削除する。

変更前（`:16-25`）:

```typescript
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];

export const DEFAULT_MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  { cli: 'claude', model: 'fable', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'opus', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'sonnet', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'haiku', efforts: CLAUDE_EFFORTS },
  { cli: 'codex', model: 'gpt-5.6-sol', efforts: CODEX_EFFORTS },
];
```

変更後:

```typescript
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export const DEFAULT_MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  { cli: 'claude', model: 'fable', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'opus', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'sonnet', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'haiku', efforts: CLAUDE_EFFORTS },
];
```

`parseEntry` の cli 検証（`:36-38`）と `Must be one of: claude, codex` の文言は **そのまま残す**。Codex を設定で足せる状態を維持するためである。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run tests/db/modelCatalog.test.ts -t "lists the four claude models"`
Expected: PASS

- [ ] **Step 5: modelCatalog.test.ts の残りの失敗を直す**

`npx vitest run tests/db/modelCatalog.test.ts` を実行すると、まだ次の 7 件が落ちる。それぞれ、テスト内で明示カタログを使う形に直す。

ファイル冒頭（`:11-12`）の定数はそのまま残し、Codex 行を含むローカルカタログを足す。

```typescript
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];

const CATALOG_WITH_CODEX: ModelCatalogEntry[] = [
  ...DEFAULT_MODEL_CATALOG.map((e) => ({ ...e, efforts: [...e.efforts] })),
  { cli: 'codex', model: 'gpt-5.6-sol', efforts: CODEX_EFFORTS },
];
```

そのうえで:

- `findCatalogEntry` の describe（`:106-121`）: `const catalog = [...DEFAULT_MODEL_CATALOG];` を `const catalog = CATALOG_WITH_CODEX;` に変える
- `effortsForDefaultCli`（`:126-128`）: `effortsForDefaultCli([...DEFAULT_MODEL_CATALOG], 'codex')` を `effortsForDefaultCli(CATALOG_WITH_CODEX, 'codex')` に変える。同じ it の `'claude'` 側は `DEFAULT_MODEL_CATALOG` のままでよい
- `validateOverridePair` の describe（`:136`）: `const catalog = [...DEFAULT_MODEL_CATALOG];` を `const catalog = CATALOG_WITH_CODEX;` に変える。`:150` の期待文字列 `'Invalid model "gpt-5". Must be one of: fable, opus, sonnet, haiku, gpt-5.6-sol'` はカタログに Codex 行が含まれるためこのままでよい

- [ ] **Step 6: modelCatalog.test.ts の全件実行**

Run: `npx vitest run tests/db/modelCatalog.test.ts`
Expected: 全件 PASS

- [ ] **Step 7: config/get.test.ts の期待値を直す**

`includes the resolved model catalog in the JSON output`（`:53`）の期待値から Codex 行を落とす。

変更前（`:61-68`）:

```typescript
    expect(parsed.config.modelCatalog).toEqual([
      { cli: 'claude', model: 'fable', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'haiku', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low', 'medium', 'high', 'xhigh'] },
    ]);
```

変更後:

```typescript
    expect(parsed.config.modelCatalog).toEqual([
      { cli: 'claude', model: 'fable', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'haiku', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    ]);
```

`:72` `:84` の「設定でカタログを丸ごと差し替える」テストは Codex 行を明示しているのでそのままでよい。

- [ ] **Step 8: config/get.test.ts の全件実行**

Run: `npx vitest run tests/cli/commands/config/get.test.ts`
Expected: 全件 PASS

- [ ] **Step 9: 影響範囲のテストをまとめて実行**

Run:
```bash
npx vitest run tests/db/ tests/board/ tests/cli/ tests/terminal/
```
Expected: 全件 PASS

- [ ] **Step 10: 静的チェックとコミット**

```bash
pnpm run type-check && pnpm run lint
git add src/db/modelCatalog.ts tests/db/modelCatalog.test.ts tests/cli/commands/config/get.test.ts
git commit -F - <<'MSG'
feat(db): limit the built-in model catalog to the four claude models

The catalog a project gets without configuration now offers fable, opus,
sonnet, and haiku. A project that wants another cli's models declares its
own modelCatalog in .agkan.yml, which replaces the built-in default.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA
MSG
```

---

### Task 4: ドキュメントと init テンプレートから Codex 記述を削除

**Files:**
- Modify: `src/cli/commands/init.ts:20`, `:46`, `:55-61`, `:81-83`
- Modify: `documentation/configuration.md`（目次、`:190-211`, `:223-225`, `:230`, `:244`, `:251`, `:270`, `:272`, `:275`, `:277`, `:279`, `:283`, `:292`, `:301`）
- Modify: `documentation/configuration.ja.md`（目次、`:177-198`, `:210-212`, `:217`, `:231`, `:238`, `:257`, `:259`, `:262`, `:264`, `:266`, `:270`, `:279`, `:288`）
- Modify: `documentation/cli-reference.md:629`
- Modify: `documentation/cli-reference.ja.md:624`
- Test: `tests/cli/commands/init.test.ts:88`

**Interfaces:**
- Consumes: Task 3 の Claude 4 行のみの `DEFAULT_MODEL_CATALOG`
- Produces: `documentation/` に `codex` の文字列が 1 つも残らない状態

- [ ] **Step 1: 失敗するテストにする（init テンプレート）**

`tests/cli/commands/init.test.ts:88` の期待を反転させる。

変更前:

```typescript
    expect(content).toContain('  codex:');
```

変更後:

```typescript
    expect(content).not.toContain('codex');
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run tests/cli/commands/init.test.ts`
Expected: FAIL。テンプレートに `codex` が含まれている

- [ ] **Step 3: init テンプレートを直す**

`src/cli/commands/init.ts` の埋め込みテンプレート文字列を 4 箇所直す。

`:20` — Codex を有効値から外す

```
# Valid values: claude
```

`:46` — 次の 1 行を削除

```
# If omitted for codex, agkan defaults to gpt-5.6-sol instead of the Codex CLI's own default.
```

`:55-61` — `models:` テンプレート内の Codex ブロック 7 行を削除

```
#   codex:
#     planning:
#       model: gpt-5.6-sol
#       effort: high
#     run:
#       model: gpt-5.6-sol
#       effort: high
```

`:81-83` — `modelCatalog:` テンプレート内の Codex エントリ 3 行を削除

```
#   - cli: codex
#     model: gpt-5.6-sol
#     efforts: [none, low, medium, high, xhigh]
```

さらに `modelCatalog:` のコメント文（`:76-79` 付近）にある「each model name may appear only once, even across cli values」の「even across cli values」は、cli が 1 つしか文書化されない状態では意味を持たないので、文末を「each model name may appear only once.」に短くする。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run tests/cli/commands/init.test.ts`
Expected: 全件 PASS

- [ ] **Step 5: configuration.md から Agent Settings 節を削除**

`## Agent Settings`（`:190`）から `## Model Catalog`（`:212`）の直前までを削除する。冒頭の `## Table of Contents`（`:5-17`）にある該当リンク行も削除する。

- [ ] **Step 6: configuration.md の Model Catalog 節を Claude 専用にする**

- `:223-225` — Format 例の Codex エントリ 3 行を削除

```yaml
  - cli: codex
    model: gpt-5.6-sol
    efforts: [none, low, medium, high, xhigh]
```

- `:230` — `cli` フィールドの説明を書き換える

変更前:

```
| `cli` | string | `claude` or `codex`. The cli that runs a task which selects this model |
```

変更後:

```
| `cli` | string | `claude`. The cli that runs a task which selects this model |
```

- `:244` — Built-in Default 表から次の行を削除

```
| codex | `gpt-5.6-sol` | `none`, `low`, `medium`, `high`, `xhigh` |
```

- `:251` — Validation の箇条書きを書き換える

変更前:

```
- a row's `cli` is neither `claude` nor `codex`
```

変更後:

```
- a row's `cli` is not `claude`
```

- [ ] **Step 7: configuration.md の Models Settings 節を Claude 専用にする**

- `:270` `:272` — 表の Default 列から Codex の既定値を落とす（`claude: selected CLI default; codex: gpt-5.6-sol` → `Selected CLI default`）
- `:275` — `<agent>` の説明を書き換える

変更前:

```
`<agent>` is `claude` or `codex`. Both `models.claude` and `models.codex` can be configured at the same time; only the profile matching the selected `agent` is used. Both `model` and `effort` are optional within each entry.
```

変更後:

```
`<agent>` is `claude`. Both `model` and `effort` are optional within each entry.
```

- `:277` — `models.codex...` の既定値を説明する段落を削除し、Claude 側の説明だけ残す

```
If `models.claude.planning.model` / `models.claude.run.model` is not set, the Claude CLI's own default model is used.
```

- `:279` — `> **Breaking Change**:` で始まる Codex の破壊的変更の引用ブロックを削除
- `:283` — 最終段落から Codex への言及を落とす

変更後:

```
Model names are passed through as-is to the Claude CLI's `--model` flag. Aliases such as `opus`, `sonnet`, and `haiku` are resolved by the Claude CLI itself, not by agkan; agkan does not resolve or validate config-level (`models.<agent>`) model values.
```

- `:292` `:301` — Configuration Example から `agent: codex` の行と `codex:` ブロックを削除

- [ ] **Step 8: configuration.ja.md の目次とエージェント設定節を直す**

目次（`:5-17`）から次の 1 行を削除する。

```markdown
- [エージェント設定](#エージェント設定)
```

`## エージェント設定`（`:177`）から `## モデルカタログ`（`:199`）の直前までを削除する。

- [ ] **Step 9: configuration.ja.md のモデルカタログ節を Claude 専用にする**

`### 形式` の yaml 例（`:210-212`）から次の 3 行を削除する。

```yaml
  - cli: codex
    model: gpt-5.6-sol
    efforts: [none, low, medium, high, xhigh]
```

`cli` フィールドの説明（`:217`）を書き換える。

変更前:

```markdown
| `cli` | string | `claude` または `codex`。このモデルを選んだタスクを実行する cli |
```

変更後:

```markdown
| `cli` | string | `claude`。このモデルを選んだタスクを実行する cli |
```

`### 組み込みの既定` の表（`:231`）から次の 1 行を削除する。

```markdown
| codex | `gpt-5.6-sol` | `none`, `low`, `medium`, `high`, `xhigh` |
```

`### 検証` の箇条書き（`:238`）を書き換える。

変更前:

```markdown
- 行の `cli` が `claude` / `codex` のいずれでもない
```

変更後:

```markdown
- 行の `cli` が `claude` でない
```

同じ箇条書きの最終行（`:240` 付近）から cli への言及を落とす。

変更前:

```markdown
- 同じ `model` 名が 2 行以上に現れる（cli が異なっていても不可。モデル名だけで cli を一意に引くため）
```

変更後:

```markdown
- 同じ `model` 名が 2 行以上に現れる
```

- [ ] **Step 10: configuration.ja.md のモデル設定節を Claude 専用にする**

表の デフォルト値 列（`:257` `:259`）を書き換える。

変更前:

```markdown
| `models.<agent>.planning.model` | string | claude: 選択したCLIのデフォルト / codex: `gpt-5.6-sol` | planningコマンド実行時に使用するモデル |
| `models.<agent>.run.model` | string | claude: 選択したCLIのデフォルト / codex: `gpt-5.6-sol` | run/prコマンド実行時に使用するモデル |
```

変更後:

```markdown
| `models.<agent>.planning.model` | string | (選択したCLIのデフォルト) | planningコマンド実行時に使用するモデル |
| `models.<agent>.run.model` | string | (選択したCLIのデフォルト) | run/prコマンド実行時に使用するモデル |
```

`<agent>` の説明（`:262`）を書き換える。

変更前:

```markdown
`<agent>` は `claude` または `codex` です。`models.claude` と `models.codex` の両方を同時に定義でき、`agent` で選択した側の設定のみが使用されます。`model` と `effort` はいずれも省略可能です。
```

変更後:

```markdown
`<agent>` は `claude` です。`model` と `effort` はいずれも省略可能です。
```

Codex の既定モデルを説明する段落（`:264`）を書き換える。

変更前:

```markdown
`models.codex.planning.model` / `models.codex.run.model` が未設定の場合、Codex CLI自身のデフォルトに委ねるのではなく、agkanが `gpt-5.6-sol` をデフォルトとして使用します。`claude` にはagkan側のデフォルトはなく、未設定の場合はClaude CLI自身のデフォルトモデルが使用されます。
```

変更後:

```markdown
`models.claude.planning.model` / `models.claude.run.model` が未設定の場合、Claude CLI自身のデフォルトモデルが使用されます。
```

破壊的変更の引用ブロック（`:266`）を削除する。

```markdown
> **破壊的変更**: この機能導入以前は、Codexのモデルが未設定の場合 `--model` 自体が渡されず、Codex CLI自身のデフォルトモデルに委ねられていました。agkanは今後常に `--model` を渡し、未設定時は `gpt-5.6-sol` をデフォルトとします。Codex CLI自身のデフォルトに依存していた場合は、`models.codex.planning.model` / `models.codex.run.model` にそのモデル名を明示的に設定してください。
```

モデル名の受け渡しを説明する段落（`:270`）を書き換える。

変更前:

```markdown
モデル名は選択したエージェントのCLIにそのまま渡されます（`claude` と `codex` のどちらも `--model` フラグ）。`opus`、`sonnet`、`haiku` などのClaude CLIのエイリアスは、agkanではなくClaude CLI自身が解決します。agkanはどちらのエージェントについても、設定ファイルの `models.<agent>` の値に対するモデルのエイリアス解決やバリデーションは行いません。Codexの場合、`effort` は `--effort` フラグではなく `--config model_reasoning_effort=<effort>` として渡されます。
```

変更後:

```markdown
モデル名はClaude CLIの `--model` フラグにそのまま渡されます。`opus`、`sonnet`、`haiku` などのエイリアスは、agkanではなくClaude CLI自身が解決します。agkanは設定ファイルの `models.<agent>` の値に対するモデルのエイリアス解決やバリデーションは行いません。
```

`### 設定例`（`:275` 以降）から `agent: codex` の行（`:279`）と `codex:` ブロック（`:288-294` 付近）を削除する。

- [ ] **Step 11: cli-reference の config get 出力例を直す**

`documentation/cli-reference.md:629` と `documentation/cli-reference.ja.md:624` の次の行を削除する。

```
modelCatalog: codex gpt-5.6-sol (none, low, medium, high, xhigh)
```

- [ ] **Step 12: Codex 記述が残っていないことを確認**

Run: `grep -rn "codex\|Codex\|gpt-5" documentation/ src/cli/commands/init.ts`
Expected: 出力なし

- [ ] **Step 13: 静的チェックとテスト**

Run: `pnpm run type-check && pnpm run lint && npx vitest run tests/cli/commands/init.test.ts`
Expected: すべて成功

- [ ] **Step 14: コミット**

```bash
git add src/cli/commands/init.ts documentation/ tests/cli/commands/init.test.ts
git commit -F - <<'MSG'
docs: document the model catalog as claude-only

Drop the Agent Settings section, the codex catalog row, and the codex
model profile from the configuration reference and the agkan init
template, matching the built-in catalog.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA
MSG
```

---

### Task 5: CHANGELOG を Unreleased 節に書き直す

**Files:**
- Modify: `CHANGELOG.md:8-22`
- Modify: `CHANGELOG.ja.md:8-22`

**Interfaces:**
- Consumes: Task 3・Task 4 の成果（Claude 専用のカタログとドキュメント）
- Produces: リリース済み 3.21.0 節が `main` と同一のまま、`## [Unreleased]` に今回の変更が記載された CHANGELOG

- [ ] **Step 1: CHANGELOG が main のままであることを確認**

Task 1 は CHANGELOG を `beta` から取り込んでいないので、この時点の 2 ファイルは `main` と同一のはずである。先に確かめる。

```bash
git diff main -- CHANGELOG.md CHANGELOG.ja.md   # 空であること
```

空でない場合は Task 1 が誤って取り込んでいる。`git checkout main -- CHANGELOG.md CHANGELOG.ja.md` で戻してから次へ進む。

- [ ] **Step 2: CHANGELOG.md の Unreleased 節を書く**

`## [Unreleased]`（`:8`）の直後に次を挿入する。

```markdown
## [Unreleased]

### Added
- Add a `modelCatalog` setting to `.agkan.yml` listing which model a task may select and which reasoning efforts that model accepts. Setting this key replaces the built-in catalog entirely (no per-row merge), and each model name may appear only once. The catalog is also reported by `agkan config get` and commented into the `agkan init` template

### Changed
- Validate task-level model and effort values against `modelCatalog` instead of the fixed alias list (`fable`, `opus`, `sonnet`, `haiku`) and effort list (`low`, `medium`, `high`, `xhigh`, `max`). The model and effort of each of planning/run are now checked as a pair: an effort must belong to the selected model's row, or to the union of the catalog's efforts when no model is selected. `agkan task update` and `PATCH /api/tasks/:id` validate a flag you omit against the value already stored on the task
- Change the Board's model labels from `claude[Fable]` to `claude[fable]`: the label is now `cli[model]` verbatim, with no capitalization. A stored model or effort that is no longer in the catalog is shown in the detail panel as `(not in catalog) <value>` instead of silently reading as the default
- Fail a run whose task-level model is not in `modelCatalog` (`POST /api/claude/tasks/:id/run` returns 400; Bulk Run skips the task and continues) instead of launching it with the default model
```

- [ ] **Step 3: CHANGELOG.ja.md の Unreleased 節を書く**

`## [Unreleased]`（`:8`）の直後に次を挿入する。見出しは日本語（`.claude/rules/versioning.md`）。

```markdown
## [Unreleased]

### 追加
- `.agkan.yml` に `modelCatalog` 設定を追加。タスクが選択できるモデルと、そのモデルで選べる reasoning effort を定義する。このキーを設定すると組み込みのカタログを丸ごと置き換える（行単位のマージはしない）。同じモデル名は 1 度しか書けない。カタログは `agkan config get` にも出力され、`agkan init` のテンプレートにコメントとして書き出される

### 変更
- タスク単位の model / effort の検証を、固定のエイリアス表（`fable`, `opus`, `sonnet`, `haiku`）と effort 表（`low`, `medium`, `high`, `xhigh`, `max`）から `modelCatalog` 基準に変更。planning / run それぞれについて model と effort をペアで検証し、effort は選択したモデルの行に含まれること（モデル未選択ならカタログの effort の和集合に含まれること）を要求する。`agkan task update` と `PATCH /api/tasks/:id` では、指定しなかった側にタスクの保存済みの値を使って検証する
- Board のモデル表示を `claude[Fable]` から `claude[fable]` に変更（`cli[model]` をそのまま表示し、先頭大文字化をやめた）。カタログから消えたモデル / effort が保存されている場合は、詳細パネルで `(not in catalog) <値>` と表示し、既定と区別できるようにした
- タスクの model が `modelCatalog` にない状態での実行を、既定モデルでの起動ではなく失敗にした（`POST /api/claude/tasks/:id/run` は 400、Bulk Run はそのタスクをスキップして続行）
```

- [ ] **Step 4: 3.21.0 節が無傷であることを確認**

Run: `git diff main -- CHANGELOG.md CHANGELOG.ja.md | grep -E "^[-+].*3\.21\.0|^[-+].*task_metadata"`
Expected: 出力なし（3.21.0 節と既存エントリに変更がない）

- [ ] **Step 5: コミット**

```bash
git add CHANGELOG.md CHANGELOG.ja.md
git commit -F - <<'MSG'
docs(changelog): record the model catalog under Unreleased

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA
MSG
```

---

### Task 6: 最終検証と PR

**Files:**
- Modify: なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜5 の全コミット
- Produces: `main` へ向けた PR

- [ ] **Step 1: 取り込み範囲の確認**

Run: `git diff main --stat -- docs/ README.md README.ja.md`
Expected: 出力なし

- [ ] **Step 2: 診断ログが入っていないことの確認**

Run: `git diff main -- src/ | grep "\[diag\]"`
Expected: 出力なし

- [ ] **Step 3: Codex がドキュメントに残っていないことの確認**

Run: `grep -rn "codex\|Codex" documentation/ CHANGELOG.md CHANGELOG.ja.md src/cli/commands/init.ts`
Expected: 出力なし

- [ ] **Step 4: 既定カタログの確認**

Run: `grep -n "cli: '" src/db/modelCatalog.ts`
Expected: `claude` の 4 行のみ

- [ ] **Step 5: 3.21.0 節が無傷であることの確認**

Run: `git diff main -- CHANGELOG.md CHANGELOG.ja.md | grep "^-" | grep -v "^---"`
Expected: 出力なし（削除行がない = 既存内容に手を入れていない）。`^---` を除くのは、diff のファイルヘッダ `--- a/CHANGELOG.md` が `-` で始まるためである

- [ ] **Step 6: フルチェックを走らせる**

Run: `pnpm run test:all`
Expected: install / build / type-check / lint / vitest / e2e がすべて成功。約 15〜20 分かかる

- [ ] **Step 7: push して PR を作る**

```bash
git push -u origin feat/model-catalog-main
gh pr create --base main --title "feat: add the model catalog with a claude-only built-in default" --body "$(cat <<'BODY'
## Summary

Land the modelCatalog mechanism from `beta` on `main`. A task that selects a model also selects the cli that runs it, and the catalog is the single source of truth for valid model/effort pairs across the CLI, the board API, and the board UI.

The built-in catalog carries the four Claude models only: `fable`, `opus`, `sonnet`, `haiku`. A project that wants another cli's models declares its own `modelCatalog` in `.agkan.yml`, which replaces the built-in default.

## Not included

- `docs/superpowers/` specs and plans
- The diagnostic logging from `9699eba`
- The codex rows, sections, and examples in the configuration reference and the `agkan init` template

## Test plan

- `pnpm run test:all`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA
BODY
)"
```

`gh` が `GITHUB_TOKEN` の認証エラーを出したら `GITHUB_TOKEN="lsec://global/GITHUB_TOKEN" lsec run -- gh ...` で再実行する。

---

### Task 7: beta 側を main に揃える

PR が `main` にマージされたあとで実施する。

**Files:**
- Modify: `src/db/modelCatalog.ts:17`, `:24`（`beta` 側）
- Modify: `beta` 側の同じテスト群

**Interfaces:**
- Consumes: `main` にマージ済みの Claude 4 行のみの `DEFAULT_MODEL_CATALOG`
- Produces: `beta` と `main` で `src/db/modelCatalog.ts` が一致し、以後のマージでこの行が衝突しない状態

- [ ] **Step 1: beta に main を取り込む**

```bash
git checkout beta
git merge main
```

`src/db/modelCatalog.ts` の Codex 行、`documentation/` の Codex 記述、`src/cli/commands/init.ts` のテンプレート、CHANGELOG の 3.21.0 節でコンフリクトが出る。すべて **main 側**（Codex なし・3.21.0 節は元のまま）を採用する。

- [ ] **Step 2: beta 独自の内容が残っていることを確認**

Run: `ls docs/superpowers/specs/ docs/superpowers/plans/`
Expected: `beta` にあった spec 4 件・plan 4 件と、今回の 2 件が残っている

- [ ] **Step 3: テストを実行**

Run: `pnpm test`
Expected: 全件 PASS

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -F - <<'MSG'
chore: align the built-in model catalog with main

Take main's claude-only catalog and docs. A project that wants codex
models declares its own modelCatalog in .agkan.yml.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JE37Q2tRmnfdMmRENnsFHA
MSG
```

---

## 参考: Codex を使いたくなったときの `.agkan.yml`

```yaml
modelCatalog:
  - cli: claude
    model: fable
    efforts: [low, medium, high, xhigh, max]
  - cli: claude
    model: opus
    efforts: [low, medium, high, xhigh, max]
  - cli: claude
    model: sonnet
    efforts: [low, medium, high, xhigh, max]
  - cli: claude
    model: haiku
    efforts: [low, medium, high, xhigh, max]
  - cli: codex
    model: gpt-5.6-sol
    efforts: [none, low, medium, high, xhigh]
```

`agent: codex` を併記すればタスクに model 指定がないときの既定 cli も Codex になる。どちらも `main` のコードでそのまま動作する。
