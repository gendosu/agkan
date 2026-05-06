# Claude CLI ユーザー質問検知と自動終了機構 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude CLI が `AskUserQuestion` を使って質問待機している状態を board UI にアイコン表示し、質問なし完了時には Claude CLI を自動終了させる。

**Architecture:** Claude Code の hooks 機構（PreToolUse / PostToolUse / Stop）でツール呼び出しを検知し、HTTP で board API に通知。board は SSE で UI に状態を配信し、Stop 時には PTY プロセスを終了する。

**Tech Stack:** TypeScript / Node.js / vitest / Express / Server-Sent Events / Claude Code Hooks (settings.json) / node-pty

---

## File Structure

```
src/
├── hooks/                                  ← 新規ディレクトリ
│   ├── claudeHookSettings.ts              ← settings.json生成 (TS)
│   ├── hook-attention.mjs                 ← PreToolUse/PostToolUse 用 (ESM, 配布対象)
│   └── hook-stop.mjs                      ← Stop hook 用 (ESM, 配布対象)
├── services/
│   └── AttentionStateService.ts           ← メモリ状態+購読管理
├── utils/
│   └── hookToken.ts                       ← 起動時トークン管理
├── terminal/
│   └── PtySessionService.ts               ← env注入 + --settings (変更)
├── board/
│   ├── boardRoutes.ts                     ← hook受付ルート + attention SSE (変更)
│   ├── server.ts                          ← AttentionStateService 注入 (変更)
│   └── client/
│       ├── attentionIndicator.ts          ← アイコン描画 + SSE購読 (新規)
│       ├── claudeButton.ts                ← attentionIndicator 連携 (変更)
│       └── card.ts                        ← status近傍にアイコンスロット (変更)
└── ...

tests/
├── services/AttentionStateService.test.ts
├── utils/hookToken.test.ts
└── hooks/claudeHookSettings.test.ts
```

---

## Task 1: hookToken ユーティリティ

**Files:**
- Create: `src/utils/hookToken.ts`
- Test: `tests/utils/hookToken.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/utils/hookToken.test.ts
import { describe, it, expect } from 'vitest';
import { getHookToken, verifyHookToken } from '../../src/utils/hookToken';

describe('hookToken', () => {
  it('returns the same token for repeated getHookToken calls', () => {
    const t1 = getHookToken();
    const t2 = getHookToken();
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifyHookToken returns true for the current token', () => {
    expect(verifyHookToken(getHookToken())).toBe(true);
  });

  it('verifyHookToken returns false for incorrect tokens', () => {
    expect(verifyHookToken('invalid')).toBe(false);
    expect(verifyHookToken('')).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/utils/hookToken.test.ts
```
Expected: FAIL（モジュールが存在しないエラー）

- [ ] **Step 3: 最小実装**

```typescript
// src/utils/hookToken.ts
import crypto from 'crypto';

let cachedToken: string | null = null;

export function getHookToken(): string {
  if (cachedToken === null) {
    cachedToken = crypto.randomBytes(32).toString('hex');
  }
  return cachedToken;
}

export function verifyHookToken(token: string | undefined | null): boolean {
  if (typeof token !== 'string' || token.length === 0) return false;
  const current = getHookToken();
  if (token.length !== current.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(current));
}
```

- [ ] **Step 4: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/utils/hookToken.test.ts
```
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/hookToken.ts tests/utils/hookToken.test.ts
git commit -m "feat: add hookToken utility for board hook authentication"
```

---

## Task 2: AttentionStateService

**Files:**
- Create: `src/services/AttentionStateService.ts`
- Test: `tests/services/AttentionStateService.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/services/AttentionStateService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AttentionStateService } from '../../src/services/AttentionStateService';

describe('AttentionStateService', () => {
  it('returns false for unknown taskId', () => {
    const svc = new AttentionStateService();
    expect(svc.getAttention(1)).toBe(false);
  });

  it('records attention state per taskId', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    svc.setAttention(2, false);
    expect(svc.getAttention(1)).toBe(true);
    expect(svc.getAttention(2)).toBe(false);
  });

  it('notifies subscribers on state change', () => {
    const svc = new AttentionStateService();
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.setAttention(1, true);
    expect(cb).toHaveBeenCalledWith({ taskId: 1, needsAttention: true });
  });

  it('skips notification when state does not change', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.setAttention(1, true);
    expect(cb).not.toHaveBeenCalled();
  });

  it('listAttentionTasks returns only taskIds with needsAttention=true', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    svc.setAttention(2, false);
    svc.setAttention(3, true);
    expect(svc.listAttentionTasks().sort()).toEqual([1, 3]);
  });

  it('clearTask removes state and notifies if was true', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.clearTask(1);
    expect(svc.getAttention(1)).toBe(false);
    expect(cb).toHaveBeenCalledWith({ taskId: 1, needsAttention: false });
  });

  it('clearTask is silent when no state exists', () => {
    const svc = new AttentionStateService();
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.clearTask(99);
    expect(cb).not.toHaveBeenCalled();
  });

  it('subscribe returns an unsubscribe function', () => {
    const svc = new AttentionStateService();
    const cb = vi.fn();
    const unsub = svc.subscribe(cb);
    unsub();
    svc.setAttention(1, true);
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/services/AttentionStateService.test.ts
```
Expected: FAIL（モジュールが存在しないエラー）

- [ ] **Step 3: 最小実装**

```typescript
// src/services/AttentionStateService.ts
export type AttentionUpdate = { taskId: number; needsAttention: boolean };
export type AttentionSubscriber = (update: AttentionUpdate) => void;

export class AttentionStateService {
  private state = new Map<number, boolean>();
  private subscribers = new Set<AttentionSubscriber>();

  setAttention(taskId: number, needs: boolean): void {
    const prev = this.state.get(taskId) ?? false;
    if (prev === needs) return;
    this.state.set(taskId, needs);
    this.notify({ taskId, needsAttention: needs });
  }

  getAttention(taskId: number): boolean {
    return this.state.get(taskId) ?? false;
  }

  listAttentionTasks(): number[] {
    return [...this.state.entries()]
      .filter(([, v]) => v)
      .map(([k]) => k);
  }

  clearTask(taskId: number): void {
    const prev = this.state.get(taskId);
    if (prev === undefined) return;
    this.state.delete(taskId);
    if (prev) {
      this.notify({ taskId, needsAttention: false });
    }
  }

  subscribe(cb: AttentionSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify(update: AttentionUpdate): void {
    for (const cb of this.subscribers) {
      cb(update);
    }
  }
}
```

- [ ] **Step 4: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/services/AttentionStateService.test.ts
```
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/services/AttentionStateService.ts tests/services/AttentionStateService.test.ts
git commit -m "feat: add AttentionStateService for tracking pending user attention per task"
```

---

## Task 3: claudeHookSettings 生成モジュール

**Files:**
- Create: `src/hooks/claudeHookSettings.ts`
- Test: `tests/hooks/claudeHookSettings.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/hooks/claudeHookSettings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureBoardHookSettings } from '../../src/hooks/claudeHookSettings';

describe('claudeHookSettings', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'board-hooks-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates a settings file with hook entries', async () => {
    const path = await ensureBoardHookSettings(tmp);
    expect(existsSync(path)).toBe(true);
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(json.hooks.PreToolUse[0].matcher).toBe('AskUserQuestion');
    expect(json.hooks.PostToolUse[0].matcher).toBe('AskUserQuestion');
    expect(json.hooks.Stop).toBeDefined();
  });

  it('hook commands include hook script absolute paths', async () => {
    const path = await ensureBoardHookSettings(tmp);
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    const preCmd = json.hooks.PreToolUse[0].hooks[0].command;
    expect(preCmd).toMatch(/hook-attention\.mjs/);
    expect(preCmd).toMatch(/^node \//);
  });

  it('returns the same path on subsequent calls', async () => {
    const p1 = await ensureBoardHookSettings(tmp);
    const p2 = await ensureBoardHookSettings(tmp);
    expect(p1).toBe(p2);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/hooks/claudeHookSettings.test.ts
```
Expected: FAIL（モジュールが存在しないエラー）

- [ ] **Step 3: 最小実装**

```typescript
// src/hooks/claudeHookSettings.ts
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const HOOK_DIR = (() => {
  if (typeof __dirname !== 'undefined') return __dirname;
  return fileURLToPath(new URL('.', import.meta.url));
})();

const ATTENTION_HOOK = resolve(HOOK_DIR, 'hook-attention.mjs');
const STOP_HOOK = resolve(HOOK_DIR, 'hook-stop.mjs');

const SETTINGS_FILE = 'board-hook-settings.json';

function buildSettings(): unknown {
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [
            { type: 'command', command: `node ${ATTENTION_HOOK} pre` },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [
            { type: 'command', command: `node ${ATTENTION_HOOK} post` },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            { type: 'command', command: `node ${STOP_HOOK}` },
          ],
        },
      ],
    },
  };
}

export async function ensureBoardHookSettings(dataDir: string): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const path = join(dataDir, SETTINGS_FILE);
  const desired = JSON.stringify(buildSettings(), null, 2);
  let existing: string | null = null;
  try {
    existing = await fs.readFile(path, 'utf-8');
  } catch {
    // ignore
  }
  if (existing !== desired) {
    await fs.writeFile(path, desired, 'utf-8');
  }
  return path;
}
```

- [ ] **Step 4: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/hooks/claudeHookSettings.test.ts
```
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/hooks/claudeHookSettings.ts tests/hooks/claudeHookSettings.test.ts
git commit -m "feat: add claudeHookSettings generator for board-dedicated hook config"
```

---

## Task 4: hook-attention.mjs スクリプト

**Files:**
- Create: `src/hooks/hook-attention.mjs`
- Test: `tests/hooks/hook-attention.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/hooks/hook-attention.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { resolve } from 'path';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-attention.mjs');

type Capture = { headers: Record<string, string | string[] | undefined>; body: unknown };

function makeServer(): Promise<{ server: Server; port: number; captured: Capture[] }> {
  return new Promise((resolveFn) => {
    const captured: Capture[] = [];
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        captured.push({ headers: req.headers, body: data ? JSON.parse(data) : null });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolveFn({ server, port: addr.port, captured });
      }
    });
  });
}

function runHook(args: string[], env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT, ...args], { env: { ...process.env, ...env } });
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

describe('hook-attention.mjs', () => {
  let svr: Awaited<ReturnType<typeof makeServer>>;

  beforeAll(async () => {
    svr = await makeServer();
  });

  afterAll(() => {
    svr.server.close();
  });

  it('posts state="needs" when invoked with "pre"', async () => {
    const code = await runHook(['pre'], {
      BOARD_TASK_ID: '42',
      BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
      BOARD_HOOK_TOKEN: 'token-abc',
    });
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.headers['x-hook-token']).toBe('token-abc');
    expect(last?.body).toEqual({ taskId: 42, state: 'needs' });
  });

  it('posts state="answered" when invoked with "post"', async () => {
    const code = await runHook(['post'], {
      BOARD_TASK_ID: '7',
      BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
      BOARD_HOOK_TOKEN: 'token-xyz',
    });
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.body).toEqual({ taskId: 7, state: 'answered' });
  });

  it('exits 0 even when API is unreachable', async () => {
    const code = await runHook(['pre'], {
      BOARD_TASK_ID: '1',
      BOARD_API_URL: 'http://127.0.0.1:1', // unused port
      BOARD_HOOK_TOKEN: 't',
    });
    expect(code).toBe(0);
  });

  it('exits 0 silently when env vars are missing', async () => {
    const code = await runHook(['pre'], {});
    expect(code).toBe(0);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/hooks/hook-attention.test.ts
```
Expected: FAIL（スクリプトが存在しない）

- [ ] **Step 3: 最小実装**

```javascript
// src/hooks/hook-attention.mjs
#!/usr/bin/env node

const argSubcmd = process.argv[2];
const taskIdRaw = process.env.BOARD_TASK_ID;
const apiUrl = process.env.BOARD_API_URL;
const token = process.env.BOARD_HOOK_TOKEN;

if (!taskIdRaw || !apiUrl || !token) {
  process.exit(0);
}

const state = argSubcmd === 'post' ? 'answered' : 'needs';
const taskId = Number(taskIdRaw);

if (!Number.isFinite(taskId)) {
  process.exit(0);
}

try {
  const res = await fetch(`${apiUrl}/api/internal/hooks/attention`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hook-token': token,
    },
    body: JSON.stringify({ taskId, state }),
  });
  if (!res.ok) {
    process.stderr.write(`hook-attention: API responded ${res.status}\n`);
  }
} catch (err) {
  process.stderr.write(`hook-attention: ${(err && err.message) || err}\n`);
}

process.exit(0);
```

- [ ] **Step 4: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/hooks/hook-attention.test.ts
```
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/hooks/hook-attention.mjs tests/hooks/hook-attention.test.ts
git commit -m "feat: add hook-attention.mjs to notify board on AskUserQuestion"
```

---

## Task 5: hook-stop.mjs スクリプト

**Files:**
- Create: `src/hooks/hook-stop.mjs`
- Test: `tests/hooks/hook-stop.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/hooks/hook-stop.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-stop.mjs');

type Capture = { url: string | undefined; body: unknown };

function makeServer(): Promise<{ server: Server; port: number; captured: Capture[] }> {
  return new Promise((resolveFn) => {
    const captured: Capture[] = [];
    const server = createServer((req, res) => {
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
        resolveFn({ server, port: addr.port, captured });
      }
    });
  });
}

function runHook(stdinJson: unknown, env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT], { env: { ...process.env, ...env } });
    proc.stdin.write(JSON.stringify(stdinJson));
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

describe('hook-stop.mjs', () => {
  let svr: Awaited<ReturnType<typeof makeServer>>;
  let tmp: string;

  beforeAll(async () => {
    svr = await makeServer();
  });

  afterAll(() => {
    svr.server.close();
  });

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hook-stop-'));
  });

  it('posts complete when last tool_use is not AskUserQuestion', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      }) + '\n',
    );
    const code = await runHook(
      { transcript_path: transcript, stop_reason: 'end_turn' },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      },
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 5, reason: 'complete' });
  });

  it('does NOT post when last tool_use is AskUserQuestion', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }] },
      }) + '\n',
    );
    const code = await runHook(
      { transcript_path: transcript, stop_reason: 'end_turn' },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      },
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when stop_reason is not end_turn', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(transcript, '');
    const code = await runHook(
      { transcript_path: transcript, stop_reason: 'tool_use' },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      },
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('exits 0 silently when transcript_path cannot be read', async () => {
    const code = await runHook(
      { transcript_path: '/nonexistent/path.jsonl', stop_reason: 'end_turn' },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      },
    );
    expect(code).toBe(0);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/hooks/hook-stop.test.ts
```
Expected: FAIL

- [ ] **Step 3: 最小実装**

```javascript
// src/hooks/hook-stop.mjs
#!/usr/bin/env node
import { promises as fs } from 'fs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

function findLastToolUseName(jsonl) {
  const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const item = content[j];
      if (item && item.type === 'tool_use' && typeof item.name === 'string') {
        return item.name;
      }
    }
  }
  return null;
}

async function main() {
  const taskIdRaw = process.env.BOARD_TASK_ID;
  const apiUrl = process.env.BOARD_API_URL;
  const token = process.env.BOARD_HOOK_TOKEN;
  if (!taskIdRaw || !apiUrl || !token) return;

  let payload;
  try {
    const stdin = await readStdin();
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  if (payload?.stop_reason !== 'end_turn') return;

  const transcriptPath = payload?.transcript_path;
  if (typeof transcriptPath !== 'string') return;

  let jsonl;
  try {
    jsonl = await fs.readFile(transcriptPath, 'utf-8');
  } catch (err) {
    process.stderr.write(`hook-stop: read transcript failed: ${err.message}\n`);
    return;
  }

  const lastTool = findLastToolUseName(jsonl);
  if (lastTool === 'AskUserQuestion') return;

  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId)) return;

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

await main();
process.exit(0);
```

- [ ] **Step 4: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/hooks/hook-stop.test.ts
```
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/hooks/hook-stop.mjs tests/hooks/hook-stop.test.ts
git commit -m "feat: add hook-stop.mjs to auto-terminate Claude on true completion"
```

---

## Task 6: PtySessionService に env 注入と --settings を追加

**Files:**
- Modify: `src/terminal/PtySessionService.ts`
- Modify: `tests/terminal/PtySessionService.test.ts`

- [ ] **Step 1: 既存テストファイルを開いて構造を確認**

```bash
cd /workspace && head -50 tests/terminal/PtySessionService.test.ts
```

- [ ] **Step 2: PtySessionService の現在のコンストラクタと startProcess を読む**

```bash
cd /workspace && grep -n "constructor\|startProcess" src/terminal/PtySessionService.ts | head -20
```

- [ ] **Step 3: 新規テストを追加（失敗）**

`tests/terminal/PtySessionService.test.ts` に以下のテストブロックを追加（既存の `describe` 内、または新規 `describe` ブロック）:

```typescript
import { AttentionStateService } from '../../src/services/AttentionStateService';

describe('PtySessionService - hook integration', () => {
  it('passes BOARD_TASK_ID, BOARD_API_URL, BOARD_HOOK_TOKEN to spawned process', async () => {
    const ptyMock = vi.fn();
    // pty.spawn の mock セットアップ（既存テストの mock パターンに従う）
    // ... existing mock setup ...

    const attention = new AttentionStateService();
    const svc = new PtySessionService(/* deps */, {
      boardApiUrl: 'http://127.0.0.1:9999',
      attentionStateService: attention,
      hookSettingsDataDir: '/tmp/test-hooks',
    });

    await svc.startProcess(123, 'prompt', 'run');
    expect(ptyMock).toHaveBeenCalled();
    const call = ptyMock.mock.calls[0];
    const env = call[2].env;
    expect(env.BOARD_TASK_ID).toBe('123');
    expect(env.BOARD_API_URL).toBe('http://127.0.0.1:9999');
    expect(env.BOARD_HOOK_TOKEN).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes --settings <path> in claude args', async () => {
    // ... mock setup ...
    const args = ptyMockCall[1];
    const idx = args.indexOf('--settings');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toMatch(/board-hook-settings\.json$/);
  });

  it('clearTask is called on stopProcess', async () => {
    const attention = new AttentionStateService();
    attention.setAttention(123, true);
    const svc = new PtySessionService(/* deps */, { attentionStateService: attention, /* ... */ });
    await svc.startProcess(123, 'prompt', 'run');
    svc.stopProcess(123);
    expect(attention.getAttention(123)).toBe(false);
  });
});
```

注: `// ... mock setup ...` 部分は既存テストの `pty` mock パターンを再利用する。`tests/terminal/PtySessionService.test.ts` の既存テストを参考に実装。

- [ ] **Step 4: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/terminal/PtySessionService.test.ts
```
Expected: FAIL

- [ ] **Step 5: PtySessionService にコンストラクタオプションを追加**

`src/terminal/PtySessionService.ts` のコンストラクタを変更：

```typescript
import { ensureBoardHookSettings } from '../hooks/claudeHookSettings';
import { getHookToken } from '../utils/hookToken';
import { AttentionStateService } from '../services/AttentionStateService';

export interface PtySessionServiceOptions {
  boardApiUrl: string;
  attentionStateService: AttentionStateService;
  hookSettingsDataDir: string;
}

export class PtySessionService {
  private boardApiUrl: string;
  private attentionStateService: AttentionStateService;
  private hookSettingsDataDir: string;
  private hookSettingsPath: string | null = null;

  constructor(/* existing deps */, options: PtySessionServiceOptions) {
    // 既存の代入...
    this.boardApiUrl = options.boardApiUrl;
    this.attentionStateService = options.attentionStateService;
    this.hookSettingsDataDir = options.hookSettingsDataDir;
  }

  // ...
}
```

- [ ] **Step 6: startProcess で env と args を組み立てる**

`startProcess` の `pty.spawn` 呼び出し前に追加：

```typescript
if (this.hookSettingsPath === null) {
  this.hookSettingsPath = await ensureBoardHookSettings(this.hookSettingsDataDir);
}

const env = {
  ...process.env,
  BOARD_TASK_ID: String(taskId),
  BOARD_API_URL: this.boardApiUrl,
  BOARD_HOOK_TOKEN: getHookToken(),
};

const args = [
  '--settings',
  this.hookSettingsPath,
  // 既存の args を続ける
];

const ptyProcess = pty.spawn('claude', args, {
  name: 'xterm-256color',
  cwd: workingDir,
  env,
  cols: 80,
  rows: 30,
});
```

- [ ] **Step 7: stopProcess に clearTask を追加**

```typescript
stopProcess(taskId: number): boolean {
  // 既存のkill処理...
  const result = /* existing */;
  this.attentionStateService.clearTask(taskId);
  return result;
}
```

`process exit` ハンドラ内（自然終了時）にも `this.attentionStateService.clearTask(taskId)` を追加。

- [ ] **Step 8: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/terminal/PtySessionService.test.ts
```
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/terminal/PtySessionService.ts tests/terminal/PtySessionService.test.ts
git commit -m "feat: inject hook env and --settings flag in PtySessionService"
```

---

## Task 7: boardRoutes に hook 受付ルートを追加

**Files:**
- Modify: `src/board/boardRoutes.ts`
- Modify: `tests/board/boardRoutes.test.ts`

- [ ] **Step 1: 既存の boardRoutes 構造とテストを確認**

```bash
cd /workspace && grep -n "registerClaudeRoutes\|app\.\(get\|post\)" src/board/boardRoutes.ts | head -20
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/board/boardRoutes.test.ts` に追加：

```typescript
import { AttentionStateService } from '../../src/services/AttentionStateService';
import { getHookToken } from '../../src/utils/hookToken';

describe('hook receiver routes', () => {
  it('POST /api/internal/hooks/attention returns 401 without token', async () => {
    const app = makeTestApp(); // 既存ヘルパ
    const res = await request(app)
      .post('/api/internal/hooks/attention')
      .send({ taskId: 1, state: 'needs' });
    expect(res.status).toBe(401);
  });

  it('POST /api/internal/hooks/attention updates state with valid token', async () => {
    const attention = new AttentionStateService();
    const app = makeTestAppWith({ attentionStateService: attention });
    const res = await request(app)
      .post('/api/internal/hooks/attention')
      .set('x-hook-token', getHookToken())
      .send({ taskId: 1, state: 'needs' });
    expect(res.status).toBe(200);
    expect(attention.getAttention(1)).toBe(true);
  });

  it('POST /api/internal/hooks/stop calls ptySessionService.stopProcess', async () => {
    const ptyStop = vi.fn();
    const app = makeTestAppWith({ ptySessionService: { stopProcess: ptyStop } });
    await request(app)
      .post('/api/internal/hooks/stop')
      .set('x-hook-token', getHookToken())
      .send({ taskId: 42, reason: 'complete' });
    expect(ptyStop).toHaveBeenCalledWith(42);
  });

  it('GET /api/attention/stream sends snapshot then updates', async () => {
    const attention = new AttentionStateService();
    attention.setAttention(1, true);
    const app = makeTestAppWith({ attentionStateService: attention });
    // SSE 受信テスト：最初のメッセージが snapshot で taskIds: [1]
    // ... SSE フレーム検証 ...
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/board/boardRoutes.test.ts
```
Expected: FAIL

- [ ] **Step 4: 認証ミドルウェアと hook ルートを追加**

`src/board/boardRoutes.ts` の `registerClaudeRoutes` または新規 `registerHookRoutes` 関数内：

```typescript
import { verifyHookToken } from '../utils/hookToken';
import { AttentionStateService } from '../services/AttentionStateService';

function requireHookToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-hook-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!verifyHookToken(token)) {
    res.status(401).end();
    return;
  }
  next();
}

export function registerHookRoutes(
  app: Express,
  deps: {
    attentionStateService: AttentionStateService;
    ptySessionService: { stopProcess: (taskId: number) => boolean };
  },
): void {
  app.post('/api/internal/hooks/attention', requireHookToken, (req, res) => {
    const { taskId, state } = req.body ?? {};
    const id = Number(taskId);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid taskId' });
      return;
    }
    deps.attentionStateService.setAttention(id, state === 'needs');
    res.json({ ok: true });
  });

  app.post('/api/internal/hooks/stop', requireHookToken, (req, res) => {
    const { taskId, reason } = req.body ?? {};
    const id = Number(taskId);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid taskId' });
      return;
    }
    if (reason === 'complete') {
      deps.ptySessionService.stopProcess(id);
    }
    res.json({ ok: true });
  });
}
```

- [ ] **Step 5: attention SSE ルートを追加**

```typescript
export function registerAttentionStreamRoute(
  app: Express,
  deps: { attentionStateService: AttentionStateService },
): void {
  app.get('/api/attention/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const initial = deps.attentionStateService.listAttentionTasks();
    res.write(`data: ${JSON.stringify({ type: 'snapshot', taskIds: initial })}\n\n`);

    const unsub = deps.attentionStateService.subscribe((s) => {
      res.write(`data: ${JSON.stringify({ type: 'update', ...s })}\n\n`);
    });

    req.on('close', () => unsub());
  });
}
```

- [ ] **Step 6: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/board/boardRoutes.test.ts
```
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/board/boardRoutes.ts tests/board/boardRoutes.test.ts
git commit -m "feat: add hook receiver routes and attention SSE stream"
```

---

## Task 8: server.ts で AttentionStateService を組み立てる

**Files:**
- Modify: `src/board/server.ts`

- [ ] **Step 1: 現在の server.ts を読む**

```bash
cd /workspace && cat src/board/server.ts
```

- [ ] **Step 2: AttentionStateService の生成と PtySessionService への注入を追加**

`src/board/server.ts` の起動関数内、PtySessionService 生成の前に：

```typescript
import { AttentionStateService } from '../services/AttentionStateService';
import { registerHookRoutes, registerAttentionStreamRoute } from './boardRoutes';
import { homedir } from 'os';
import { join } from 'path';

const attentionStateService = new AttentionStateService();
const hookSettingsDataDir = process.env.AGKAN_DATA_DIR
  ? join(process.env.AGKAN_DATA_DIR, 'board-hooks')
  : join(homedir(), '.agkan', 'board-hooks');
```

PtySessionService 生成箇所（既存）:

```typescript
const ptySessionService = new PtySessionService(/* existing */, {
  boardApiUrl: `http://127.0.0.1:${port}`,
  attentionStateService,
  hookSettingsDataDir,
});
```

注：`port` はlistening後に確定する。listenのコールバック内で PtySessionService を生成するか、`server.address()` で取得した port を遅延注入する設計に変更が必要な場合がある。

ルート登録：

```typescript
registerHookRoutes(app, { attentionStateService, ptySessionService });
registerAttentionStreamRoute(app, { attentionStateService });
```

- [ ] **Step 3: 既存のテストが通ることを確認**

```bash
cd /workspace && pnpm test tests/board/server.test.ts
```
Expected: PASS

- [ ] **Step 4: 手動起動確認**

```bash
cd /workspace && pnpm run build && timeout 5 node dist/cli/index.js board || true
```
Expected: 起動エラーなく listen を始める（5秒で timeout）

- [ ] **Step 5: コミット**

```bash
git add src/board/server.ts
git commit -m "feat: wire AttentionStateService and hook routes into board server"
```

---

## Task 9: クライアント `attentionIndicator.ts`

**Files:**
- Create: `src/board/client/attentionIndicator.ts`
- Test: `tests/board/client/attentionIndicator.test.ts` (既存に倣う)

- [ ] **Step 1: 既存のクライアント側テスト構造を確認**

```bash
cd /workspace && ls tests/board/client/ && head -30 tests/board/client/$(ls tests/board/client/ | head -1)
```

- [ ] **Step 2: 失敗するテストを書く**

```typescript
// tests/board/client/attentionIndicator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyAttention } from '../../../src/board/client/attentionIndicator';

describe('attentionIndicator.applyAttention', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(`
      <div data-task-id="1">
        <span class="attention-indicator"></span>
      </div>
    `);
    (global as any).document = dom.window.document;
  });

  it('inserts icon when needsAttention=true', () => {
    applyAttention(1, true);
    const slot = dom.window.document.querySelector('.attention-indicator');
    expect(slot?.classList.contains('is-active')).toBe(true);
    expect(slot?.innerHTML).toMatch(/icon-question/);
  });

  it('clears icon when needsAttention=false', () => {
    applyAttention(1, true);
    applyAttention(1, false);
    const slot = dom.window.document.querySelector('.attention-indicator');
    expect(slot?.classList.contains('is-active')).toBe(false);
    expect(slot?.innerHTML).toBe('');
  });

  it('is no-op when card is not present', () => {
    expect(() => applyAttention(999, true)).not.toThrow();
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

```bash
cd /workspace && pnpm test tests/board/client/attentionIndicator.test.ts
```
Expected: FAIL

- [ ] **Step 4: 実装**

```typescript
// src/board/client/attentionIndicator.ts
type AttentionMessage =
  | { type: 'snapshot'; taskIds: number[] }
  | { type: 'update'; taskId: number; needsAttention: boolean };

export function applyAttention(taskId: number, needs: boolean): void {
  const card = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  if (!card) return;
  const slot = card.querySelector<HTMLElement>('.attention-indicator');
  if (!slot) return;
  if (needs) {
    slot.innerHTML = '<span title="質問待ち" class="icon-question">❓</span>';
    slot.classList.add('is-active');
  } else {
    slot.innerHTML = '';
    slot.classList.remove('is-active');
  }
}

export function startAttentionStream(): () => void {
  const es = new EventSource('/api/attention/stream');
  es.onmessage = (e) => {
    let msg: AttentionMessage;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === 'snapshot') {
      msg.taskIds.forEach((id) => applyAttention(id, true));
    } else if (msg.type === 'update') {
      applyAttention(msg.taskId, msg.needsAttention);
    }
  };
  return () => es.close();
}
```

- [ ] **Step 5: テスト成功を確認**

```bash
cd /workspace && pnpm test tests/board/client/attentionIndicator.test.ts
```
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/board/client/attentionIndicator.ts tests/board/client/attentionIndicator.test.ts
git commit -m "feat: add attentionIndicator client module for SSE-driven icon updates"
```

---

## Task 10: card DOM にアイコンスロットを追加

**Files:**
- Modify: `src/board/client/card.ts` または該当のカード描画ファイル
- Modify: 必要なCSS（`src/board/client/styles/*.css` 等）

- [ ] **Step 1: カード描画箇所を特定**

```bash
cd /workspace && grep -rn "data-task-id" src/board/client/ | head -10
```

- [ ] **Step 2: ステータスインジケーター近傍にスロット要素を追加**

該当の描画関数内、status icon の隣に：

```typescript
// 既存の status indicator 出力の隣に
htmlParts.push('<span class="attention-indicator" aria-live="polite"></span>');
```

- [ ] **Step 3: CSS を追加**

該当のCSSファイルに：

```css
.attention-indicator {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  min-width: 14px;
  height: 14px;
}

.attention-indicator.is-active .icon-question {
  color: var(--color-warning, #f59e0b);
  animation: attention-pulse 1.5s ease-in-out infinite;
}

@keyframes attention-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 4: 既存のboardRendererテストが壊れていないことを確認**

```bash
cd /workspace && pnpm test tests/board/boardRenderer.test.ts
```
Expected: PASS（既存のテストが新スロット要素を許容しているか確認、必要なら期待値を更新）

- [ ] **Step 5: コミット**

```bash
git add src/board/client/card.ts src/board/client/**/*.css
git commit -m "feat: add attention-indicator slot to task card DOM"
```

---

## Task 11: クライアントエントリで attention stream を起動

**Files:**
- Modify: `src/board/client/main.ts` (または相当のエントリ)

- [ ] **Step 1: クライアントエントリファイルを特定**

```bash
cd /workspace && grep -rn "DOMContentLoaded\|startApp\|init(" src/board/client/ | head -10
```

- [ ] **Step 2: startAttentionStream を呼び出す**

エントリ関数の最後または初期化処理の中に：

```typescript
import { startAttentionStream } from './attentionIndicator';

// ... 既存の初期化 ...
startAttentionStream();
```

- [ ] **Step 3: ビルドと型チェック**

```bash
cd /workspace && pnpm run type-check && pnpm run build:client
```
Expected: 成功

- [ ] **Step 4: コミット**

```bash
git add src/board/client/main.ts
git commit -m "feat: start attention stream subscription on client init"
```

---

## Task 12: package.json に hook スクリプトを配布対象として追加

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 現在の files フィールドを確認**

```bash
cd /workspace && cat package.json | grep -A 10 '"files"'
```

- [ ] **Step 2: hook ファイルを含める**

`package.json` の `files` 配列に `dist/hooks/` のパターンを追加。`scripts/build-client.mjs` または `tsc` のビルド出力に hook-*.mjs が含まれるか確認し、必要なら別途コピー処理を `scripts/` に追加。

```json
{
  "files": [
    "dist/",
    "dist/hooks/hook-attention.mjs",
    "dist/hooks/hook-stop.mjs"
  ]
}
```

または `scripts/build-client.mjs` 同様のパターンで `scripts/build-hooks.mjs` を新設し `src/hooks/*.mjs` を `dist/hooks/` にコピー。`build` スクリプトを更新。

- [ ] **Step 3: ビルド確認**

```bash
cd /workspace && pnpm run build && ls dist/hooks/
```
Expected: `hook-attention.mjs`, `hook-stop.mjs`, `claudeHookSettings.js` が存在

- [ ] **Step 4: claudeHookSettings.ts の HOOK_DIR 解決をビルド出力に合わせる**

`src/hooks/claudeHookSettings.ts` の `HOOK_DIR` は `__dirname` ベース。ビルド後 `dist/hooks/claudeHookSettings.js` から `dist/hooks/hook-*.mjs` を解決する形になるため動作するはず。手動で実行確認：

```bash
cd /workspace && node -e "const m=require('./dist/hooks/claudeHookSettings.js'); m.ensureBoardHookSettings('/tmp/test-hooks').then(p=>{console.log(p);require('fs').readFile(p,'utf-8',(_,d)=>console.log(d));});"
```
Expected: パスが出力され、JSON 内の `command` パスが正しい絶対パス

- [ ] **Step 5: コミット**

```bash
git add package.json scripts/build-hooks.mjs
git commit -m "build: include hook scripts in npm package distribution"
```

---

## Task 13: E2E テスト

**Files:**
- Modify: `test-e2e.sh` (または `tests/e2e/`)
- Create: `tests/e2e/hook-attention.e2e.ts` (もしくはshell)

- [ ] **Step 1: 既存の e2e 構造を確認**

```bash
cd /workspace && cat test-e2e.sh && ls tests/e2e/
```

- [ ] **Step 2: E2E シナリオを設計**

シナリオ：
1. board を起動（テスト用ポート）
2. 偽の `claude` モック（hook を直接呼ぶシェルスクリプト）でタスク起動
3. PreToolUse hook を手動で発火 → `/api/attention/stream` で更新を観測
4. PostToolUse hook を手動で発火 → 状態がクリアされる
5. Stop hook を発火（transcript に AskUserQuestion なし）→ stopProcess が呼ばれる

または既存の e2e テスト形式（`tests/e2e/*.test.ts`）を踏襲：

```typescript
// tests/e2e/hook-attention.e2e.ts
// 既存の e2e パターンを使い、hook スクリプトを直接子プロセス起動して
// 動作を検証する統合テストを記述
```

- [ ] **Step 3: テスト実行**

```bash
cd /workspace && pnpm run test:e2e
```
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add tests/e2e/hook-attention.e2e.ts test-e2e.sh
git commit -m "test: add e2e for hook-driven attention and auto-exit"
```

---

## 最終確認

- [ ] **Step 1: 全テスト実行**

```bash
cd /workspace && pnpm run test:all
```
Expected: 全 PASS（型チェック・lint・unit・e2e）

- [ ] **Step 2: 手動受け入れ確認**

実環境で board を起動し、以下を確認：
1. AskUserQuestion を含むタスクを実行 → カードにアイコン表示
2. Terminal タブで返答 → アイコン消滅
3. 質問なしのタスク完了 → Claude CLI 自動終了 + 既存のステータス更新ロジック動作

- [ ] **Step 3: 既存機能の非回帰確認**

- 既存の Run Logs SSE が動作すること
- 既存のターミナル WebSocket が動作すること
- planning コマンド自動終了（task #502）が引き続き動作すること

- [ ] **Step 4: 最終コミット（必要に応じて）とPR作成**

```bash
cd /workspace && git push -u origin <branch>
gh pr create --title "feat: add Claude CLI user-attention detection and auto-exit via hooks" \
  --body "$(cat <<'EOF'
## Summary
- Add Claude Code hooks-based detection of AskUserQuestion to display a question icon on board task cards
- Auto-terminate Claude CLI when a turn completes without a pending user question

## Test plan
- [ ] All vitest unit tests pass
- [ ] e2e test covers hook→board→UI flow
- [ ] Manual: AskUserQuestion shows icon, terminal reply clears it, normal completion auto-exits
EOF
)"
```

---

## スコープ外（このプランでは扱わない）

- AskUserQuestion 以外のユーザー attention ツールの検知
- DBへの状態永続化
- 通知音・デスクトップ通知連携
- Cline SDK・OAuth・MCP の導入
