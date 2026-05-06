# Claude CLI ユーザー質問検知と自動終了機構

## 概要

board上のタスク実行で `claude` CLI を起動した際、Claude が `AskUserQuestion` ツールを使ってユーザーに質問している状態を検知し、boardのタスクカードにアイコンで表示する。質問が無く処理が完了している場合は Claude CLI を自動終了させる。

検知には Claude Code の Hooks 機構を利用する。Cline SDK の思想（user_attention 検知）を借りつつ、Claude CLI 固有の機能（hooks）で実現する。

## 動機

- 現在の `PtySessionService` は PTY の生出力のみを扱うため、Claude が質問待ちか完了したかを区別できない。
- Claude CLI の Stop hook 入力には `stop_reason` フィールドは存在せず、ユーザー質問待ちと通常完了の区別もペイロード単独では不可能。
- transcript ファイルを Stop hook から検査すれば、最後の `tool_use` が `AskUserQuestion` か否かを判定でき、質問中か完了かを区別できる。
- Cline SDK は Cline 独自エージェントの構造化イベント (`ask_followup_question` ツール) で同等の判定を行っており、Claude CLI に直接移植は不可。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ board (Node.js)                                             │
│                                                             │
│  PtySessionService.startProcess(taskId)                     │
│   ├ env: BOARD_TASK_ID, BOARD_API_URL, BOARD_HOOK_TOKEN     │
│   └ args: claude --settings <board-hook-settings.json>      │
│                                                             │
│  Hook API (Express routes)                                  │
│   POST /api/internal/hooks/attention   (token認証)          │
│   POST /api/internal/hooks/stop        (token認証)          │
│                                                             │
│  AttentionStateService (in-memory Map<taskId, boolean>)     │
│   └ subscribers (SSE)                                       │
│                                                             │
│  GET /api/attention/stream             (UI SSE購読)         │
└─────────────────────────────────────────────────────────────┘
                              ↑ HTTP (localhost)
┌─────────────────────────────────────────────────────────────┐
│ claude CLI (PTY child process)                              │
│   --settings <board-hook-settings.json>                     │
│                                                             │
│   PreToolUse(AskUserQuestion)  → hook-attention.mjs pre     │
│   PostToolUse(AskUserQuestion) → hook-attention.mjs post    │
│   Stop                          → hook-stop.mjs              │
└─────────────────────────────────────────────────────────────┘
```

## 設計上の決定事項

| 項目 | 採用案 | 理由 |
|---|---|---|
| taskId 伝達 | 環境変数 `BOARD_TASK_ID` | シンプルで確実 |
| settings 配置 | board専用ファイル (`--settings <path>`) | プロジェクトの `.claude/settings.json` を汚さない |
| 完了判定 | transcript の最後の `tool_use` 検査 | Stop hook 入力に `stop_reason` 等の判定材料が無いため、`AskUserQuestion` か否かで質問中 / 完了を確定判定 |
| hook 認証 | 起動時トークン (`BOARD_HOOK_TOKEN`) | board再起動毎に再生成、漏洩リスク最小化 |
| 自動終了 | board経由で `PtySessionService.stopProcess` | 既存のexit_codeサブスクリプションを再利用 |
| アイコン位置 | ステータスインジケーター付近 | 既存の `claudeButton` 表示と並ぶ |
| API失敗時 | stderrログのみ、Claude動作はブロックしない | 検知は best-effort でPTY動作を優先 |
| 状態保持 | メモリのみ | board再起動で消えるが、再検知される設計 |

## ファイル構成

```
src/
├── hooks/                                  ← 新規ディレクトリ
│   ├── claudeHookSettings.ts              ← 新規: settings.json生成
│   ├── hook-attention.mjs                 ← 新規: PreToolUse/PostToolUse 用
│   └── hook-stop.mjs                      ← 新規: Stop hook 用
├── services/
│   └── AttentionStateService.ts           ← 新規: メモリ状態+購読管理
├── terminal/
│   └── PtySessionService.ts               ← 変更: env注入 + --settings
├── board/
│   ├── boardRoutes.ts                     ← 変更: hook受付ルート + attention SSE
│   ├── server.ts                          ← 変更: AttentionStateService 注入
│   └── client/
│       ├── attentionIndicator.ts          ← 新規: アイコン描画 + SSE購読
│       ├── claudeButton.ts                ← 変更: attentionIndicator 連携
│       └── card.ts                        ← 変更: status近傍にアイコン挿入
└── utils/
    └── hookToken.ts                       ← 新規: 起動時トークン管理

tests/
├── services/AttentionStateService.test.ts
└── hooks/claudeHookSettings.test.ts
```

`hook-*.mjs` は npm パッケージ配布対象。`package.json` の `files` に追加し、`__dirname` ベースで実行時に絶対パスを解決する。

## hook スクリプト仕様

### `claudeHookSettings.ts`

board データディレクトリ（例: `~/.agkan/board-hook-settings.json`）に下記を生成する：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          { "type": "command", "command": "node /abs/path/hook-attention.mjs pre" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          { "type": "command", "command": "node /abs/path/hook-attention.mjs post" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node /abs/path/hook-stop.mjs" }
        ]
      }
    ]
  }
}
```

冪等：内容が同じであれば再生成しない。

### `hook-attention.mjs`

```
1. process.argv[2] で "pre" or "post" を取得
2. process.env から BOARD_TASK_ID, BOARD_API_URL, BOARD_HOOK_TOKEN を読む
3. POST {BOARD_API_URL}/api/internal/hooks/attention
   Headers: { x-hook-token: BOARD_HOOK_TOKEN }
   Body:    { taskId, state: "needs" | "answered" }
4. 失敗時: stderr に warning ログ。exit 0 で返す（Claude をブロックしない）
```

### `hook-stop.mjs`

```
1. stdin から hook input JSON を読む（transcript_path, stop_hook_active, hook_event_name, session_id, last_assistant_message を取得）
2. stop_hook_active === true なら何もせず exit 0（再帰防止）
3. transcript_path のJSONLを末尾から読み、最後のassistantメッセージ内の tool_use の name を取得
4. name === "AskUserQuestion" なら何もせず exit 0（質問待機中）
5. それ以外は POST /api/internal/hooks/stop { taskId, reason: "complete" }
6. board が PtySessionService.stopProcess(taskId) を実行 → PTY プロセス終了
```

注: Claude Code の Stop hook 入力ペイロードには `stop_reason` フィールドは含まれない（実際のフィールドは `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `stop_hook_active`, `last_assistant_message`）。完了か質問待ちかの判別は transcript の最後の tool_use 名のみで行う。

transcript JSONL末尾検査は16KB程度の末尾読み込みで足りる。

## PtySessionService の変更

```typescript
async startProcess(taskId: number, prompt: string, command: string, ...) {
  const hookSettingsPath = await ensureBoardHookSettings();

  const env = {
    ...process.env,
    BOARD_TASK_ID: String(taskId),
    BOARD_API_URL: this.boardApiUrl,
    BOARD_HOOK_TOKEN: getHookToken(),
  };

  const args = [
    '--settings', hookSettingsPath,
    // 既存の引数...
  ];

  const ptyProcess = pty.spawn('claude', args, {
    name: 'xterm-256color',
    cwd: workingDir,
    env,
    cols: 80,
    rows: 30,
  });

  // 既存のロジック (outputBuffer, exitSubscribers, etc.)
}

stopProcess(taskId: number) {
  // 既存のkill処理に加えて:
  this.attentionStateService.clearTask(taskId);
}
```

`boardApiUrl` は `server.ts` でlistening後に確定したURL（例: `http://127.0.0.1:3000`）をコンストラクタ経由で受け取る。

## utils/hookToken.ts

- プロセス起動時に `crypto.randomBytes(32).toString('hex')` で一度だけ生成
- メモリ保持のみ
- `getHookToken()` で取得、`verifyHookToken(token)` で検証

## AttentionStateService

```typescript
type AttentionState = { taskId: number; needsAttention: boolean };

export class AttentionStateService {
  private state = new Map<number, boolean>();
  private subscribers = new Set<(s: AttentionState) => void>();

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
    if (this.state.delete(taskId)) {
      this.notify({ taskId, needsAttention: false });
    }
  }

  subscribe(cb: (s: AttentionState) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notify(s: AttentionState): void {
    for (const cb of this.subscribers) cb(s);
  }
}
```

同値setでは通知スキップしSSE洪水を防ぐ。

## board API

### `boardRoutes.ts`

```typescript
function requireHookToken(req, res, next) {
  if (req.headers['x-hook-token'] !== getHookToken()) {
    return res.status(401).end();
  }
  next();
}

app.post('/api/internal/hooks/attention', requireHookToken, (req, res) => {
  const { taskId, state } = req.body;
  attentionStateService.setAttention(Number(taskId), state === 'needs');
  res.json({ ok: true });
});

app.post('/api/internal/hooks/stop', requireHookToken, (req, res) => {
  const { taskId, reason } = req.body;
  if (reason === 'complete') {
    ptySessionService.stopProcess(Number(taskId));
  }
  res.json({ ok: true });
});

app.get('/api/attention/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const initial = attentionStateService.listAttentionTasks();
  res.write(`data: ${JSON.stringify({ type: 'snapshot', taskIds: initial })}\n\n`);

  const unsub = attentionStateService.subscribe((s) => {
    res.write(`data: ${JSON.stringify({ type: 'update', ...s })}\n\n`);
  });

  req.on('close', () => unsub());
});
```

## クライアントUI

### `attentionIndicator.ts`（新規）

```typescript
type AttentionMessage =
  | { type: 'snapshot'; taskIds: number[] }
  | { type: 'update'; taskId: number; needsAttention: boolean };

export function startAttentionStream() {
  const es = new EventSource('/api/attention/stream');
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data) as AttentionMessage;
    if (msg.type === 'snapshot') {
      msg.taskIds.forEach((id) => applyAttention(id, true));
    } else {
      applyAttention(msg.taskId, msg.needsAttention);
    }
  };
  return () => es.close();
}

function applyAttention(taskId: number, needs: boolean) {
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
```

### `card.ts`（変更）

カードDOMに `<span class="attention-indicator"></span>` をステータスインジケーター近傍に追加。CSSで色とアニメーション（脈動）を定義。

### 起動箇所

`board/client/main.ts` 等のエントリで `startAttentionStream()` を一度だけ呼び出す。

`claudeButton` は実行中状態の表示、`attentionIndicator` は質問待ち状態の表示で役割分離。両方並ぶことを許容する。

## エッジケース対応

| ケース | 対応 |
|---|---|
| board再起動中にAskUserQuestion発生 | hookはAPI接続失敗→stderrログのみ。次にClaudeが応答するまでattention検知不可。受け入れる。 |
| 同一taskで連続AskUserQuestion | `AttentionStateService` が同値setをスキップしSSE洪水を防ぐ。 |
| ユーザーがTerminalタブで返答前にstop | `stopProcess` 内で `clearTask(taskId)` を呼びアイコン即クリア。 |
| Stop hook で transcript_path が読めない | exit 0 で何もせず（自動終了しない）。fail-safe。 |
| 孤児hook（古いboardプロセス由来） | tokenが一致しないので401で弾かれる。 |
| 同時複数task実行 | task毎に独立した env、attention は taskId 別管理。 |
| planning コマンド | Stop hookのtranscript検査で AskUserQuestion 以外なら自動終了。task #502 の挙動と整合。 |
| transcript 末尾が tool_result | tool_resultの直前のtool_useではなく、最後のassistantメッセージ内のtool_useを参照する。 |

## テスト方針

### 単体テスト

- `AttentionStateService.test.ts`
  - setAttention の状態遷移
  - subscribe/notify
  - 同値setでの通知スキップ
  - clearTask の挙動

- `claudeHookSettings.test.ts`
  - settings.json 生成内容
  - 既存ファイルの再利用（冪等性）

- `hookToken.test.ts`
  - 生成・検証

### 統合テスト

- `hook-attention.mjs` / `hook-stop.mjs` を子プロセスとして実行
- mock board API server を立てて HTTP 通信を検証
- transcript JSONL のパース（hook-stop.mjs）

- `boardRoutes.ts`
  - token認証 (401, 200)
  - attention POST → SSE 配信
  - stop POST → PtySessionService.stopProcess 呼び出し（mock）

- `PtySessionService.ts`
  - 起動時のenv注入とargs組み立て
  - stopProcess時の clearTask 呼び出し

### E2E

`e2etest.sh` 拡張:
- mock `claude` を作って AskUserQuestion → Stop の流れを再現
- アイコン表示 → 返答 → アイコン消滅 → 自動終了 を確認

## 受け入れ条件

- [ ] Claude CLI が `AskUserQuestion` を呼んだ際、boardカードのステータスインジケーター付近に質問アイコンが表示される
- [ ] ユーザーがTerminalタブで返答すると、アイコンが消える
- [ ] Claude CLI の応答が `AskUserQuestion` 以外で完了した場合、Claude CLI が自動終了する（exit code 0）
- [ ] 自動終了時、既存のタスクステータス更新ロジック（run/pr で done/review）が動作する
- [ ] hookがboard APIに接続失敗してもClaude CLI の動作はブロックされない
- [ ] board再起動後、新規Claude CLI起動時のhookは新tokenで認証される（古いhookは401）
- [ ] 既存のPTYターミナル表示・WebSocket I/O・Run Logs SSE は変更前と同じ動作
- [ ] 既存のplanning コマンド自動終了（task #502）と整合

## スコープ外

- AskUserQuestion以外のユーザーattentionツールの検知（将来必要なら matcher を追加）
- DBへの状態永続化（board再起動時の状態復元）
- attention状態の履歴記録
- 通知音・デスクトップ通知連携
- Cline SDK・OAuth・MCPの導入
