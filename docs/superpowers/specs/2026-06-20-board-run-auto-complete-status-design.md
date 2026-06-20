# Board Run 完了時の自動ステータス更新デザイン

作成日: 2026-06-20

## 背景・目的

Board上の個別「Run」ボタンでready状態のタスクを実行し、正常完了すると
`window.confirm()` による完了ダイアログ（`Task #N completed successfully. Move task to "Done"?`）
が表示される。このブロッキングなダイアログを廃止し、完了時に自動でステータスを
更新する挙動に変更する。

あわせて Run all（一括実行）も、各タスク完了時に自動でステータス更新するよう挙動を揃える。

## 決定事項

- 完了ダイアログ（`window.confirm`）は廃止する
- 完了後はユーザー確認なしで自動的にステータスを更新する
  - `run`（current branch / direct）: `done`
  - `pr`（create PR）: `review`
- 単一Run と Run all の両方で同じ挙動にする
- 実装はサーバー側に集約する（完了判定ロジックが既にサーバー側にあるため）
- ユーザーが明示的に停止した場合は、両フローともステータス更新しない
- `planning` コマンドは対象外（従来どおりステータス自動更新なし）

## 現状の挙動

### 単一Run
- フロー: `POST /api/claude/tasks/:taskId/run` → `subscribeOutput` で完了監視 →
  `notifyCompletionConfirm(taskId, targetStatus)` → boardストリーム `confirm-complete`
  → クライアントで `window.confirm` → OKなら `PATCH /api/tasks/:taskId`
- 該当箇所:
  - `/workspace/src/board/boardRoutes.ts:589-602`
  - `/workspace/src/board/boardRoutes.ts:937-946`（`subscribeCompletionConfirm` → `send('confirm-complete')`）
  - `/workspace/src/board/client/claudeButton.ts:358-369`（`window.confirm` + PATCH）

### Run all
- `BulkRunService.launchTask` は完了時に `advance()`（次タスクへ）するのみで、
  ステータス更新は行っていない
- 該当箇所: `/workspace/src/board/BulkRunService.ts:160-190`

### UI反映の仕組み
- `TaskService.updateTask` 内部で `this.boardEventService?.notify()` が呼ばれ、
  `/api/board/stream` 経由で `board-update` イベントが送信され Board UI が再描画される
- → サーバー側から `ts.updateTask` を直接呼んでも Board UI に反映される
- 参照: `/workspace/src/services/TaskService.ts:138-166`,
  `/workspace/src/board/boardRoutes.ts`（`/api/board/stream`）

## 設計

### 変更1: 単一Run（サーバー側）

`/workspace/src/board/boardRoutes.ts:589-602`

- `claudeProcess.notifyCompletionConfirm(taskId, targetStatus)` を
  `ts.updateTask(taskId, { status: targetStatus })` に置換する
- 条件 `evt.kind === 'done' && evt.exitCode === 0` および
  `!claudeProcess.isUserStopped(taskId)` は維持

### 変更2: Run all（サーバー側）

`/workspace/src/board/BulkRunService.ts:160-190`

- `launchTask` の `subscribeOutput` コールバックで、
  `evt.kind === 'done' && evt.exitCode === 0 && !this.claudeProcess.isUserStopped(taskId)`
  のとき `this.ts.updateTask(taskId, { status })` を実行する
  - `status` は `this.command === 'pr'` なら `review`、それ以外（`direct`）なら `done`
- ステータス更新後、従来どおり `advance()` で次タスクへ進む
- `advance()` の呼び出し自体（done / error いずれでも進む）は維持する

### 変更3: デッドコード削除

confirm-complete 経路が未使用になるため削除する。

- `/workspace/src/board/client/claudeButton.ts:358-369`
  — `addBoardStreamListener('confirm-complete', ...)` ハンドラ削除
- `/workspace/src/board/client/boardStream.ts:5,33`
  — `BoardEventType` から `confirm-complete` を削除、`boardEvents` 配列からも削除
- `/workspace/src/board/boardRoutes.ts:937-946`
  — `subscribeCompletionConfirm` 購読と `send('confirm-complete', ...)` を削除
- `/workspace/src/terminal/PtySessionService.ts:81,105,112`
  — `completionConfirmSubscribers`, `subscribeCompletionConfirm`,
    `notifyCompletionConfirm` を削除（および未使用となる import の整理）
- `/workspace/src/services/ClaudeProcessService.ts:75,82,95,102`
  — `CompletionConfirmCallback` 型、`completionConfirmSubscribers`,
    `subscribeCompletionConfirm`, `notifyCompletionConfirm` を削除
  - 削除前に他からの参照が無いことを再確認する

### 変更4: テスト更新

- `tests/board/claudeRoutes.test.ts:376,405,488`
  — 「`confirm-complete` 通知」検証を、「`ts.updateTask` が `done`/`review` で呼ばれる」
    「ユーザー停止時は `ts.updateTask` が呼ばれない」検証に書き換え
- `tests/board/bulkRunService.test.ts`
  — 正常終了時に `ts.updateTask` が想定ステータスで呼ばれることの検証を追加
  - モックの `subscribeCompletionConfirm`/`notifyCompletionConfirm` は不要になれば削除
- `tests/terminal/PtySessionService.test.ts:668`
  — 削除メソッドのテスト（`subscribeCompletionConfirm and notifyCompletionConfirm work together`）を削除

## 対象外（YAGNI）

- 非ブロッキングのトースト通知などのUI追加は行わない
- `planning` コマンドのステータス自動更新は行わない

## テスト方針

- `pnpm test` のユニットテストで、単一Run / Run all 双方のサーバー側自動更新を検証
- ユーザー停止時に更新が走らないことを検証
- E2E（`e2etest.sh`）でダイアログが出ないこと・完了後にカードが Done/Review に
  移動することを確認
