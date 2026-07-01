# stop hook の背景ジョブ検出修正 設計仕様

- 関連タスク: agkan #661
- 対象ファイル: `src/hooks/hook-stop.mjs`, `tests/hooks/hook-stop.test.ts`
- 作成日: 2026-07-02

## 1. 背景と事象

Board のターミナルでエージェント(Claude Code)を auto mode で実行中、エージェントが
background shell(例: 15分かかる全テスト `npx vitest run`)を起動し「完了したら再開する」
状態で待機しているとき、Stop hook がセッション終了(`complete`)と**誤判定**する。

その結果:

1. `hook-stop.mjs` が `{taskId, reason:'complete'}` をサーバへ POST
2. サーバがセッション終了と判断し PTY をkill
3. background shell も巻き添えでkillされる(transcript 上で `<status>killed</status>`)
4. タスクは `in_progress` のまま取り残される

## 2. 根本原因

実トランスクリプト `c1e1b395-...`(事象発生セッション)の解析により、以下の連鎖を確認した。

```
assistant text: "Clean. Now let's run the full test suite ..."
assistant tool_use: Bash (run_in_background, shell=bkc1ziu9z, id=toolu_01BZ...)
user      tool_result: "Command running in background with ID: bkc1ziu9z ..."   ← 即時ack
assistant tool_use: ScheduleWakeup (フォールバック再開の予約)                    ← 最後のtool_use
(ターン終了 → Stop hook 発火)
```

`hook-stop.mjs` には 2 つの構造的欠陥がある。

### 欠陥A: 最後の tool_use しか見ない

`findLastToolUse` は「最後の assistant ターンの最後の tool_use」1 つだけを返す。
上記のように background Bash を起動した後に別ツール(`ScheduleWakeup` など)や地の文で
ターンを終えると、返るのは `ScheduleWakeup` となり、background Bash ガードが**評価対象に
すらならない**。

### 欠陥B: 完了判定の前提が誤り

現行の background Bash / Task ガードは `!isToolResultPresent(...)` を完了判定に使う。
しかし Claude Code は background Bash 起動時に**即座に ack**
(`Command running in background with ID: ...`)を tool_result として返す。
そのため `isToolResultPresent` は起動直後から `true` となり、Bash が最後のツールであっても
ガードは発火しない。ガードが機能するのは ack が存在しない合成テスト内だけである。

**本当の完了通知**は後から `<task-notification>` として届く(下記フォーマット参照)。

### 完了通知のフォーマット(実測)

background の Bash / Task が終了(完了・kill・失敗いずれも)すると、transcript に
`queue-operation` エントリが追加され、その `content` に以下の XML ブロックが入る。

```
<task-notification>
  <task-id>bkc1ziu9z</task-id>
  <tool-use-id>toolu_01BZ...</tool-use-id>
  <output-file>/tmp/.../tasks/bkc1ziu9z.output</output-file>
  <status>killed</status>
  <summary>Background command "Run full test suite" was stopped</summary>
</task-notification>
```

`<tool-use-id>…</tool-use-id>` という XML タグ形式は完了通知にしか現れず、JSON の
`"id"` / `"tool_use_id"` フィールドとは区別できる。これを完了検出の信号に使う。

## 3. 修正方針(方式A: transcript 全走査 + 完了通知照合)

「最後の tool_use だけを見る」background Bash/Task ガードを廃止し、**未完了背景ジョブ検出**
に置き換える。

1. transcript **全体**を走査し、`run_in_background: true` の `Bash` / `Task` の tool_use を
   すべて収集(それぞれの tool-use-id を保持)。
2. 各 tool-use-id について、対応する完了通知
   `<tool-use-id>${id}</tool-use-id>` が transcript 内に存在するか照合。
   存在すれば status が completed / killed / failed のいずれでも「終了済み」とみなす。
3. **未完了の背景ジョブが 1 つでも残っていれば** `complete` を POST せず `return`
   (セッション維持)。全て終了済み、または背景ジョブなしなら従来どおり進行。

これにより欠陥A・欠陥B の両方が解消される。旧コミットが全走査を避けた理由(終了済みジョブが
誤検出され、セッションが終了できなくなる)も、完了通知照合で終了済みを正しく除外できるため
再発しない。

### スコープ

background ジョブ(`Bash`/`Task` の `run_in_background:true`)のみを対象とする。
background ジョブを伴わず `ScheduleWakeup` 単独で自己再開を予約するケースは**本修正の対象外**
(別途検討)。

### 据え置くガード(現状維持)

- `AskUserQuestion`(最後のツール): 回答待ち → 送らない
- `Monitor`(最後のツール): ストリーム待機 → 送らない
- `stop_hook_active` による再帰防止
- サブエージェントセッション判定(`/tmp/board-main-session-*`)
- 環境変数(`BOARD_TASK_ID` 等)チェック

## 4. テスト方針(TDD)

### 修正するテスト

- 「background Bash finished 時に complete を送る」テスト
  (現在 tool_result `"Tests passed."` を完了信号にしている)を、完了信号を
  **task-notification**(`queue-operation` + `<tool-use-id>`)に置き換えて書き直す。

### 維持するテスト

- 最後が background Bash かつ完了通知なし → 送らない
- 途中で background Bash 起動・完了通知なし → 送らない
- `AskUserQuestion` / `Monitor` / 再帰防止 / サブエージェント判定

### 追加するテスト

- **バグ回帰**: 前ターンで background Bash 起動 → 最後のツールが `ScheduleWakeup` →
  完了通知なし → complete を送らない(本事象の実シナリオ)
- background Bash 起動 → 完了通知(`<task-notification>`)あり → 以降に別ツール/地の文 →
  complete を送る

## 5. 影響範囲

- サーバ側(`complete` 受信で PTY kill)は正しい挙動であり変更しない。過剰に `complete` を
  送らないようにするのが本修正。
- 変更は `src/hooks/hook-stop.mjs` と `tests/hooks/hook-stop.test.ts` に限定。
