# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
