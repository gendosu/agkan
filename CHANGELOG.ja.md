# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
