# Board run セッションの自己再開ハング解消（status基準の終了判定）設計仕様

- 関連タスク: agkan（未登録 / 本仕様承認後に登録）
- 前提の別課題: agkan #661（背景ジョブ検出。本件はその「対象外」として据え置かれた ScheduleWakeup 単独ケースの後続対応）
- 対象ファイル:
  - `src/terminal/PtySessionService.ts`
  - `src/board/boardRoutes.ts`
  - `src/board/server.ts`
  - `src/hooks/hook-stop.mjs`
  - 共有ヘルパ（`runTargetStatus`）
  - `tests/hooks/hook-stop.test.ts` および内部ルートのテスト
- 作成日: 2026-07-02

## 1. 背景と事象

Board の「run」はタスクごとに実際の `claude` CLI を **PTY 内**で起動する（`src/terminal/PtySessionService.ts:121-155`）。
agkan 側に「Claude を再起動するループ」は無く、ターミナルに見える `/loop wakeup` は
**PTY 内で動く Claude Code 自身の `/loop`（`ScheduleWakeup` による自己再開）**である。

セッションが終了するかは一点、**Stop フック（`src/hooks/hook-stop.mjs`）が
`{taskId, reason:'complete'}` を board に POST するか**にかかっている。POST されると
board が PTY を kill する（`src/board/boardRoutes.ts:727-741` → `src/terminal/PtySessionService.ts:283-303`）。

事象: 実装が完了しタスクが目標status（例: `review`）へ前進済みでも、セッションが終了せず
`/loop wakeup` で再開し続け、「No further action needed」と述べながら残り続ける。

## 2. 根本原因

`hook-stop.mjs` の `main()`（`src/hooks/hook-stop.mjs:88-167`）が「まだ終わっていない」と判断して
`complete` を送らないガード群に、`/loop` の自己再開が漏れている。現状ガードは
`stop_hook_active` / `AskUserQuestion` / `Monitor` / 未完了の背景ジョブ / サブエージェントのみ。

該当する失敗シナリオは 2 つ。

1. **背景ジョブ残留型**: run 中に `run_in_background:true` の `Task`（例: self-review agent）を
   起動し、その完了通知 `<task-notification>`（`<tool-use-id>` 一致）が transcript に現れないと
   `hasUnfinishedBackgroundJob`（`src/hooks/hook-stop.mjs:130-132`）が永久に true → 恒久的に
   `complete` を送らずセッションが回り続ける。
2. **純粋な `/loop` 自己再開型**: `ScheduleWakeup` はガード対象外だが、「ループは終わり／
   No further action needed」を認識して `complete` を送るロジックが無い。唯一の停止指示は
   プロンプト末尾の exitInstruction「`exit` とプロンプトで送れ」（`src/board/boardRoutes.ts:553-554`）
   のみで、モデルが `exit` を打たず地の文で終えるとセッションが残る。

この穴は agkan #661 の設計仕様
（`docs/superpowers/specs/2026-07-02-stop-hook-background-job-detection-design.md:86-90`）で
「ScheduleWakeup 単独で自己再開を予約するケースは本修正の対象外（別途検討）」と明記されている。
本仕様がその別途検討にあたる。

## 3. 修正方針（status 基準の終了判定）

エージェント自身が run の**目標status**へタスクを前進させた事実（`review`/`done`）を終了信号とする。
Stop フックが目標statusへの到達を検出したら、背景ジョブ／ScheduleWakeup ガードを**上書き**して
`complete` を送る。status は DB（board 側）が保持するため、フックは board API 経由で取得する。

対象は目標statusを持つ `pr` / `run`（`direct` 含む）。目標statusを持たない `planning` は本修正の
**対象外**（現状の exitInstruction 依存を維持、別課題）。

### 3.1 触点①: 目標status を PTY へ env 注入

`src/terminal/PtySessionService.ts:137-142` の `hookEnv` に `BOARD_TARGET_STATUS` を追加する。
`command`（`startProcess` の引数）から共有ヘルパで算出する。

```ts
const targetStatus = runTargetStatus(command); // pr -> 'review', run/direct -> 'done', planning -> null
if (targetStatus) hookEnv.BOARD_TARGET_STATUS = targetStatus;
```

- `planning` は注入しないため、フック側で判定が自然にスキップされ後方互換となる。
- 既存セッション／旧環境（env 未設定）も同様にスキップ＝完全な現状維持。
- BulkRun（`pr`/`direct`）も `startProcess` 経由（`src/board/BulkRunService.ts`）のため自動で有効。

### 3.2 共有ヘルパ `runTargetStatus`

`command` → 目標status のマッピングを一箇所に集約する純関数を新設する。

```ts
export function runTargetStatus(command: string): 'review' | 'done' | null {
  if (command === 'planning') return null;
  if (command === 'pr') return 'review';
  return 'done'; // 'run' / 'direct'
}
```

`src/terminal/PtySessionService.ts`（env 注入）と `src/board/boardRoutes.ts:589-590`
（`notifyCompletionConfirm` の `targetStatus` 算出）の双方から利用し、重複と drift を防ぐ。

### 3.3 触点②: 内部 status 取得エンドポイント

`src/board/boardRoutes.ts` の `registerHookRoutes`（712-742）に、フック用の status 取得を追加する。

```
GET /api/internal/tasks/:id/status
- 認証: x-hook-token ヘッダを verifyHookToken で検証（既存 /hooks/stop と同様）
- 200: { status }   （ts.getTask(id)?.status）
- 401: token 不正
- 400: id 不正
- 404: タスク未存在
```

`HookRouteDeps`（`src/board/boardRoutes.ts:707-710`）に `taskService`（`TaskService`）を追加し、
`src/board/server.ts:85` の `registerHookRoutes(app, { ... })` に `ts` を渡すよう配線する。

既存の公開 `GET /api/tasks/:id`（`boardRoutes.ts:168-183`）は token 認証が無く巨大 payload を返すため
再利用せず、内部フック流儀に沿った専用エンドポイントを新設する。

### 3.4 触点③: `hook-stop.mjs` の判定追加と順序リファクタ

現状のサブエージェント判定（`src/hooks/hook-stop.mjs:137-150`）は「検出（return）」と
「セッションファイルの unlink」を同一ブロックで行い、かつ背景ジョブガードより**後段**にある。
status 判定は「メインセッションのみ」で「背景ジョブガードより前」に効かせる必要があるため、
サブエージェント検出を前方へ移し、unlink は実際に POST する直前のみ実行するよう分離する。

- 検出（読み取り＋ `session_id` 比較でサブエージェントなら return）は早期に行う。unlink はしない。
- unlink（`/tmp/board-main-session-*` 削除）は complete を POST する直前でのみ行う。
  （早期 unlink は後続ターンでサブエージェント判別を失い、誤終了を招くため不可。）

判定順（離席中に確定した推奨既定「対話ガードは尊重、背景ジョブ/Wakeup のみ上書き」に準拠）:

```
1 env/payload チェック, stop_hook_active           -> return
2 transcript 読込・parse
3 taskId 解決 + メインセッション検出               -> sub-agent なら return（unlink しない）
4 findLastToolUse: AskUserQuestion / Monitor       -> return（対話待ちは殺さない）
5 ★NEW status 到達判定:
    BOARD_TARGET_STATUS が非空文字のとき
      GET /api/internal/tasks/:id/status
      到達なら  -> session ファイル unlink -> POST complete -> return   （背景ジョブガードを上書き）
      未到達    -> 次へ
      fetch 失敗 -> 上書きせず次へ（stderr にログ、後方互換）
6 背景ジョブ未完（#661 の全走査＋<task-notification> 照合） -> return
7 session ファイル unlink -> POST complete
```

到達判定のルール:

```
reached = (status === targetStatus) || status === 'done' || status === 'closed'
```

- `pr`（target=`review`）: `review` / `done` / `closed` で到達。
- `run`（target=`done`）: `review` では到達せず、`done` / `closed` のみ到達（status 順序と整合）。

status 型は `icebox | backlog | ready | in_progress | review | done | closed`
（`src/models/Task.ts:16`）。GET 呼び出しは既存 POST（`hook-stop.mjs:152-166`）と同じ
`x-hook-token` ヘッダ形式を踏襲する。

## 4. テスト方針（TDD）

### `tests/hooks/hook-stop.test.ts`

追加（回帰・新挙動）:

- **本事象回帰**: 背景ジョブ未完（`<task-notification>` 無し）＋ `BOARD_TARGET_STATUS=review` ＋
  GET が `review` を返す → **complete を送る**（背景ジョブガードを上書き）。
- 最後が `ScheduleWakeup`・背景ジョブ無し＋ status 到達 → complete を送る。
- status 未到達（GET が `in_progress`）＋背景ジョブ未完 → 送らない（#661 維持）。
- `AskUserQuestion` が最後＋ status 到達 → 送らない（対話ガード尊重）。
- サブエージェントセッション＋ status 到達 → 送らない（メインセッションのみ）。
- `BOARD_TARGET_STATUS` 未設定 → 現状維持（status 判定を一切行わない）。
- GET が失敗（ネットワーク/非200）→ 通常フローへフォールバック（例外を投げない）。

維持（現状の振る舞い）:

- `AskUserQuestion` / `Monitor` / `stop_hook_active` 再帰防止 / サブエージェント判定 / env 未設定。
- 背景ジョブ未完（status 情報なし）→ 送らない。

注意: GET が加わるため、既存の `fetch` モックを GET/POST 両対応にする。

### 内部エンドポイントのテスト

`GET /api/internal/tasks/:id/status`:

- 正当な token → 200 かつ `{ status }`。
- token 無し／不正 → 401。
- 不正 id → 400、未存在 id → 404。

## 5. 影響範囲と前提

- サーバ側の `complete` 受信 → PTY kill（`boardRoutes.ts:727-741`、`PtySessionService.ts:283-303`）は
  正しい挙動であり変更しない。過剰に `complete` を送らない／必要時に確実に送るのが本修正。
- 変更は上記「対象ファイル」に限定。`hook-stop.mjs` の #661 背景ジョブ検出ロジックは削除せず、
  status 到達時のみ上書きする（未到達時は従来どおり機能）。
- **前提**: run 系スキルが status 前進を run の**最終ステップ**として PATCH する現行設計に依存する
  （`agkan-subtask` step10=review、`agkan-subtask-direct` step8=done）。status 前進が作業途中で
  起こる設計に変われば早期終了し得るが、現行スキルでは status 前進＝終了直前であり整合する。
- **既知の残ギャップ（本修正の対象外）**:
  - `planning`（目標statusなし）は現状維持。別途、planning スキルの終了status を定義して対応する。
  - エージェントが status を前進させないまま停滞する失敗（作業自体の失敗）は status 基準では検知できない。
    board 側アイドル監視などの安全網は今回のスコープ外（本件は単一機構＝status 基準を採用）。
- GET は目標statusを持つセッション（pr/run）のターン終了ごとに localhost へ 1 回。レイテンシは無視できる。
