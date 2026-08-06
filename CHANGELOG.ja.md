# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 追加
- `.agkan.yml` に `modelCatalog` 設定を追加。タスクが選択できるモデルと、そのモデルで選べる reasoning effort を定義する。このキーを設定すると組み込みのカタログを丸ごと置き換える（行単位のマージはしない）。同じモデル名は 1 度しか書けない。カタログは `agkan config get` にも出力され、`agkan init` のテンプレートにコメントとして書き出される

### 変更
- タスク単位の model / effort の検証を、固定のエイリアス表（`fable`, `opus`, `sonnet`, `haiku`）と effort 表（`low`, `medium`, `high`, `xhigh`, `max`）から `modelCatalog` 基準に変更。planning / run それぞれについて model と effort をペアで検証し、effort は選択したモデルの行に含まれること（モデル未選択ならカタログの effort の和集合に含まれること）を要求する。`agkan task update` と `PATCH /api/tasks/:id` では、指定しなかった側にタスクの保存済みの値を使って検証する
- Board のモデル表示を `claude[Fable]` から `claude[fable]` に変更（`cli[model]` をそのまま表示し、先頭大文字化をやめた）。カタログから消えたモデル / effort が保存されている場合は、詳細パネルで `(not in catalog) <値>` と表示し、既定と区別できるようにした
- タスクの model が `modelCatalog` にない状態での実行を、既定モデルでの起動ではなく失敗にした（`POST /api/claude/tasks/:id/run` は 400、Bulk Run はそのタスクをスキップして続行）

## [3.21.0] - 2026-09-02

### 追加
- `agkan task add` / `agkan task update` に `--model-planning`, `--model-run`, `--effort-planning`, `--effort-run` フラグを追加。タスク実行時に使う Claude のモデルエイリアス（`fable`, `opus`, `sonnet`, `haiku`）と reasoning effort（`low`, `medium`, `high`, `xhigh`, `max`）をタスク単位で指定できる。`task update` で空文字を渡すとクリアされる。値は `agkan task get --json` にも出力され、`agkan task copy` でコピーされ、export/import にも含まれる

### 変更
- タスク単位の Claude model/effort override の保存先を、`task_metadata` の行（`model:planning` / `model:run` / `effort:planning` / `effort:run`）から `tasks` テーブルの専用カラムへ変更。既存の metadata は次回起動時のマイグレーションで自動的に移行され、元の行は削除される
- Codex エージェントのデフォルトモデルを変更。タスク単位のオーバーライドや `.agkan.yml` でモデルが未指定（または空文字に解決される場合）、Codex CLI自身のデフォルトに委ねる代わりに `gpt-5.6-sol` を使用するようにした。**破壊的変更**: agkanは今後常に `--model` をCodexに渡す。Codex CLI自身のデフォルトを使い続けたい場合は `models.codex.planning.model` / `models.codex.run.model` を明示的に設定すること (#14)

## [3.20.2] - 2026-08-29

### 修正
- CLI で任意のタスクを更新すると、表示中の detail panel が無関係なタスクの更新であっても無条件にリロード（または編集中の警告バー表示）されていた問題を修正。表示中タスク自身のカード（status/updated-at/tags/blocked-by/blocking）が実際に変化した場合のみパネルを更新するようにした。背後のボードカードは従来どおり更新される (#718)

## [3.20.1] - 2026-08-05

### 修正
- Bulk Run で、実行中のタスクに対してユーザーが STOP ボタンを押した際、完了判定コールバックがタスクを `done` に更新してしまう問題を修正。`stopProcess()` が停止時に発火する合成完了イベントは、実際の正常終了と exitCode だけでは区別できなかったことが原因。`PtySessionService` が停止の起点（ユーザー起点 / hook 起点）を区別して記録するようにし、`BulkRunService` はユーザー起点の停止時のみ `done` への自動更新をスキップする（hook 起点の自動完了は維持） (#12)

## [3.20.0] - 2026-08-04

### 追加
- Board のタスク作成モーダルおよび詳細パネルに、planning/run コマンドで使用する Claude モデルをタスク単位で選択できる機能を追加。Fable もモデル選択肢に追加。タスク単位の指定は `.agkan.yml` の設定より優先され、指定がなければ CLI のデフォルトにフォールバックする (#715)
- Board UI に planning/run コマンドの reasoning effort（low/medium/high/xhigh/max）をタスク単位で選択できる機能を追加。モデル選択と同様の優先順位で解決される (#715)
- `Test` GitHub Actions ワークフローに `e2e` ジョブを追加し、18セクション構成の E2E スイート（`pnpm run test:e2e`）を PR および `main` への push のたびに実行するようにした。これまでは `pnpm run test:all` による手動実行のみだった (#641)

### 修正
- Board のカードで dragstart/dragend リスナーが重複登録され、document レベルの dragover リスナーもリークしていた問題を修正。カード数が多いボードでドラッグ操作を行うとリスナーの蓄積によりページがフリーズしていた (#11)

## [3.19.0] - 2026-07-10

### 追加
- `task comment update <comment-id> <content>` CLI コマンドを追加。Board API に既に存在するコメント編集機能と揃えた (#655)
- Board ターミナルセッションにスクリーン状態検知による安全なプロセス終了を追加。hook-stop フローがターミナルのスクリーン状態（ブロック/パーミッションプロンプト、スピナー動作、カーソル消去シーケンス）を検知し、実行中の作業を強制終了せず、安全にアイドル状態のときのみセッションを終了するようにした (#377)

### 修正
- Board の planning セッションが終了しない問題を修正。Stop フックのバックグラウンドジョブガードがすべての `Agent` ツール使用を実行中のバックグラウンドジョブとして扱い、完了判定を `<task-notification>` マーカーのみに依存していたが、同期（フォアグラウンド）実行の Agent はこのマーカーを一切出力しない。Agent の最終 tool_result（エラー・拒否の結果を含む）も完了として認識するようにし、真の非同期起動中はこれまで通りセッションを維持する
- `task purge`・`task archive`・`task unarchive` が BoardEventService に通知せず、Board クライアントが次のフルリフレッシュまで変更を認識できなかった問題を修正 (#628)
- `message.content` が単純な文字列でない場合（コンテンツブロック配列など）に Stop フックが `<task-notification>` マーカーを検出できなかった問題を修正 (#692)

## [3.18.0] - 2026-07-05

### 追加
- `task delete` と `tag delete` に `--dry-run` フラグを追加。影響を受ける子タスク、コメント、タグ関連付け、メタデータエントリ、ブロック関係の件数を事前確認できるようにした (#656)

### 修正
- `isPathSafe` がファイル名に `..` を部分文字列として含む場合（例: `release..notes.md`）に誤って拒否していた問題を修正。実際に `..` というパスセグメントを持つ場合のみ拒否するようにした (#632)
- フックコマンドに埋め込まれた絶対パスがクォートされておらず、インストールパスにスペースが含まれる場合に SessionStart/PreToolUse/PostToolUse/Stop フックが失敗する問題を修正 (#631)
- `task find --status` が無効なステータス値を検証せず受け付け、エラーではなく空の結果を静かに返していた問題を修正 (#630)

## [3.17.1] - 2026-07-05

### 修正
- `task update` のヘルプ文言とエラーメッセージに priority フィールドが含まれていなかった問題を修正 (#657)

### 変更
- `BRANCH_AUTO_GENERATE` 定数を複数ファイルで再定義せず単一の情報源に統合 (#637)
- `task purge` と `task archive` ルート間で重複していた日付パース処理を共通の `resolveBeforeDate` ヘルパーに抽出 (#639)

## [3.17.0] - 2026-07-05

### 追加
- `task add` に `--tag <names-or-ids>` オプションを追加。名前・ID指定でタグを付与しつつタスクを作成できるようにし、別途 `tag attach` を実行する必要をなくした (#650)

### 変更
- **破壊的変更:** `task add` の `-p` 短縮形の意味を `--parent` から `--priority` に変更。`task list` および新たに `-p` 短縮形を追加した `task update --priority` と統一し、全ての task サブコマンドで `-p` が一貫して priority を指すようにした。`task add` で parent を指定する場合は長形式の `--parent` を使用する必要がある (#660)

### 修正
- `task list --json` の0件時出力が通常時とスキーマ不一致だった問題を修正。list/tree view で `sort`/`order` が欠落、tree/dep-tree view で `viewMode` が欠落、`filters` のキーが各 view の通常時出力と一致していなかった (#659)
- `task list` のヘルプ文言を修正。`-s, --status` がカンマ区切りで複数指定できることと有効値一覧を明記し、`--all` のヘルプ文言に `icebox` を含む旨を追記 (#658)

## [3.16.0] - 2026-07-04

### 追加
- `task get` の出力に metadata を表示するようにした。Board の `GET /api/tasks/:id` および `task list` と同じ内容を持つ (#649)

### 修正
- `task add` で `--blocked-by`/`--blocks` の設定に失敗した場合（存在しないIDやサイクルなど）に孤立したタスクがDBに残ってしまう問題を修正。タスク作成とブロック関係の設定を単一トランザクションでラップするようにした (#626)
- Board ターミナルの Enter watchdog が、出力バッファがトランケートされた後に Enter 送信以降の出力を誤って計算する問題を修正。生のバッファインデックスではなく単調増加する累計出力長を追跡するようにした (#695)
- Claude の TUI が固定遅延で送信された Enter をペーストとして吸収し、送信が確定しないままセッションが停止する問題を修正。送信確認までEnterを最大3回リトライするようにした (#695)
- `task purge`/`task archive` のコマンド設定処理を共通化した際に失われていた、それぞれ異なる `--dry-run` ヘルプ文言を復元 (#638)
- vitest のカバレッジ設定で、テストから一度もインポートされないファイルが集計から除外されていた問題と、アンビエント宣言ファイル(`.d.ts`)がレポートに含まれてしまっていた問題を修正 (#644)

## [3.15.2] - 2026-07-04

### 修正
- Board の「Planning」（および Run/PR）ボタンが `Claude起動エラー ... HTTP 500: posix_spawnp failed.` で失敗する問題を修正。node-pty の同梱バイナリ `spawn-helper` が実行ビットを失う（pnpm on macOS がストアからモード 0644 で clone し、インストール毎に +x がリセットされる）ことが原因。サーバー起動時にバイナリの権限を自己修復し、`postinstall` スクリプトがインストール毎に +x を再付与、さらに spawn 失敗時にタスク情報付きでサーバーログを出力するようにした
- archive/unarchive時の `updated_at` がシステム時刻ではなくアプリ生成のISO 8601タイムスタンプを使用するよう修正 (#624)
- export/importでタスクのpriority、branch、archived状態が失われる問題を修正し、これらのフィールドを保持するようにした (#622)
- tree viewおよびCLIの依存関係ツリー表示で、祖先タスクがフィルタで除外された場合にフィルタ後の子タスクが表示されない問題を修正。祖先チェーン全体を辿ってpseudo-rootを決定するようにした (#627)
- Board APIが汎用的なエラーレスポンスを返していた問題を修正し、`AgkanError` のサブタイプを適切なHTTPステータスコードにマッピングするようにした (#625)
- e2eテスト `test_hook_attention.sh` が削除済みの `/api/attention/stream` エンドポイントを参照していた問題を修正し、統合後の `/api/board/stream` エンドポイントを使用するようにした (#671)

## [3.15.1] - 2026-07-03

### 修正
- Board run で /loop 自己再開により実装完了後もセッションが終了しない問題を、タスクが目標statusへ到達した時点で終了するよう修正 (#665)
- Stop hook で、バックグラウンドのsub agent/Bashジョブが実行中でも目標status到達時点で即座に `complete` を送信し、PTYプロセスツリー（実行中のsub agentも含む）ごとkillしてしまう問題を修正。background-jobガードをstatus到達判定より優先するよう変更 (#666)
- sub agentが新しいツール名 `Agent` で実行された場合、または `run_in_background` フラグを明示的に指定しない場合に、Stop hookのbackground-jobガードがそれを認識できず、Board runセッションが実装途中でkillされる（SIGHUP、復旧不能）問題を修正。`BOARD_TARGET_STATUS` 設定時は、無条件complete経路を撤去し、status到達判定のみを終了信号とすることで、未認識のツール呼び出しが実行中でもセッションがkillされず残留する（手動停止で復旧可能）ようにした (#667)
- CLIのエラー出力をstdoutからstderrへ一貫して送るよう修正。core のエラーハンドリング、コマンドエラー、タスク個別のエラーメッセージが対象で、stdoutをパースするスクリプトにエラーテキストが混入しないようにした (#648)
- `task list` のツリー表示・依存関係ツリー表示におけるN+1クエリを解消し、ノードごとのクエリをバッチ読み込みに置き換えることで大規模タスクセットでのパフォーマンスを改善 (#663)

## [3.15.0] - 2026-07-02

### 追加
- `.agkan.yml` に `permissionMode` 設定キーを追加し、ボードのタスク実行時の Claude CLI パーミッションモードを制御できるようにした

### 変更
- Claude CLI のデフォルトパーミッションモードを `--dangerously-skip-permissions` から `--permission-mode auto` に変更。従来の動作を維持するには `.agkan.yml` に `permissionMode: skipPermissions` を設定すること

### 修正
- Board の「Run all」実行中に、プロセスが出力購読登録前に終了した場合・ユーザーが実行中タスクを手動停止した場合・セッションや実行ログが存在しない場合に、ループが途中で停止するバグを修正
- ボードでブランチ入力を自動生成から手動入力モードに切り替えた際、先頭文字が重複する問題を修正
- Run all が表示中タスクの新しいセッションを開始した際のターミナル再接続を修正
- BulkRun 成功時にタスクステータスを自動的に done に更新するよう修正
- stopProcess で done を発行する前に userStoppedTasks をマークするよう修正し、停止順序を正しく保持
- タグ ID/名前解決を統一し、数字始まりの名前の誤解決を防止
- stop hook でトランスクリプト全体の task-notification スキャンによりバックグラウンドジョブの実行検知を修正

## [3.14.1] - 2026-06-13

### 修正
- Board の Planning/Run 実行後、最終アシスタントターンがテキストのみで終わる場合（AskUserQuestion 回答後・バックグラウンドジョブ完了後など）にターミナルセッションが終了しない問題を修正
- プロンプト入力タイミングの問題を修正するため `PROMPT_ENTER_DELAY_MS` を 100ms から 200ms に増加

## [3.14.0] - 2026-05-30

### 追加
- `.agkan.yml` の設定値（デフォルト適用後の解決済み値）を取得する `agkan config get [key]` コマンドを追加
- 現在実行中のタスクに移動できるボードの実行中インジケータードロップダウンを追加
- ボードでテキスト入力によるブランチ名の手動入力に対応
- CLI コマンドのタスクおよびタグ変更時にボードへの通知を追加

### 変更
- Board の Planning/Run ボタンのセッション終了時に `exit` を bash コマンドとして実行するのではなく、プロンプト（ユーザー入力）として送信するよう変更
- ボードの SSE ストリーミングを単一の `/api/board/stream` エンドポイントに統合

### 修正
- ボードの実行中インジケータードロップダウンのスピナーボーダーカラーに CSS 変数を使用するよう修正
- ブロック追加・削除コマンドに `notifyBoard()` を追加
- ボードプロンプトの終了命令から先頭のスラッシュを削除
- ボードで Escape キー押下時、詳細パネルよりもタスク追加モーダルを優先して閉じるよう修正

## [3.13.0] - 2026-05-19

### 追加
- ボードでタスクIDによる検索に対応

### 修正
- タスク完了後にセッションが終了しない問題を修正
- ボード起動の Claude Code プロンプトに /exit 命令を追加

## [3.12.0] - 2026-05-19

### 追加
- コンテキスト出力に agkan タスク管理の必須指示を追加

### 修正
- planning コマンド時はブランチ作成手順をスキップするよう修正

## [3.11.1] - 2026-05-17

### 追加
- `agkan init` 実行時、既存の `settings.local.json` を上書きする前にタイムスタンプ付きバックアップ (`.claude/settings.local.json.agkan-backup-<YYYYMMDDHHmmss>`) を作成するようになりました。バックアップ失敗時はデータ保護のため書き込みを中断します。

## [3.11.0] - 2026-05-17

### 追加
- `agkan context` コマンドを追加。Claude Code の SessionStart hook 用に最小限のセッションブリーフを出力します (`--hook` で `additionalContext` を含む単一行 JSON)。
- `agkan agent-guide --hook` の代替として `agkan context --hook` コマンドを追加

### 変更
- `agkan init` が `.claude/settings.local.json` に SessionStart hook (`agkan context --hook` を呼び出す) を追加するようになりました。マージは冪等で、既存エントリとインデントを保持します。

### 修正
- ボードのブランチドロップダウンの表示件数が10件に固定されていた問題を修正

### 非推奨
- `agkan agent-guide --hook` を非推奨にしました。次のメジャーバージョンで削除予定です。SessionStart hook 用途では `agkan context --hook` を使用してください。`agent-guide` コマンド本体 (`--hook` なし) は引き続き完全リファレンスとして利用できます。

## [3.10.0] - 2026-05-17

### 追加
- タスクテーブルとモデルに `branch` フィールドを追加

### 修正
- Stop hook 入力に存在しない `stop_reason` フィールドではなく `stop_hook_active` を確認するよう修正し、Board の planning 実行で Claude の自動終了が発火しなかった問題を修正

## [3.0.0-rc10] - 2026-04-04

### 追加
- ボードの詳細パネルで「Blocked by」「Blocking」「Parent」関係項目をクリック可能に

### 修正
- ボードの依存関係変更を検出するためポーリングシグネチャに task_blocks を含めるよう修正

## [3.0.0-rc9] - 2026-04-03

### 変更
- エージェントガイドにタスクコピーコマンドを追加

## [3.0.0-rc8] - 2026-04-03

### 追加
- タスクコピーコマンドを追加

### 修正
- ボードの同一カラム内タスクの依存関係矢印レンダリングを修正
- SVGオーバーレイ再作成時に arrowMarkers キャッシュをクリア
- ドラッグ＆ドロップのステータス更新後に古いポーリングで上書きされる問題を修正

## [3.0.0-rc7] - 2026-04-03

### 追加
- ボードのデーモン start/stop/restart サブコマンドを追加
- ボードコマンドを適切なサブコマンド構造に変換
- サーバーステータスとタスクサマリーを表示する status サブコマンドを追加

### 変更
- .npmrc に minimum-release-age 設定を追加

## [3.0.0-rc6] - 2026-04-02

### 修正
- ボードヘッダーの読み込みインジケーターが h1 で改行される問題を修正
- 詳細パネルのコピー ID ボタンのレイアウトとスタイルを修正

## [3.0.0-rc5] - 2026-03-31

### 修正
- ボードヘッダーの実行中インジケーターを h1 タグ内に移動

## [3.0.0-rc4] - 2026-03-31

### 追加
- ボードヘッダーに実行中インジケータースピナーを追加

### 修正
- ボードヘッダーの実行中インジケーターを h1 直後に移動

## [3.0.0-rc3] - 2026-03-31

### 追加
- タスク作成時のデフォルト優先度を medium に設定

### 修正
- ボードのタスク切り替え時のテキストエリアリサイズを double rAF で修正

### リファクタリング
- マイグレーションで pragma_table_info() を addColumnIfNotExists ヘルパーに置き換え
- マイグレーションで sqlite_master を SAVEPOINT ベースの CHECK 制約チェックに置き換え

## [3.0.0-rc2] - 2026-03-30

### 修正
- 詳細パネルの非同期更新警告における再読み込みボタンのサイズを修正

## [3.0.0-rc1] - 2026-03-30

### 追加
- `task list` コマンドに `--priority` フィルタオプションを追加。カンマ区切りで複数指定可能（例: `--priority high` または `--priority critical,high`）(#119)

## [1.4.0] - 2026-03-02

### 追加
- `task update` コマンドに `--json` オプションを追加（`success`、`task`、`counts` フィールドを含む構造化 JSON を出力）

## [1.1.0] - 2026-02-19

### 追加
- アクティブでないタスクを退避する icebox ステータスを追加
- `task update` コマンドにファイルから本文を読み込む `--file` オプションを追加 (`agkan task update <id> body --file <path>`)
- AIエージェント協働ドキュメントの `agent-guide` コマンドを追加

### 修正
- タイムスタンプが同一の場合のタグソート順を確定的に修正

### 変更
- agent guide コンテンツを英語に翻訳
- README のセクション構成を整理

### 削除
- package.json から無効な `akan` bin エイリアスを削除

## [1.0.0] - 2026-02-13

### Added
- Initial release of agkan CLI tool
- Task management commands: `add`, `list`, `get`, `update`, `delete`
- Five task statuses: `backlog`, `ready`, `in_progress`, `done`, `closed`
- Task fields: title, body, author, status, created_at, updated_at
- Attachment system for files
- File service for reading markdown files
- SQLite database backend with better-sqlite3
- Colorized CLI output with chalk
- Status-based filtering and author-based filtering
- Formatted date display
- Comprehensive test suite with vitest
