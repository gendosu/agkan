# agkan

[![Test](https://github.com/gendosu/agkan/workflows/Test/badge.svg?branch=main)](https://github.com/gendosu/agkan/actions/workflows/test.yml)
[![Quality Check](https://github.com/gendosu/agkan/workflows/Quality%20Check/badge.svg?branch=main)](https://github.com/gendosu/agkan/actions/workflows/quality.yml)

TypeScriptで実装された軽量なCLIタスク管理ツールです。エージェント（AIアシスタント）との協働作業に最適化されています。

![agkan カンバンボード](docs/assets/readme-board.png)

## 目次

- [特徴](#特徴)
- [クイックスタート](#クイックスタート)
- [コマンド早見表](#コマンド早見表)
- [Claude Code連携](#claude-code連携)
- [設定](#設定)
- [タスクステータス](#タスクステータス)
- [ドキュメント](#ドキュメント)
- [ライセンス](#ライセンス)

## 特徴

**タスク管理**
- シンプルで直感的なCLI。ステータスごとに色分けされた表示
- SQLiteベースのローカルストレージ — サーバーやアカウント不要
- 柔軟な入力: コマンドライン引数またはMarkdownファイルからタスクを作成
- ステータス・作成者・タグでの絞り込み、キーワード検索
- メタデータ: `priority` のようなキーバリューデータをタスクに付与

**依存関係**
- ツリー表示対応の親子関係
- タスク間のブロック関係。循環参照は自動検出
- タグによるタスクの分類・検索

**カンバンボード**
- ローカルWebベースのカンバンボードビューア（`agkan board`）
- 7ステータスのワークフロー: icebox, backlog, ready, in_progress, review, done, closed

**AI連携**
- タスクカードから直接Claudeの実行・プランニングが可能。ライブ出力ストリーム付き
- タスクごとの過去のClaude実行履歴（Run Logs）
- Claude Code向けの補完パッケージ [agkan-skills](https://github.com/gendosu/agkan-skills)

## クイックスタート

Node.js 20以上が必要です。

**1. インストール**
```bash
npm install -g agkan
```
リポジトリから直接インストールすることもできます: `npm install -g https://github.com/gendosu/agkan.git`

**2. プロジェクトを初期化**
```bash
agkan init
```
```
✓ Created .agkan.yml
✓ Created .agkan/
```
これによりClaude CodeのSessionStart hookも登録され、セッション開始時に
最小限のagkan使用ガイドが自動でロードされます。Claude Codeを使わない場合は
無視して問題ありません。

**3. タスクを作成**
```bash
agkan task add "ログイン機能の実装" --status ready
```
```
Task created with ID: 1
```
`--parent`、`--tag`、`--file` でさらにカスタマイズできます。

**4. タスク一覧を表示**
```bash
agkan task list
```
```
1 [ready] ログイン機能の実装
```
`--tree` で親子関係を含めて表示、`--status`/`--tag` で絞り込みができます。

**5. カンバンボードを開く**
```bash
agkan board
```
```
Board running at http://localhost:8080
```
ポートは `agkan board -p 3000` または `.agkan.yml` の `board.port` でカスタマイズできます。

## コマンド早見表

全コマンドの一行サマリー:

| コマンド | 説明 |
|---------|------|
| `agkan init` | プロジェクトでagkanを初期化 |
| `agkan task add` | タスクを新規作成 |
| `agkan task list` | タスク一覧を表示（フィルタ付き） |
| `agkan task find` | キーワードでタスクを検索 |
| `agkan task get` | タスク詳細を表示 |
| `agkan task update` | タスクのステータス・タイトル・本文・作成者を更新 |
| `agkan task update-parent` | タスクの親を設定・解除 |
| `agkan task block add` | ブロック関係を追加 |
| `agkan task block remove` | ブロック関係を削除 |
| `agkan task block list` | タスクのブロック関係を一覧表示 |
| `agkan task delete` | タスクを削除 |
| `agkan tag add` | タグを作成 |
| `agkan tag list` | タグ一覧を表示 |
| `agkan tag delete` | タグを削除 |
| `agkan tag attach` | タスクにタグを付与 |
| `agkan tag detach` | タスクからタグを削除 |
| `agkan tag show` | タスクのタグを表示 |
| `agkan task meta set` | タスクにメタデータキーを設定 |
| `agkan task meta get` | タスクのメタデータ値を取得 |
| `agkan task meta list` | タスクの全メタデータを一覧表示 |
| `agkan task meta delete` | タスクからメタデータキーを削除 |
| `agkan task count` | ステータス別のタスク数をカウント |
| `agkan board` | ローカルカンバンボードビューアを起動 |
| `agkan ps` | 現在実行中のClaudeプロセスを一覧表示 |
| `agkan config get` | 解決済みの設定値を表示 |
| `agkan --help` | コマンドヘルプを表示 |

各コマンドは該当する箇所で`--json`による機械可読な出力に対応しており、上記の多くのコマンドには追加オプションもあります。全オプション一覧・JSON出力フォーマット・使用例は **[documentation/cli-reference.ja.md](documentation/cli-reference.ja.md)** を参照してください。

## Claude Code連携

カンバンボードにはブラウザから直接Claudeを実行するための機能が組み込まれています:

- **Run** — タスクに対して `claude` を起動。ボタン横のドロップダウンからプランモードでの実行も可能
- **Plan** — 実行せずに計画のみを生成するプランモードで `claude` を起動
- **ストリームモーダル** — 実行中のClaudeプロセスのライブ出力を表示。Stopボタンで終了可能
- **実行中インジケーター** — Claudeプロセスが動作中の場合、ヘッダーにインジケーターを表示
- **Run Logs** — タスク詳細パネルのタブに、過去のClaude実行履歴（タイムスタンプと全出力）を表示

自動でのタスク実行・プランニング・レビューのワークフローには、Claude Code向けの補完パッケージ **[agkan-skills](https://github.com/gendosu/agkan-skills)** をインストールしてください。

## 設定

プロジェクトのルートに `.agkan.yml` を作成してagkanをカスタマイズします:

```yaml
# データベースファイルのパス
path: ./.agkan/data.db

# ボード設定
board:
  port: 8080
```

データベースパスは `AGENT_KANBAN_DB_PATH` 環境変数でも上書きでき、`.agkan.yml` より優先されます。

`.agkan.yml` は以下もサポートしています:
- `models.planning` / `models.run` — ボードからplanning/runタスクを実行する際に使用するClaudeモデルとeffortレベル
- `permissionMode` — ボードからタスクを実行する際に渡されるClaude CLIのパーミッションフラグ

全フィールドリファレンス・パス解決の優先順位・テストモードの挙動については **[documentation/configuration.ja.md](documentation/configuration.ja.md)** を参照してください。

## タスクステータス

| ステータス | 意味 | ボード表示色 |
|-----------|------|-------------|
| `icebox` | 積極的に検討していない凍結タスク | 白 |
| `backlog` | 未着手 | グレー |
| `ready` | 着手可能 | 青 |
| `in_progress` | 作業中 | 黄 |
| `review` | レビュー中 | シアン |
| `done` | 完了 | 緑 |
| `closed` | クローズ | マゼンタ |

## ドキュメント

| ドキュメント | 説明 |
|-------------|------|
| [documentation/cli-reference.ja.md](documentation/cli-reference.ja.md) | 全コマンドリファレンス・オプション・JSON出力フォーマット |
| [documentation/configuration.ja.md](documentation/configuration.ja.md) | `.agkan.yml` の全フィールドリファレンス |
| [documentation/database-schema.ja.md](documentation/database-schema.ja.md) | データベーススキーマリファレンス |
| [documentation/project-structure.ja.md](documentation/project-structure.ja.md) | ディレクトリ構成 |
| [documentation/development.ja.md](documentation/development.ja.md) | 開発者向けセットアップ・技術スタック・テスト・ビルド |
| [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md) | コントリビューションガイドラインとTDDプラクティス |
| [CHANGELOG.ja.md](CHANGELOG.ja.md) | リリース履歴 |

## ライセンス

ISC

## 作成者

GENDOSU
