# Terminal-Based Claude Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stream-json Claude Code sessions with PTY-based interactive terminals displayed in the "● Details" modal for all commands (planning, run, PR)

**Architecture:** Add `PtySessionService` (node-pty) to replace `ClaudeProcessService` for process management. Add a WebSocket server (`wsTerminalServer`) for bidirectional terminal I/O. Replace the SSE-based `claude-stream-modal` with an xterm.js terminal modal in the frontend. Session continues when modal is closed; snapshot is replayed on reopen.

**Tech Stack:** node-pty (PTY spawn), ws (WebSocket server), @xterm/xterm + @xterm/addon-fit (frontend)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/terminal/PtySessionService.ts` | **Create** | PTY session lifecycle, snapshot buffer, DB log write |
| `src/terminal/wsTerminalServer.ts` | **Create** | WebSocket server for terminal I/O and resize |
| `src/board/client/claudeTerminalModal.ts` | **Create** | xterm.js modal — replaces claudeStreamModal.ts |
| `src/board/client/claudeStreamModal.ts` | **Delete** | No longer used |
| `src/board/server.ts` | Modify | Use PtySessionService; attach WS server to HTTP server |
| `src/board/boardRoutes.ts` | Modify | Use PtySessionService; remove `/stream` SSE endpoint |
| `src/board/boardRenderer.ts` | Modify | Replace stream modal HTML with terminal modal HTML |
| `src/board/boardStyles.ts` | Modify | Add terminal modal CSS; remove stream modal CSS |
| `src/board/client/main.ts` | Modify | Use terminal modal instead of stream modal |
| `scripts/build-client.mjs` | Modify | Output CSS alongside JS so xterm.css can be imported |
| `package.json` | Modify | Add node-pty, ws, @types/ws, @xterm/xterm, @xterm/addon-fit |

---

## Task 1: Add Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add runtime and dev dependencies**

```bash
pnpm add node-pty ws
pnpm add -D @types/ws @xterm/xterm @xterm/addon-fit
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('node-pty'); require('ws'); console.log('OK')"
```
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add node-pty, ws, xterm deps for PTY terminal sessions"
```

---

## Task 2: Create PtySessionService

**Files:**
- Create: `src/terminal/PtySessionService.ts`
- Create: `tests/terminal/PtySessionService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/terminal/PtySessionService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtySessionService } from '../../src/terminal/PtySessionService';
import { ConflictError } from '../../src/errors';

// Mock node-pty
const mockWrite = vi.fn();
const mockKill = vi.fn();
const mockResize = vi.fn();
let mockOnDataHandler: ((data: string) => void) | null = null;
let mockOnExitHandler: ((e: { exitCode: number }) => void) | null = null;

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    pid: 1234,
    write: mockWrite,
    kill: mockKill,
    resize: mockResize,
    onData: vi.fn((handler: (data: string) => void) => { mockOnDataHandler = handler; }),
    onExit: vi.fn((handler: (e: { exitCode: number }) => void) => { mockOnExitHandler = handler; }),
  })),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '/usr/local/bin/claude'),
}));

describe('PtySessionService', () => {
  let service: PtySessionService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWrite.mockClear();
    mockKill.mockClear();
    mockResize.mockClear();
    mockOnDataHandler = null;
    mockOnExitHandler = null;
    service = new PtySessionService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a PTY session and lists it as running', () => {
    service.startProcess(1, 'Task ID: 1\n/agkan-planning-subtask', 'planning');
    expect(service.listRunningTasks()).toEqual([{ taskId: 1, command: 'planning' }]);
  });

  it('throws ConflictError if session already running for taskId', () => {
    service.startProcess(1, 'prompt', 'run');
    expect(() => service.startProcess(1, 'prompt2', 'run')).toThrow(ConflictError);
  });

  it('auto-sends prompt after 1500ms delay', () => {
    service.startProcess(1, 'Task ID: 1\n/agkan-planning-subtask', 'planning');
    expect(mockWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockWrite).toHaveBeenCalledWith('Task ID: 1\n/agkan-planning-subtask\r');
  });

  it('buffers PTY output in snapshot', () => {
    service.startProcess(1, 'prompt', 'run');
    mockOnDataHandler?.('hello ');
    mockOnDataHandler?.('world');
    expect(service.getSnapshot(1)).toBe('hello world');
  });

  it('preserves snapshot after session exits', () => {
    service.startProcess(1, 'prompt', 'run');
    mockOnDataHandler?.('output text');
    mockOnExitHandler?.({ exitCode: 0 });
    expect(service.getSnapshot(1)).toBe('output text');
    expect(service.listRunningTasks()).toEqual([]);
  });

  it('stops a session and removes it from running tasks', () => {
    service.startProcess(1, 'prompt', 'run');
    const stopped = service.stopProcess(1);
    expect(stopped).toBe(true);
    expect(mockKill).toHaveBeenCalled();
    expect(service.listRunningTasks()).toEqual([]);
  });

  it('returns false when stopping non-existent session', () => {
    expect(service.stopProcess(999)).toBe(false);
  });

  it('notifies running tasks change subscribers on start and stop', () => {
    const cb = vi.fn();
    service.subscribeRunningTasksChange(cb);
    service.startProcess(1, 'prompt', 'run');
    expect(cb).toHaveBeenCalledTimes(1);
    service.stopProcess(1);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('notifies running tasks change on exit', () => {
    const cb = vi.fn();
    service.subscribeRunningTasksChange(cb);
    service.startProcess(1, 'prompt', 'run');
    cb.mockClear();
    mockOnExitHandler?.({ exitCode: 0 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscribeOutput delivers done event on exit', () => {
    service.startProcess(1, 'prompt', 'run');
    const events: unknown[] = [];
    service.subscribeOutput(1, (evt) => events.push(evt));
    mockOnExitHandler?.({ exitCode: 0 });
    expect(events).toEqual([{ kind: 'done', exitCode: 0 }]);
  });

  it('subscribeRawOutput delivers PTY data chunks', () => {
    service.startProcess(1, 'prompt', 'run');
    const chunks: string[] = [];
    service.subscribeRawOutput(1, (data) => chunks.push(data));
    mockOnDataHandler?.('chunk1');
    mockOnDataHandler?.('chunk2');
    expect(chunks).toEqual(['chunk1', 'chunk2']);
  });

  it('auto-confirms workspace trust prompt', () => {
    service.startProcess(1, 'prompt', 'run');
    vi.advanceTimersByTime(1500); // let initial prompt send
    mockWrite.mockClear();
    mockOnDataHandler?.('Do you trust the files in this folder?\n> Yes, I trust (y/n): ');
    expect(mockWrite).toHaveBeenCalledWith('y\r');
  });

  it('resizes PTY session', () => {
    service.startProcess(1, 'prompt', 'run');
    service.resize(1, 100, 30);
    expect(mockResize).toHaveBeenCalledWith(100, 30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/terminal/PtySessionService.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found

- [ ] **Step 3: Create PtySessionService**

Create `src/terminal/PtySessionService.ts`:

```typescript
import * as pty from 'node-pty';
import { execSync } from 'child_process';
import type { StorageBackend } from '../db/types/repository';
import type { RunLog } from '../services/ClaudeProcessService';
import type { RunLogRow } from '../db/types/repository';
import { ConflictError } from '../errors';

function resolveClaudePath(): string {
  try {
    return execSync('which claude', { env: process.env }).toString().trim() || 'claude';
  } catch {
    return 'claude';
  }
}

const CLAUDE_BIN = resolveClaudePath();
const INITIAL_PROMPT_DELAY_MS = 1500;
const MAX_SNAPSHOT_BYTES = 500_000;
const MAX_COMPLETED_SNAPSHOTS = 10;

type OutputEvent = { kind: 'done'; exitCode: number } | { kind: 'error'; message: string };
type SubscribeCallback = (event: OutputEvent) => void;

interface SessionInfo {
  taskId: number;
  command: string;
  ptyProcess: pty.IPty;
  startedAt: Date;
  outputBuffer: string;
  exitSubscribers: Set<SubscribeCallback>;
  rawOutputSubscribers: Set<(data: string) => void>;
  runLogId: number | null;
  initialPromptTimer: ReturnType<typeof setTimeout> | null;
  workspaceTrustHandled: boolean;
}

function hasWorkspaceTrustPrompt(text: string): boolean {
  return /trust.*folder|Do you trust/i.test(text) && /y\/n|yes.*trust/i.test(text);
}

export class PtySessionService {
  private sessions: Map<number, SessionInfo> = new Map();
  private completedSnapshots: Map<number, string> = new Map();
  private db: StorageBackend | null;
  private runningTasksChangeSubscribers: Set<() => void> = new Set();

  constructor(db?: StorageBackend | null) {
    this.db = db ?? null;
  }

  subscribeRunningTasksChange(callback: () => void): () => void {
    this.runningTasksChangeSubscribers.add(callback);
    return () => { this.runningTasksChangeSubscribers.delete(callback); };
  }

  private notifyRunningTasksChange(): void {
    this.runningTasksChangeSubscribers.forEach((cb) => cb());
  }

  startProcess(taskId: number, prompt: string, command = 'run', model?: string, effort?: string): void {
    if (this.sessions.has(taskId)) {
      throw new ConflictError(`Process for taskId ${taskId} is already running`);
    }

    const modelArgs = model ? ['--model', model] : [];
    const effortArgs = effort ? ['--effort', effort] : [];
    const args = [...modelArgs, ...effortArgs, '--dangerously-skip-permissions'];

    const ptyProcess = pty.spawn(CLAUDE_BIN, args, {
      name: 'xterm-256color',
      cols: 220,
      rows: 50,
      cwd: process.cwd(),
      env: {
        ...process.env,
        COLORTERM: 'truecolor',
        TERM: 'xterm-256color',
      },
    });

    const info: SessionInfo = {
      taskId,
      command,
      ptyProcess,
      startedAt: new Date(),
      outputBuffer: '',
      exitSubscribers: new Set(),
      rawOutputSubscribers: new Set(),
      runLogId: null,
      initialPromptTimer: null,
      workspaceTrustHandled: false,
    };

    this.sessions.set(taskId, info);
    this.notifyRunningTasksChange();

    if (this.db) {
      info.runLogId = this.db.runLogs.create(taskId, info.startedAt.toISOString());
    }

    // Auto-send initial prompt after Claude starts up
    info.initialPromptTimer = setTimeout(() => {
      info.initialPromptTimer = null;
      if (this.sessions.has(taskId)) {
        ptyProcess.write(prompt + '\r');
      }
    }, INITIAL_PROMPT_DELAY_MS);

    ptyProcess.onData((data: string) => {
      info.outputBuffer += data;
      if (info.outputBuffer.length > MAX_SNAPSHOT_BYTES) {
        info.outputBuffer = info.outputBuffer.slice(-MAX_SNAPSHOT_BYTES);
      }

      // Auto-confirm workspace trust
      if (!info.workspaceTrustHandled && hasWorkspaceTrustPrompt(info.outputBuffer)) {
        info.workspaceTrustHandled = true;
        ptyProcess.write('y\r');
      }

      info.rawOutputSubscribers.forEach((cb) => cb(data));
    });

    ptyProcess.onExit(({ exitCode }) => {
      const code = exitCode ?? 0;

      if (info.initialPromptTimer !== null) {
        clearTimeout(info.initialPromptTimer);
        info.initialPromptTimer = null;
      }

      if (this.db && info.runLogId) {
        const finishedAt = new Date().toISOString();
        const cleanText = info.outputBuffer.replace(/\x1b\[[0-9;]*[mGKHFJlh]/g, '');
        const events = JSON.stringify([{ kind: 'text', text: cleanText }]);
        this.db.runLogs.updateFinished(info.runLogId, finishedAt, code, events);
        const ids = this.db.runLogs.findIdsByTaskId(taskId);
        if (ids.length > 5) {
          this.db.runLogs.deleteMany(ids.slice(5));
        }
      }

      this.completedSnapshots.set(taskId, info.outputBuffer);
      if (this.completedSnapshots.size > MAX_COMPLETED_SNAPSHOTS) {
        const firstKey = this.completedSnapshots.keys().next().value!;
        this.completedSnapshots.delete(firstKey);
      }

      const doneEvent: OutputEvent = { kind: 'done', exitCode: code };
      info.exitSubscribers.forEach((cb) => cb(doneEvent));

      if (this.sessions.get(taskId) === info) {
        this.sessions.delete(taskId);
        this.notifyRunningTasksChange();
      }
    });
  }

  stopProcess(taskId: number): boolean {
    const info = this.sessions.get(taskId);
    if (!info) return false;
    if (info.initialPromptTimer !== null) {
      clearTimeout(info.initialPromptTimer);
      info.initialPromptTimer = null;
    }
    info.ptyProcess.kill();
    this.sessions.delete(taskId);
    this.notifyRunningTasksChange();
    return true;
  }

  listRunningTasks(): { taskId: number; command: string }[] {
    return Array.from(this.sessions.values()).map((s) => ({ taskId: s.taskId, command: s.command }));
  }

  getSnapshot(taskId: number): string {
    return this.sessions.get(taskId)?.outputBuffer ?? this.completedSnapshots.get(taskId) ?? '';
  }

  subscribeOutput(taskId: number, callback: SubscribeCallback): () => void {
    const info = this.sessions.get(taskId);
    if (!info) {
      if (this.db) {
        const row = this.db.runLogs.findLatestByTaskId(taskId);
        if (row) {
          callback({ kind: 'done', exitCode: row.exit_code ?? 0 });
          return () => {};
        }
      }
      return () => {};
    }
    info.exitSubscribers.add(callback);
    return () => { info.exitSubscribers.delete(callback); };
  }

  subscribeRawOutput(taskId: number, callback: (data: string) => void): () => void {
    const info = this.sessions.get(taskId);
    if (!info) return () => {};
    info.rawOutputSubscribers.add(callback);
    return () => { info.rawOutputSubscribers.delete(callback); };
  }

  resize(taskId: number, cols: number, rows: number): void {
    this.sessions.get(taskId)?.ptyProcess.resize(cols, rows);
  }

  writeInput(taskId: number, data: string): void {
    this.sessions.get(taskId)?.ptyProcess.write(data);
  }

  getRunLogs(taskId: number): RunLog[] {
    if (!this.db) return [];
    const rows = this.db.runLogs.findByTaskId(taskId, 5);
    return rows.map((r: RunLogRow) => ({
      id: r.id,
      task_id: r.task_id,
      started_at: r.started_at,
      finished_at: r.finished_at,
      exit_code: r.exit_code,
      session_id: r.session_id,
      events: JSON.parse(r.events) as unknown[],
    }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/terminal/PtySessionService.test.ts 2>&1 | tail -20
```
Expected: All tests PASS

- [ ] **Step 5: Run type check**

```bash
pnpm type-check 2>&1 | grep -E "error|warning" | head -20
```
Expected: no errors in new files

- [ ] **Step 6: Commit**

```bash
git add src/terminal/PtySessionService.ts tests/terminal/PtySessionService.test.ts
git commit -m "feat: add PtySessionService for PTY-based Claude Code sessions"
```

---

## Task 3: Create WebSocket Terminal Server

**Files:**
- Create: `src/terminal/wsTerminalServer.ts`

- [ ] **Step 1: Write failing test**

Create `tests/terminal/wsTerminalServer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTerminalWsServer } from '../../src/terminal/wsTerminalServer';

// Minimal mock PtySessionService for interface check
const mockService = {
  getSnapshot: vi.fn(() => 'snapshot data'),
  subscribeRawOutput: vi.fn(() => vi.fn()),
  writeInput: vi.fn(),
  resize: vi.fn(),
};

describe('createTerminalWsServer', () => {
  it('exports a handleUpgrade function', () => {
    const server = createTerminalWsServer(mockService as never);
    expect(typeof server.handleUpgrade).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/terminal/wsTerminalServer.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found

- [ ] **Step 3: Create wsTerminalServer**

Create `src/terminal/wsTerminalServer.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { PtySessionService } from './PtySessionService';

function parseTaskId(url: string | undefined, suffix: 'io' | 'control'): number | null {
  if (!url) return null;
  const m = url.match(/\/api\/terminal\/(\d+)\/(io|control)/);
  if (!m || m[2] !== suffix) return null;
  const id = Number(m[1]);
  return isNaN(id) ? null : id;
}

export function createTerminalWsServer(ptyService: PtySessionService): {
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
} {
  const ioServer = new WebSocketServer({ noServer: true });
  const controlServer = new WebSocketServer({ noServer: true });

  ioServer.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const taskId = parseTaskId(req.url, 'io');
    if (taskId === null) {
      ws.close(1008, 'Invalid taskId');
      return;
    }

    const snapshot = ptyService.getSnapshot(taskId);
    if (snapshot && ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.from(snapshot));
    }

    const unsub = ptyService.subscribeRawOutput(taskId, (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from(data));
      }
    });

    ws.on('message', (msg: Buffer | string) => {
      const text = typeof msg === 'string' ? msg : msg.toString('utf8');
      ptyService.writeInput(taskId, text);
    });

    ws.on('close', () => { unsub(); });
    ws.on('error', () => { unsub(); });
  });

  controlServer.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const taskId = parseTaskId(req.url, 'control');
    if (taskId === null) {
      ws.close(1008, 'Invalid taskId');
      return;
    }

    ws.on('message', (msg: Buffer | string) => {
      try {
        const text = typeof msg === 'string' ? msg : msg.toString('utf8');
        const data = JSON.parse(text) as { type: string; cols?: number; rows?: number };
        if (data.type === 'resize' && typeof data.cols === 'number' && typeof data.rows === 'number') {
          ptyService.resize(taskId, data.cols, data.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  return {
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
      const url = req.url ?? '';
      if (url.includes('/io')) {
        ioServer.handleUpgrade(req, socket as never, head, (ws) => {
          ioServer.emit('connection', ws, req);
        });
      } else if (url.includes('/control')) {
        controlServer.handleUpgrade(req, socket as never, head, (ws) => {
          controlServer.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/terminal/wsTerminalServer.test.ts 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/wsTerminalServer.ts tests/terminal/wsTerminalServer.test.ts
git commit -m "feat: add WebSocket terminal server for PTY I/O relay"
```

---

## Task 4: Update Build Config for CSS Output

**Files:**
- Modify: `scripts/build-client.mjs`
- Modify: `src/board/boardRenderer.ts` — change `board.js` → `main.js`, add CSS link
- Modify: `src/board/boardRoutes.ts` — rename static route, add CSS route

The xterm.js package requires its CSS. We switch esbuild from `outfile` (→ `board.js`) to `outdir` (→ `main.js` + `main.css`).

- [ ] **Step 1: Update build-client.mjs to output CSS**

Replace `scripts/build-client.mjs` with:

```javascript
#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

await mkdir(join(rootDir, 'dist', 'board', 'client'), { recursive: true });

await esbuild.build({
  entryPoints: [join(rootDir, 'src', 'board', 'client', 'main.ts')],
  bundle: true,
  minify: false,
  format: 'iife',
  outdir: join(rootDir, 'dist', 'board', 'client'),
  target: ['es2020'],
  logLevel: 'info',
});
```

- [ ] **Step 2: Update boardRenderer.ts — fix script path, add CSS link**

In `src/board/boardRenderer.ts`, find this line at the end of the HTML string (around line 222):

```typescript
  <script src="/static/board.js"></script>\`;
```

Replace with:

```typescript
  <link rel="stylesheet" href="/static/main.css">
  <script src="/static/main.js"></script>\`;
```

- [ ] **Step 3: Update boardRoutes.ts — rename JS route, add CSS route**

In `src/board/boardRoutes.ts`, find the `/static/board.js` route (around line 681):

```typescript
  app.get('/static/board.js', (c) => {
    const candidates = [
      path.join(__dirname, 'client', 'board.js'),
      path.join(__dirname, '..', '..', 'dist', 'board', 'client', 'board.js'),
    ];
```

Replace with:

```typescript
  app.get('/static/main.js', (c) => {
    const candidates = [
      path.join(__dirname, 'client', 'main.js'),
      path.join(__dirname, '..', '..', 'dist', 'board', 'client', 'main.js'),
    ];
```

After that route's closing `});`, add a CSS route:

```typescript
  app.get('/static/main.css', (c) => {
    const candidates = [
      path.join(__dirname, 'client', 'main.css'),
      path.join(__dirname, '..', '..', 'dist', 'board', 'client', 'main.css'),
    ];
    for (const p of candidates) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return new Response(content, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
      } catch { /* try next */ }
    }
    return new Response('', { headers: { 'Content-Type': 'text/css' } });
  });
```

- [ ] **Step 4: Verify build works and outputs CSS**

```bash
pnpm build:client 2>&1 | tail -10
ls dist/board/client/
```
Expected: `main.js` present (CSS appears after xterm import is added in Task 8)

- [ ] **Step 5: Commit**

```bash
git add scripts/build-client.mjs src/board/boardRenderer.ts src/board/boardRoutes.ts
git commit -m "chore: update esbuild config to output CSS for xterm support"
```

---

## Task 5: Update server.ts to Use PtySessionService and Attach WebSocket Server

**Files:**
- Modify: `src/board/server.ts`

- [ ] **Step 1: Update server.ts**

Read `src/board/server.ts`, then replace its content with:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from 'http';
import path from 'path';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { TagService } from '../services/TagService';
import { MetadataService } from '../services/MetadataService';
import { CommentService } from '../services/CommentService';
import { TaskBlockService } from '../services/TaskBlockService';
import { PtySessionService } from '../terminal/PtySessionService';
import { createTerminalWsServer } from '../terminal/wsTerminalServer';
import { getStorageBackend } from '../db/connection';
import { StorageBackend } from '../db/types/repository';
import { getDefaultDirName } from '../db/config';
import { registerBoardRoutes, BoardServices } from './boardRoutes';

export function createBoardApp(
  taskService?: TaskService,
  taskTagService?: TaskTagService,
  metadataService?: MetadataService,
  db?: StorageBackend,
  boardTitle?: string,
  tagService?: TagService,
  configDir?: string,
  commentService?: CommentService,
  taskBlockService?: TaskBlockService,
  ptySessionService?: PtySessionService
): Hono {
  const app = new Hono();
  const resolvedConfigDir = configDir ?? path.join(process.cwd(), getDefaultDirName());
  const resolvedDb = db ?? getStorageBackend();
  const services: BoardServices = {
    ts: taskService ?? new TaskService(resolvedDb),
    tts: taskTagService ?? new TaskTagService(resolvedDb),
    tags: tagService ?? new TagService(resolvedDb),
    ms: metadataService ?? new MetadataService(resolvedDb),
    cs: commentService ?? new CommentService(resolvedDb),
    tbs: taskBlockService ?? new TaskBlockService(resolvedDb),
    database: resolvedDb,
    boardTitle,
    configDir: resolvedConfigDir,
    ptySessionService,
  };
  registerBoardRoutes(app, services);
  return app;
}

export function startBoardServer(port: number, boardTitle?: string): void {
  const resolvedDb = getStorageBackend();
  const ptyService = new PtySessionService(resolvedDb);
  const app = createBoardApp(
    undefined, undefined, undefined,
    resolvedDb, boardTitle,
    undefined, undefined, undefined, undefined,
    ptyService
  );

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }) as Server;

  const { handleUpgrade } = createTerminalWsServer(ptyService);
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/api/terminal/')) {
      handleUpgrade(req, socket, head);
    }
  });
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm type-check 2>&1 | grep -E "error" | head -20
```
Expected: Errors only about BoardServices missing `ptySessionService` (will fix next task)

- [ ] **Step 3: Commit once boardRoutes is updated (hold this commit until Task 6 passes)**

---

## Task 6: Update boardRoutes.ts to Use PtySessionService

**Files:**
- Modify: `src/board/boardRoutes.ts`

- [ ] **Step 1: Update BoardServices type and import**

In `src/board/boardRoutes.ts`:

Replace:
```typescript
import { ClaudeProcessService } from '../services/ClaudeProcessService';
```
With:
```typescript
import { PtySessionService } from '../terminal/PtySessionService';
```

Replace in `BoardServices` type:
```typescript
claudeProcessService?: ClaudeProcessService;
```
With:
```typescript
ptySessionService?: PtySessionService;
```

- [ ] **Step 2: Update registerClaudeRoutes to use PtySessionService**

In `registerClaudeRoutes`, replace:
```typescript
const claudeProcess = services.claudeProcessService!;
```
With:
```typescript
const claudeProcess = services.ptySessionService!;
```

- [ ] **Step 3: Remove the /stream SSE endpoint**

In `registerClaudeRoutes`, delete the entire `app.get('/api/claude/tasks/:taskId/stream', ...)` block (lines ~505–555 in original). This endpoint is no longer used — the terminal modal uses WebSocket instead.

- [ ] **Step 4: Update the run/pr status subscription to use exit-only events**

The POST /run handler currently uses `subscribeOutput` to detect `done` events. `PtySessionService.subscribeOutput` now only emits `{ kind: 'done', exitCode }` — the existing check still works:

```typescript
// This code works unchanged since we still emit done events:
const unsubscribe = claudeProcess.subscribeOutput(taskId, (evt) => {
  if (evt.kind === 'done' && evt.exitCode === 0) {
    ts.updateTask(taskId, { status: targetStatus });
  }
  if (evt.kind === 'done' || evt.kind === 'error') {
    unsubscribe();
  }
});
```

No change needed here.

- [ ] **Step 5: Run type check**

```bash
pnpm type-check 2>&1 | grep error | head -20
```
Expected: No TypeScript errors

- [ ] **Step 6: Run unit tests**

```bash
pnpm vitest run tests/ 2>&1 | tail -30
```
Expected: All tests that were previously passing still pass (boardRoutes tests may need mocks updated — see step 7)

- [ ] **Step 7: Update boardRoutes tests to mock PtySessionService**

Find test files that mock `ClaudeProcessService`:

```bash
grep -rl "ClaudeProcessService\|claudeProcessService" tests/
```

For each file found, update the mock import path from `'../../src/services/ClaudeProcessService'` to `'../../src/terminal/PtySessionService'` and the service key from `claudeProcessService` to `ptySessionService` in the test setup.

- [ ] **Step 8: Run all tests again**

```bash
pnpm vitest run 2>&1 | tail -30
```
Expected: All tests PASS

- [ ] **Step 9: Commit server.ts and boardRoutes.ts together**

```bash
git add src/board/server.ts src/board/boardRoutes.ts tests/
git commit -m "feat: switch board server to PtySessionService for interactive Claude sessions"
```

---

## Task 7: Update boardRenderer.ts and boardStyles.ts

Replace the stream modal HTML and CSS with terminal modal HTML and CSS.

**Files:**
- Modify: `src/board/boardRenderer.ts`
- Modify: `src/board/boardStyles.ts`

- [ ] **Step 1: Replace getClaudeStreamModal HTML in boardRenderer.ts**

Find `function getClaudeStreamModal()` in `src/board/boardRenderer.ts` and replace the entire function:

```typescript
function getClaudeTerminalModal(): string {
  return `
  <div class="modal-overlay" id="claude-terminal-modal">
    <div class="modal claude-terminal-modal-inner">
      <div class="claude-stream-modal-header">
        <h2 id="claude-terminal-title">Claude Terminal</h2>
        <button id="claude-terminal-modal-close">&#x2715;</button>
      </div>
      <div id="claude-terminal-container"></div>
      <div class="claude-stream-modal-footer">
        <button id="claude-terminal-stop-btn" class="claude-stream-stop-btn">Stop</button>
        <button id="claude-terminal-close-btn">Close</button>
      </div>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Update call site in renderBoard**

Find `getClaudeStreamModal()` call in `renderBoard` (or wherever it's called) and replace with `getClaudeTerminalModal()`.

- [ ] **Step 3: Add terminal modal CSS to boardStyles.ts**

In `src/board/boardStyles.ts`, find the `.claude-stream-modal-header` and `.claude-stream-log` CSS block and append the following new rules (keep existing stream CSS for backward compat with run logs display):

```typescript
// Add to BOARD_STYLES string, after existing claude-stream styles:
    .claude-terminal-modal-inner { width: 900px; height: 600px; display: flex; flex-direction: column; padding: 16px; }
    #claude-terminal-container { flex: 1; min-height: 0; border-radius: 6px; overflow: hidden; }
```

- [ ] **Step 4: Build and verify no errors**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -10
```
Expected: Build succeeds, no errors

- [ ] **Step 5: Commit**

```bash
git add src/board/boardRenderer.ts src/board/boardStyles.ts
git commit -m "feat: replace stream modal HTML/CSS with xterm.js terminal modal"
```

---

## Task 8: Create Frontend Terminal Modal (claudeTerminalModal.ts)

**Files:**
- Create: `src/board/client/claudeTerminalModal.ts`
- Modify: `src/board/client/main.ts`
- Delete: `src/board/client/claudeStreamModal.ts`

- [ ] **Step 1: Create claudeTerminalModal.ts**

Create `src/board/client/claudeTerminalModal.ts`:

```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

let _terminal: Terminal | null = null;
let _fitAddon: FitAddon | null = null;
let _ioWs: WebSocket | null = null;
let _controlWs: WebSocket | null = null;
let _currentTaskId: number | null = null;
let _resizeObserver: ResizeObserver | null = null;
let _inputDisposable: { dispose(): void } | null = null;
let _claudeButtonUpdateCallback: (() => void) | null = null;

export function registerClaudeButtonUpdateCallback(cb: () => void): void {
  _claudeButtonUpdateCallback = cb;
}

function getModalElements() {
  return {
    overlay: document.getElementById('claude-terminal-modal') as HTMLElement | null,
    title: document.getElementById('claude-terminal-title') as HTMLElement | null,
    container: document.getElementById('claude-terminal-container') as HTMLElement | null,
    stopBtn: document.getElementById('claude-terminal-stop-btn') as HTMLButtonElement | null,
    closeBtn: document.getElementById('claude-terminal-close-btn') as HTMLButtonElement | null,
    modalClose: document.getElementById('claude-terminal-modal-close') as HTMLButtonElement | null,
  };
}

function closeWebSockets(): void {
  _ioWs?.close();
  _ioWs = null;
  _controlWs?.close();
  _controlWs = null;
}

export function closeClaudeTerminalModal(): void {
  closeWebSockets();
  _resizeObserver?.disconnect();
  _resizeObserver = null;
  const { overlay } = getModalElements();
  overlay?.classList.remove('show');
}

export function openClaudeTerminalModal(taskId: number): void {
  closeWebSockets();
  _currentTaskId = taskId;

  const { overlay, title, container, stopBtn } = getModalElements();
  if (!overlay || !container) return;

  title!.textContent = `Claude Terminal #${taskId}`;
  stopBtn!.disabled = false;
  stopBtn!.textContent = 'Stop';
  overlay.classList.add('show');

  // Initialize xterm.js terminal once; reuse across modal open/close
  if (!_terminal) {
    _terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#e6edf3',
        selectionBackground: 'rgba(100,150,255,0.3)',
      },
      scrollback: 5000,
    });
    _fitAddon = new FitAddon();
    _terminal.loadAddon(_fitAddon);
    _terminal.open(container);
    _fitAddon.fit();
  } else {
    // Reattach to container in case it was detached
    _terminal.reset();
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${location.host}`;

  _ioWs = new WebSocket(`${base}/api/terminal/${taskId}/io`);
  _ioWs.binaryType = 'arraybuffer';

  _ioWs.onmessage = (e) => {
    const data =
      e.data instanceof ArrayBuffer
        ? new TextDecoder().decode(e.data)
        : (e.data as string);
    _terminal?.write(data);
  };

  _ioWs.onerror = () => {
    _terminal?.write('\r\n[Connection error]\r\n');
  };

  // Forward user keystrokes to PTY
  _inputDisposable?.dispose();
  _inputDisposable = _terminal.onData((data) => {
    if (_ioWs?.readyState === WebSocket.OPEN) {
      _ioWs.send(data);
    }
  });

  // Control WebSocket for terminal resize
  _controlWs = new WebSocket(`${base}/api/terminal/${taskId}/control`);

  const sendResize = () => {
    _fitAddon?.fit();
    if (_controlWs?.readyState === WebSocket.OPEN && _terminal) {
      const { cols, rows } = _terminal;
      _controlWs.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  };

  _resizeObserver?.disconnect();
  _resizeObserver = new ResizeObserver(sendResize);
  _resizeObserver.observe(container);

  _controlWs.onopen = () => { sendResize(); };
}

async function handleStop(): Promise<void> {
  if (_currentTaskId === null) return;
  const { stopBtn } = getModalElements();
  if (stopBtn) {
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';
  }
  try {
    await fetch(`/api/claude/tasks/${_currentTaskId}/run`, { method: 'DELETE' });
  } catch {
    // Ignore network errors
  }
  if (_claudeButtonUpdateCallback) _claudeButtonUpdateCallback();
}

export function initClaudeTerminalModal(): void {
  const { overlay, stopBtn, closeBtn, modalClose } = getModalElements();

  modalClose?.addEventListener('click', () => closeClaudeTerminalModal());
  closeBtn?.addEventListener('click', () => closeClaudeTerminalModal());
  stopBtn?.addEventListener('click', () => { void handleStop(); });
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeClaudeTerminalModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('show')) {
      closeClaudeTerminalModal();
    }
  });
}
```

- [ ] **Step 2: Update main.ts to use terminal modal**

Replace in `src/board/client/main.ts`:

```typescript
// Remove these lines:
import { initClaudeStreamModal, openClaudeStreamModal, registerClaudeButtonUpdateCallback } from './claudeStreamModal';

// Add these lines:
import { initClaudeTerminalModal, openClaudeTerminalModal, registerClaudeButtonUpdateCallback } from './claudeTerminalModal';
```

Replace:
```typescript
initClaudeStreamModal();
registerClaudeModalCallback(openClaudeStreamModal);
registerClaudeButtonUpdateCallback(() => {
  updateButtonStates(new Set());
});
```
With:
```typescript
initClaudeTerminalModal();
registerClaudeModalCallback(openClaudeTerminalModal);
registerClaudeButtonUpdateCallback(() => {
  updateButtonStates(new Set());
});
```

- [ ] **Step 3: Delete claudeStreamModal.ts**

```bash
git rm src/board/client/claudeStreamModal.ts
```

- [ ] **Step 4: Build and verify no TypeScript errors**

```bash
pnpm build 2>&1 | grep -E "^.*error" | head -20
```
Expected: Build succeeds with no errors; `dist/board/client/` contains `main.js` and `main.css`

- [ ] **Step 5: Run full test suite**

```bash
pnpm vitest run 2>&1 | tail -30
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/board/client/claudeTerminalModal.ts src/board/client/main.ts
git commit -m "feat: add xterm.js terminal modal, replace SSE stream modal"
```

---

## Task 9: Manual Smoke Test

No automated test covers the full E2E flow. Verify by hand before marking done.

- [ ] **Step 1: Start the board server**

```bash
pnpm build && node -e "
const { startBoardServer } = require('./dist/board/server.js');
startBoardServer(3000);
"
```

Or if the CLI is the entry point:

```bash
pnpm build && node dist/cli/index.js board --port 3000
```

- [ ] **Step 2: Open browser at http://localhost:3000**

Verify board loads without JS errors in console.

- [ ] **Step 3: Test Planning button**

1. Find a task in Backlog status
2. Click **📋 Planning** — button should change to **● Details**
3. Click **● Details** — terminal modal should open
4. Verify xterm.js terminal appears with Claude Code output
5. Verify user can type in the terminal (cursor moves, keystrokes appear)
6. Close modal by clicking ✕ — modal closes, session continues
7. Click **● Details** again — modal reopens with previous output (snapshot restored)

- [ ] **Step 4: Test Run button**

1. Find a task in Ready or In Progress status
2. Click **▶ Run** — button changes to **● Details**
3. Click **● Details** — terminal modal opens with Claude Code output
4. Let Claude finish — verify task status updates to `done`

- [ ] **Step 5: Test Stop button**

1. Start a planning session
2. Open details modal
3. Click **Stop** button — Claude process is killed, button shows "Stopping..."
4. Verify **● Details** button turns back to the appropriate Run/Plan button

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: address issues found during smoke testing"
```

---

## Task 10: Clean Up boardRoutes.ts Test Mocks

Update any existing boardRoutes integration tests that still reference `ClaudeProcessService`.

**Files:**
- Modify: any test files found in step below

- [ ] **Step 1: Find tests referencing old service**

```bash
grep -rl "ClaudeProcessService\|claudeProcessService\|claude-stream" tests/ src/
```

- [ ] **Step 2: Update each file**

For each file found, update:
- Import `PtySessionService` from `'../../src/terminal/PtySessionService'` (adjust path as needed)
- Change `claudeProcessService` key to `ptySessionService` in BoardServices objects
- Replace mock of `subscribeOutput` to only emit `{ kind: 'done', exitCode: 0 }` events
- Remove any references to `claude-stream-modal` in HTML snapshot tests

- [ ] **Step 3: Run full tests**

```bash
pnpm vitest run 2>&1 | tail -30
```
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update mocks from ClaudeProcessService to PtySessionService"
```
