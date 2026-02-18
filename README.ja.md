# agkan

[![Test](https://github.com/gendosu/agkan/workflows/Test/badge.svg)](https://github.com/gendosu/agkan/actions/workflows/test.yml)
[![Quality Check](https://github.com/gendosu/agkan/workflows/Quality%20Check/badge.svg)](https://github.com/gendosu/agkan/actions/workflows/quality.yml)

TypeScriptで実装された軽量なCLIタスク管理ツールです。エージェント（AIアシスタント）との協働作業に最適化されています。

## 特徴

- **シンプルなCLI**: 直感的なコマンドラインインターフェース
- **SQLiteベース**: ローカルでの高速データ管理
- **カンバン形式**: 6つのステータスでタスクを管理（backlog, ready, in_progress, review, done, closed）
- **柔軟な入力**: コマンドライン引数またはMarkdownファイルからタスクを作成
- **フィルタリング**: ステータスや作成者でタスクを絞り込み
- **色分け表示**: ステータスごとに見やすい色分け表示
- **親子関係**: タスクの階層構造を管理（ツリー表示対応）
- **ブロック関係**: タスク間の依存関係を管理（循環参照検出機能付き）
- **タグ機能**: タスクにタグを付けて分類・検索が可能

## インストール

### 前提条件

- Node.js 18以上
- npm

### npmからインストール（推奨）

グローバルコマンドとしてインストール:
```bash
npm install -g agkan
```

これで `agkan` コマンドがシステム全体で使用可能になります。

### GitHubからインストール

リポジトリから直接インストール:
```bash
npm install -g https://github.com/gendosu/agkan.git
```

## 使用方法

### タスクの作成

基本的なタスク作成:
```bash
agkan task add "タスクのタイトル" "タスクの説明"
```

オプション付きでタスク作成:
```bash
agkan task add "ログイン機能の実装" "ユーザー認証システムを実装" \
  --status ready \
  --author "developer-name"
```

親タスクを指定してタスク作成:
```bash
agkan task add "子タスク" "詳細な作業項目" --parent 1
```

Markdownファイルからタスク作成:
```bash
agkan task add "設計書レビュー" --file ./design-doc.md --status backlog
```

### タスク一覧の表示

全タスクを表示:
```bash
agkan task list
```

ツリー形式で表示（親子関係を含む）:
```bash
agkan task list --tree
```

ルートタスクのみ表示（親を持たないタスク）:
```bash
agkan task list --root-only
```

ステータスでフィルタリング:
```bash
agkan task list --status in_progress
```

作成者でフィルタリング:
```bash
agkan task list --author "developer-name"
```

複合フィルター:
```bash
agkan task list --status ready --author "developer-name"
```

タグでフィルタリング:
```bash
agkan task list --tag "frontend"
```

### タスクの検索

キーワードでタスクを検索（タイトルと本文を対象）:
```bash
agkan task find "検索キーワード"
```

完了済みタスクも含めて検索:
```bash
agkan task find "検索キーワード" --all
```

注: デフォルトでは、`done`と`closed`のタスクは検索結果から除外されます。

### タスク詳細の取得

```bash
agkan task get 1
```

### タスクの更新

ステータスを変更:
```bash
agkan task update 1 status done
```

タイトルを変更:
```bash
agkan task update 1 title "新しいタイトル"
```

本文を変更:
```bash
agkan task update 1 body "新しい説明文"
```

作成者を変更:
```bash
agkan task update 1 author "new-author"
```

### 親子関係の管理

親タスクの更新:
```bash
# タスク2の親をタスク1に設定
agkan task update-parent 2 1

# タスク2の親を解除（孤立化）
agkan task update-parent 2 null
```

注意事項:
- 親タスクを削除すると、子タスクの親参照は自動的に解除されます（孤立化）
- 循環参照は自動的に検出され、エラーとなります

### ブロック関係の管理

ブロック関係の追加（タスク1がタスク2をブロック）:
```bash
agkan task block add 1 2
```

ブロック関係の削除:
```bash
agkan task block remove 1 2
```

ブロック関係の一覧表示:
```bash
# タスク1に関連するブロック関係を表示
agkan task block list 1
```

注意事項:
- 循環参照は自動的に検出され、エラーとなります
- ブロック関係はタスク削除時に自動的に削除されます（CASCADE DELETE）

### タスクの削除

タスクを削除:
```bash
agkan task delete 1
```

### タグ管理

タグを作成:
```bash
agkan task tag add "frontend"
```

タグ一覧を表示:
```bash
agkan task tag list
```

タグを削除:
```bash
agkan task tag delete "frontend"
```

### タスクへのタグ付け

タスクにタグを付与:
```bash
agkan task tag attach 1 "frontend"
```

タスクからタグを削除:
```bash
agkan task tag detach 1 "frontend"
```

タスクに付けられたタグを表示:
```bash
agkan task tag show 1
```

### メタデータの管理

メタデータを設定:
```bash
agkan task meta set 1 priority high
```

メタデータを取得:
```bash
agkan task meta get 1 priority
```

メタデータ一覧を表示:
```bash
agkan task meta list 1
```

メタデータを削除:
```bash
agkan task meta delete 1 priority
```

#### 優先度 (priority)

タスクの優先度は `priority` キーで管理します:

| 値 | 意味 |
|-----|------|
| `critical` | 即時対応が必要。ブロッカーとなっている問題 |
| `high` | 優先して着手すべきタスク |
| `medium` | 通常の優先度（デフォルト） |
| `low` | 余裕があれば対応するタスク |

### タスクのカウント

全ステータスのタスク数を表示:
```bash
agkan task count
```

特定のステータスのタスク数を表示:
```bash
agkan task count --status in_progress
```

スクリプト用の出力（数値のみ）:
```bash
agkan task count -s in_progress -q
```

### ヘルプの表示

コマンド一覧:
```bash
agkan --help
```

タスクコマンドのヘルプ:
```bash
agkan task --help
```

個別コマンドのヘルプ:
```bash
agkan task add --help
```

## JSON出力フォーマット

agkanは9つのデータ取得・表示コマンドで、機械可読なJSON出力をサポートしています。`--json`フラグを追加することで、人間が読みやすいテキストの代わりに構造化されたデータを出力できます。

### 対応コマンド

以下のコマンドがJSON出力をサポートしています:

- `task add` - 新しいタスクを作成
- `task list` - タスク一覧を表示（フィルタリング付き）
- `task get` - タスク詳細を取得
- `task find` - キーワードでタスクを検索
- `task count` - ステータス別のタスク数をカウント
- `task update-parent` - 親子関係を更新
- `task block list` - ブロック関係を一覧表示
- `task tag list` - 全タグをタスク数と共に一覧表示
- `task tag show` - 特定のタスクのタグを表示
- `task meta list` - タスクのメタデータ一覧を表示

### 出力構造

すべてのJSONレスポンスは以下のパターンに従います:

**成功レスポンス**には以下が含まれます:
- 操作固有のデータ（task、tasksの配列、counts など）
- 関連データ（parent、blockedBy、blocking、tags など）
- 書き込み操作の場合はオプションで`success: true`フィールド

**エラーレスポンス**は以下のフォーマットに従います:
```json
{
  "success": false,
  "error": {
    "message": "エラーの説明"
  }
}
```

### 一般的な使用例

**1. スクリプティングと自動化**
```bash
# CI/CDパイプライン用のタスク数を取得
TASK_COUNT=$(agkan task count --status backlog --json | jq '.counts.backlog')

# 処理用にタスクIDを抽出
agkan task list --status ready --json | jq -r '.tasks[].id'
```

**2. 他ツールとの統合**
```bash
# タスクを外部システムにエクスポート
agkan task list --json | jq '.tasks' > tasks.json

# ブロック関係を処理
agkan task block list 1 --json | jq '.blockedBy[].title'
```

**3. 検証とテスト**
```bash
# タスク作成を検証
RESULT=$(agkan task add "Test" --json)
echo $RESULT | jq -e '.success == true' && echo "Success"
```

JSON出力フォーマット:
```bash
agkan task add "Fix bug in login" --json
```

```json
{
  "success": true,
  "task": {
    "id": 1,
    "title": "Fix bug in login",
    "status": "backlog",
    "body": null,
    "author": null,
    "parent_id": null,
    "created_at": "2026-02-15T00:00:00.000Z",
    "updated_at": "2026-02-15T00:00:00.000Z"
  },
  "parent": null,
  "blockedBy": [],
  "blocking": []
}
```

JSON出力フォーマット:
```bash
agkan task list --json
```

```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Implement login feature",
      "status": "in_progress",
      "body": "Implement user authentication system",
      "author": "developer-name",
      "parent_id": null,
      "created_at": "2026-02-15T00:00:00.000Z",
      "updated_at": "2026-02-15T00:00:00.000Z"
    },
    {
      "id": 2,
      "title": "Design review",
      "status": "backlog",
      "body": null,
      "author": null,
      "parent_id": null,
      "created_at": "2026-02-15T00:00:00.000Z",
      "updated_at": "2026-02-15T00:00:00.000Z"
    }
  ]
}
```

JSON出力フォーマット:
```bash
agkan task find "login" --json
```

```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Implement login feature",
      "status": "in_progress",
      "body": "Implement user authentication system",
      "author": "developer-name",
      "parent_id": null,
      "created_at": "2026-02-15T00:00:00.000Z",
      "updated_at": "2026-02-15T00:00:00.000Z"
    }
  ]
}
```

JSON出力フォーマット:
```bash
agkan task get 1 --json
```

```json
{
  "task": {
    "id": 1,
    "title": "Implement login feature",
    "status": "in_progress",
    "body": "Implement user authentication system",
    "author": "developer-name",
    "parent_id": null,
    "created_at": "2026-02-15T00:00:00.000Z",
    "updated_at": "2026-02-15T00:00:00.000Z"
  }
}
```

JSON出力フォーマット:
```bash
agkan task update-parent 2 1 --json
```

```json
{
  "success": true,
  "task": {
    "id": 2,
    "title": "Child Task",
    "status": "backlog",
    "body": null,
    "author": null,
    "parent_id": 1,
    "created_at": "2026-02-15T00:00:00.000Z",
    "updated_at": "2026-02-15T00:00:00.000Z"
  },
  "parent": {
    "id": 1,
    "title": "Parent Task",
    "status": "backlog",
    "body": null,
    "author": null,
    "parent_id": null,
    "created_at": "2026-02-15T00:00:00.000Z",
    "updated_at": "2026-02-15T00:00:00.000Z"
  }
}
```

JSON出力フォーマット:
```bash
agkan task block list 2 --json
```

```json
{
  "task": {
    "id": 2,
    "title": "API implementation",
    "status": "backlog"
  },
  "blockedBy": [
    {
      "id": 1,
      "title": "Database design",
      "status": "in_progress"
    }
  ],
  "blocking": [
    {
      "id": 3,
      "title": "Frontend implementation",
      "status": "backlog"
    }
  ]
}
```

全ステータスのJSON出力フォーマット:
```bash
agkan task count --json
```

```json
{
  "total": 10,
  "counts": {
    "backlog": 3,
    "ready": 2,
    "in_progress": 4,
    "done": 1,
    "closed": 0
  }
}
```

特定ステータスのJSON出力フォーマット:
```bash
agkan task count --status in_progress --json
```

```json
{
  "status": "in_progress",
  "count": 4
}
```

JSON出力フォーマット:
```bash
agkan task tag list --json
```

```json
{
  "totalCount": 2,
  "tags": [
    {
      "id": 1,
      "name": "frontend",
      "taskCount": 3,
      "created_at": "2026-02-15T00:00:00.000Z"
    },
    {
      "id": 2,
      "name": "backend",
      "taskCount": 1,
      "created_at": "2026-02-15T00:00:00.000Z"
    }
  ]
}
```

JSON出力フォーマット:
```bash
agkan task tag show 1 --json
```

```json
{
  "task": {
    "id": 1,
    "title": "Implement login screen",
    "status": "in_progress"
  },
  "tags": [
    {
      "id": 1,
      "name": "frontend",
      "created_at": "2026-02-15T00:00:00.000Z"
    },
    {
      "id": 3,
      "name": "urgent",
      "created_at": "2026-02-15T00:00:00.000Z"
    }
  ]
}
```

## 使用例

### 親子関係を使った階層的なタスク管理

プロジェクトを親タスク、個別の作業を子タスクとして管理する例:

```bash
# 親タスクを作成
agkan task add "Webサイトのリニューアル"
# 出力: Task created with ID: 1

# 子タスクを作成
agkan task add "デザインカンプ作成" --parent 1
agkan task add "フロントエンド実装" --parent 1
agkan task add "バックエンド実装" --parent 1

# ツリー形式で表示
agkan task list --tree
# 出力:
# 1 [backlog] Webサイトのリニューアル
#   ├─ 2 [backlog] デザインカンプ作成
#   ├─ 3 [backlog] フロントエンド実装
#   └─ 4 [backlog] バックエンド実装

# タスク詳細を表示（親情報を含む）
agkan task get 2
# 出力:
# ID: 2
# Title: デザインカンプ作成
# Parent ID: 1
# ...

# 親を変更
agkan task add "UI/UX改善"
# 出力: Task created with ID: 5
agkan task update-parent 2 5

# 親を解除（孤立化）
agkan task update-parent 2 null
```

### ブロック関係を使った依存関係の管理

タスク間の依存関係を明示的に管理する例:

```bash
# タスクを作成
agkan task add "データベース設計"
# 出力: Task created with ID: 1

agkan task add "API実装"
# 出力: Task created with ID: 2

agkan task add "フロントエンド実装"
# 出力: Task created with ID: 3

# ブロック関係を設定（1がデータベース設計、2がAPI実装、3がフロントエンド実装）
# データベース設計がAPI実装をブロック
agkan task block add 1 2

# API実装がフロントエンド実装をブロック
agkan task block add 2 3

# ブロック関係を確認
agkan task block list 1
# 出力:
# Task 1 blocks:
#   - Task 2 (API実装)
# Task 1 is blocked by:
#   (none)

agkan task block list 2
# 出力:
# Task 2 blocks:
#   - Task 3 (フロントエンド実装)
# Task 2 is blocked by:
#   - Task 1 (データベース設計)

# 循環参照を試みる（エラーになる）
agkan task block add 3 1
# 出力: Error: Circular reference detected

# ブロック関係を削除
agkan task block remove 1 2
```

### タグを使ったタスク管理

タスクにタグを付けて分類する例:

```bash
# タグを作成
agkan task tag add "frontend"
agkan task tag add "backend"
agkan task tag add "urgent"

# タスクを作成してタグを付与
agkan task add "ログイン画面の実装"
# 出力: Task created with ID: 1

agkan task tag attach 1 "frontend"
agkan task tag attach 1 "urgent"

agkan task add "API開発"
# 出力: Task created with ID: 2

agkan task tag attach 2 "backend"

# タグでフィルタリング
agkan task list --tag "frontend"
# 出力:
# 1 [backlog] ログイン画面の実装 (tags: frontend, urgent)

# タスクのタグを確認
agkan task tag show 1
# 出力:
# Tags for task 1:
#   - frontend
#   - urgent

# タグを削除
agkan task tag detach 1 "urgent"

# タグ自体を削除（関連するすべてのタスクから削除される）
agkan task tag delete "urgent"
```

## タスクステータス

- **backlog**: 未着手のタスク（グレー表示）
- **ready**: 着手可能なタスク（青色表示）
- **in_progress**: 作業中のタスク（黄色表示）
- **review**: レビュー中のタスク（シアン表示）
- **done**: 完了したタスク（緑色表示）
- **closed**: クローズされたタスク（マゼンタ表示）

## 設定

### データベースの保存場所

agkanは、データベースの保存場所を設定ファイルでカスタマイズできます。

#### 設定ファイル: `.agkan.yml`

プロジェクトのルートディレクトリに`.agkan.yml`ファイルを作成することで、データベースの保存場所を指定できます。

**設定例:**

```yaml
# データベースファイルのパス
path: ./.agkan/data.db
```

#### パスの指定方法

- **相対パス**: カレントディレクトリからの相対パスとして解決されます
  ```yaml
  path: ./data/kanban.db
  path: ./.agkan/data.db
  ```

- **絶対パス**: そのままのパスが使用されます
  ```yaml
  path: /home/user/.config/agkan/data.db
  ```

#### 環境変数による設定

agkanは `AGENT_KANBAN_DB_PATH` 環境変数によるデータベースの場所指定をサポートしています。CI/CD環境や複数環境の管理に特に有用です。

**環境変数の設定例:**

```bash
# カスタムデータベースパスを使用
export AGENT_KANBAN_DB_PATH=/path/to/your/database.db
agkan task list

# 絶対パスを使用
export AGENT_KANBAN_DB_PATH=/home/user/.config/agkan/data.db

# 相対パスを使用
export AGENT_KANBAN_DB_PATH=./custom/location/data.db
```

**優先順位:**

データベースパスは以下の優先順位で解決されます:

**通常モード (`NODE_ENV` が `test` でない場合):**
1. **環境変数**（最高優先）: `AGENT_KANBAN_DB_PATH`
2. **設定ファイル**（フォールバック）: `.agkan.yml` の `path` フィールド
3. **デフォルトパス**（最低優先）: `.agkan/data.db`

**テストモード (`NODE_ENV=test` の場合):**
1. **環境変数**（最高優先）: `AGENT_KANBAN_DB_PATH`
2. **設定ファイル**（フォールバック）: `.agkan-test.yml` の `path` フィールド
3. **デフォルトパス**（最低優先）: `.agkan-test/data.db`

**テストモードについて:**

テストモード（`NODE_ENV=test`）では、テストデータと本番データを自動的に分離します:

- 別の設定ファイルを使用: `.agkan.yml` の代わりに `.agkan-test.yml`
- 別のデフォルトディレクトリを使用: `.agkan/` の代わりに `.agkan-test/`
- テストモードでも環境変数が最高優先になります

**使用例:**

```bash
# CI/CDパイプライン（一時DBを使用）
export AGENT_KANBAN_DB_PATH=/tmp/ci-test-db.db
agkan task list

# 複数環境の管理
export AGENT_KANBAN_DB_PATH=./dev/data.db      # 開発環境
export AGENT_KANBAN_DB_PATH=./staging/data.db  # ステージング環境

# テストの実行
NODE_ENV=test npm test
# デフォルトで .agkan-test/data.db を使用

# カスタムテストDBで実行
NODE_ENV=test AGENT_KANBAN_DB_PATH=/tmp/test.db npm test
```

#### デフォルトの動作

`.agkan.yml`ファイルが存在せず、環境変数も設定されていない場合、データベースは以下の場所に作成されます：

```
<カレントディレクトリ>/.agkan/data.db
```

テストモード（`NODE_ENV=test`）の場合のデフォルト:

```
<カレントディレクトリ>/.agkan-test/data.db
```

#### プロジェクトごとの管理

プロジェクトごとに異なるタスク管理を行いたい場合は、各プロジェクトのルートに`.agkan.yml`を配置してください：

```bash
# プロジェクトA
cd /path/to/projectA
cat > .agkan.yml << EOF
path: ./.agkan/data.db
EOF

# プロジェクトB
cd /path/to/projectB
cat > .agkan.yml << EOF
path: ./.agkan/data.db
EOF
```

これにより、各プロジェクトで独立したタスク管理が可能になります。

## 実装予定機能

### タスクの添付ファイル

タスクへのファイル添付機能は現在開発中です。この機能により、ユーザーはタスクにファイルを添付し、より良いコンテキストとドキュメントを提供できるようになります。

**予定されているCLIコマンド:**
- `agkan task attach add <task-id> <file-path>` - タスクにファイルを添付
- `agkan task attach list <task-id>` - タスクのすべての添付ファイルを一覧表示
- `agkan task attach delete <attachment-id>` - タスクから添付ファイルを削除

実装予定機能の詳細については、[docs/planned-features.md](docs/planned-features.md)を参照してください。

## 技術スタック

- **言語**: TypeScript 5.x
- **CLI フレームワーク**: Commander.js
- **データベース**: SQLite3 (better-sqlite3)
- **ターミナル表示**: Chalk
- **ビルドツール**: TypeScript Compiler

## プロジェクト構成

```
agkan/
├── bin/
│   └── agkan                        # CLIエントリーポイント
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── block/               # ブロック関係コマンド
│   │   │   │   ├── add.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── remove.ts
│   │   │   ├── meta/                # メタデータコマンド
│   │   │   │   ├── delete.ts
│   │   │   │   ├── get.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── set.ts
│   │   │   ├── tag/                 # タグコマンド
│   │   │   │   ├── add.ts
│   │   │   │   ├── attach.ts
│   │   │   │   ├── delete.ts
│   │   │   │   ├── detach.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── show.ts
│   │   │   └── task/                # タスクコマンド
│   │   │       ├── add.ts
│   │   │       ├── count.ts
│   │   │       ├── delete.ts
│   │   │       ├── find.ts
│   │   │       ├── get.ts
│   │   │       ├── list.ts
│   │   │       ├── update-parent.ts
│   │   │       └── update.ts
│   │   ├── utils/                   # CLIユーティリティ
│   │   └── index.ts                 # CLIエントリー・コマンド登録
│   ├── db/
│   │   ├── config.ts                # DB設定
│   │   ├── connection.ts            # データベース接続管理
│   │   ├── schema.ts                # スキーマ定義・マイグレーション
│   │   └── reset.ts                 # テスト用DBリセット
│   ├── models/
│   │   ├── Task.ts                  # タスクモデル
│   │   ├── Tag.ts                   # タグモデル
│   │   ├── TaskBlock.ts             # ブロック関係モデル
│   │   ├── TaskMetadata.ts          # メタデータモデル
│   │   ├── TaskTag.ts               # タスク-タグ関連モデル
│   │   └── index.ts
│   ├── services/
│   │   ├── TaskService.ts           # タスク管理ビジネスロジック
│   │   ├── TagService.ts            # タグ管理ビジネスロジック
│   │   ├── TaskBlockService.ts      # ブロック関係管理
│   │   ├── TaskTagService.ts        # タスク-タグ関連管理
│   │   ├── MetadataService.ts       # メタデータ管理
│   │   ├── FileService.ts           # ファイル読み込み
│   │   └── index.ts
│   └── utils/
│       ├── format.ts                # フォーマットユーティリティ
│       ├── cycle-detector.ts        # 循環参照検出
│       ├── input-validators.ts      # 入力バリデーション
│       └── security.ts              # セキュリティユーティリティ
├── dist/                            # ビルド出力ディレクトリ
├── package.json
├── tsconfig.json
└── README.md
```

## データベーススキーマ

### tasks テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| title | TEXT | タスクタイトル（必須） |
| body | TEXT | タスク本文 |
| status | TEXT | ステータス（backlog, ready, in_progress, review, done, closed） |
| author | TEXT | 作成者 |
| parent_id | INTEGER | 親タスクID（外部キー、NULL可） |
| created_at | TEXT | 作成日時（ISO 8601形式） |
| updated_at | TEXT | 更新日時（ISO 8601形式） |

注意事項:
- `parent_id`は親タスクが削除されると自動的にNULLに設定されます（ON DELETE SET NULL）

### attachments テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| task_id | INTEGER | タスクID（外部キー） |
| file_path | TEXT | ファイルパス（必須） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

### task_blocks テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| blocker_task_id | INTEGER | ブロックするタスクID（外部キー） |
| blocked_task_id | INTEGER | ブロックされるタスクID（外部キー） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

注意事項:
- `blocker_task_id`と`blocked_task_id`の組み合わせはユニーク制約があります
- いずれかのタスクが削除されるとブロック関係も自動的に削除されます（ON DELETE CASCADE）

### tags テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| name | TEXT | タグ名（必須、ユニーク） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

### task_tags テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| task_id | INTEGER | タスクID（外部キー） |
| tag_id | INTEGER | タグID（外部キー） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

注意事項:
- `task_id`と`tag_id`の組み合わせはユニーク制約があります
- タスクまたはタグが削除されると関連付けも自動的に削除されます（ON DELETE CASCADE）

### task_metadata テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| task_id | INTEGER | タスクID（外部キー） |
| key | TEXT | メタデータのキー |
| value | TEXT | メタデータの値 |
| created_at | TEXT | 作成日時（ISO 8601形式） |

注意事項:
- `task_id`と`key`の組み合わせはユニーク制約があります
- タスクが削除されるとメタデータも自動的に削除されます（ON DELETE CASCADE）

## 開発

### 開発者向けセットアップ

agkan自体の開発に参加したい開発者向けの手順:

1. リポジトリをクローン:
```bash
git clone https://github.com/gendosu/agkan.git
cd agkan
```

2. 依存パッケージをインストール:
```bash
npm install
```

3. TypeScriptコードをビルド:
```bash
npm run build
```

4. グローバルコマンドとして登録:
```bash
npm link
```

### 開発ガイドライン

包括的な開発情報については、以下のドキュメントを参照してください:

- **[TESTING.md](TESTING.md)** - テストガイド、カバレッジ実行、テストパターン
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - コントリビューションガイドラインとTDDプラクティス
- **[docs/TDD-GUIDE.md](docs/TDD-GUIDE.md)** - 実践例を含むテスト駆動開発ガイド
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - プロジェクトアーキテクチャとデザインパターン

### コード品質

このプロジェクトではコード品質のためにESLintとPrettierを使用しています:

```bash
npm run lint        # コードをチェック
npm run lint:fix    # 問題を自動修正
npm run format      # コードをフォーマット
npm run check       # 全チェックを実行
```

### テスト

#### ユニットテスト

Vitestを使用したユニットテストを実行:
```bash
npm test
```

全てのサービス層とモデル層がテストされています。

#### E2Eテスト

実際のCLIコマンドを実行する包括的なE2Eテストを実行:
```bash
npm run test:e2e
```

E2Eテストは以下の機能をカバーします:
- ビルドとユニットテスト
- タグ管理機能（作成、一覧、削除、重複チェック）
- タグ付与機能（付与、解除、表示、重複チェック）
- タグフィルタリング（単一タグ、複数タグ、ステータス組み合わせ）
- CASCADE削除（データベース整合性確認）

テストはローカルのテスト用データベース（`.agkan-test/test-e2e.db`）を使用し、実行後に自動的にクリーンアップされます。

### ビルド

```bash
npm run build
```

### 開発時の自動ビルド

```bash
npm run dev
```

### TypeScript型チェック

```bash
npx tsc --noEmit
```

### データベースの初期化

データベースは最初のコマンド実行時に自動的に作成されます。手動で再作成する場合:

```bash
rm -rf data/agkan.db
agkan task list  # データベースが再作成されます
```

## ライセンス

ISC

## 作成者

Generated with Claude Code
