# Board ステータス遷移バグ修正設計

**日付**: 2026-06-30  
**対象ブランチ**: beta

---

## 概要

agkan board において以下の2つのバグを修正する。

1. **RunAll でタスクが done に移動しない** — BulkRun がスキルのステータス更新に依存しているが機能していない
2. **planning ボタンで途中停止する** — hook-stop が planning セッションを途中で強制終了している

---

## Bug 1: RunAll → done に移動しない

### 現象

RunAll ボタンでタスクを実行すると、実装（コミット等）は完了するが、タスクのステータスが `in_progress` から `done` に移行しない。

### 根本原因

`BulkRunService` のプロセス完了ハンドラは `advance()`（次のタスクへ進む）を呼ぶのみで、タスクステータスを更新しない。ステータス更新はスキル（Claude プロセス内）が `agkan task update --status done` を呼ぶことに依存しているが、この呼び出しが失敗している。

手動 Run ボタンのフロー（`confirm-complete` SSE → クライアントダイアログ → PATCH）とは異なり、BulkRun はサーバー側でステータスを更新する仕組みを持っていない。

### 修正

**対象**: `/workspace/src/board/BulkRunService.ts`

`launchTask()` 内の `subscribeOutput` コールバックに、`exitCode === 0` 時の自動ステータス更新を追加する。

```typescript
claudeProcess.subscribeOutput(taskId, async (evt) => {
  if (evt.kind === 'done' && evt.exitCode === 0) {
    await deps.taskService.updateTaskStatus(taskId, 'done');
  }
  if (evt.kind === 'done' || evt.kind === 'error') {
    advance();
  }
});
```

- `exitCode === 0` の場合のみ `done` に更新（エラー終了は `in_progress` のまま残す）
- `advance()` は exitCode に関わらず呼ぶ（次のタスクへ進む動作は変えない）

---

## Bug 2: planning ボタンで途中停止する

### 現象

planning ボタンを押すと、Claude が Explore エージェントを起動して Monitor で待機中に Stop Task が呼ばれ、セッションが強制終了される。計画ファイルは作成されず、タスクのステータスも変わらない。

### 期待動作

planning スキルがタスクを分析し、実装開始できると判断したら `agkan task update --status ready` を呼んでタスクを ready に移動する。

### 根本原因

`hook-stop.mjs` は Claude がターンを返すたびに `/api/internal/hooks/stop` に POST する。このエンドポイントはセッションの command 種別を確認せず `stopProcess()` を呼ぶ。

planning スキルは複数ターンを必要とする：
1. ターン1: Explore エージェントを起動、Monitor で待機
2. Monitor 完了後のターン2: Explore 結果を分析、質問または ready に移動

ターン1では Monitor がアクティブなため hook-stop が無視される。しかしターン2終了時（Monitor は既に非アクティブ）に hook-stop が発火し、planning セッションが強制終了される。

### 修正

**対象1**: `/workspace/src/board/boardRoutes.ts`（`registerHookRoutes` 内）

`/api/internal/hooks/stop` エンドポイントで、セッションの command が `'planning'` の場合は `stopProcess()` を呼ばない。

```typescript
app.post('/api/internal/hooks/stop', async (c) => {
  // ...
  if (body.reason === 'complete') {
    const session = deps.ptySessionService.getSession(id);
    if (session?.command !== 'planning') {
      deps.ptySessionService.stopProcess(id);
    }
  }
  return c.json({ ok: true });
});
```

**対象2**: `/workspace/src/terminal/PtySessionService.ts`

`getSession(taskId)` メソッドを追加し、セッション情報（command 含む）を外部から参照可能にする。

```typescript
getSession(taskId: number): { command: string } | undefined {
  const info = this.sessions.get(taskId);
  return info ? { command: info.command } : undefined;
}
```

planning セッションは、スキル自身が `agkan task update --status ready` を呼んで自然終了するため、hook による強制停止は不要。

---

## 変更ファイルまとめ

| ファイル | 変更内容 |
|---|---|
| `src/board/BulkRunService.ts` | subscribeOutput に exitCode=0 時の done 自動更新を追加 |
| `src/board/boardRoutes.ts` | hook-stop エンドポイントで planning コマンドをスキップ |
| `src/terminal/PtySessionService.ts` | `getSession()` メソッドを追加 |

---

## テスト方針

- BulkRun でタスクを実行し、完了後に done に移行することを確認
- planning ボタンを押し、複数ターンの処理が完了するまでセッションが維持されることを確認
- 既存の手動 Run ボタンの `confirm-complete` フローが変わらないことを確認
