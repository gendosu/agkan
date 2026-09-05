# CLIリファレンス

agkanの全コマンド・オプション・JSON出力フォーマットを網羅したリファレンスです。

## 目次

- [使用方法](#使用方法)
  - [プロジェクトの初期化](#プロジェクトの初期化)
  - [タスクの作成](#タスクの作成)
  - [タスク一覧の表示](#タスク一覧の表示)
  - [タスクの検索](#タスクの検索)
  - [タスク詳細の取得](#タスク詳細の取得)
  - [タスクの更新](#タスクの更新)
  - [親子関係の管理](#親子関係の管理)
  - [ブロック関係の管理](#ブロック関係の管理)
  - [タスクの削除](#タスクの削除)
  - [タグ管理](#タグ管理)
  - [タスクへのタグ付け](#タスクへのタグ付け)
  - [メタデータの管理](#メタデータの管理)
  - [タスクのカウント](#タスクのカウント)
  - [カンバンボード (Web UI)](#カンバンボード-web-ui)
  - [Claudeプロセスの状態確認](#claudeプロセスの状態確認)
  - [設定確認](#設定確認)
  - [ヘルプの表示](#ヘルプの表示)
- [JSON出力フォーマット](#json出力フォーマット)
  - [対応コマンド](#対応コマンド)
  - [出力構造](#出力構造)
  - [一般的な使用例](#一般的な使用例)
- [使用例](#使用例)
  - [親子関係を使った階層的なタスク管理](#親子関係を使った階層的なタスク管理)
  - [ブロック関係を使った依存関係の管理](#ブロック関係を使った依存関係の管理)
  - [タグを使ったタスク管理](#タグを使ったタスク管理)

## 使用方法

### プロジェクトの初期化

プロジェクトディレクトリで `agkan init` を実行して agkan をセットアップします:

```bash
agkan init
```

以下のファイルが作成されます:
- `.agkan.yml` — 設定ファイル
- `.agkan/` — データディレクトリ

`agkan init` は `.claude/settings.local.json` に SessionStart hook も登録し、
Claude Code のセッション開始時に最小限の agkan 使用ガイドを自動でロードします。
hook は `agkan context --hook` を呼び出します。既存設定との競合を避けるため
冪等にマージし、関係のないキーには触れません。Claude Code を使わない場合は
生成されたファイルを無視しても問題ありません。

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

タスク単位でモデルと reasoning effort を指定して作成:
```bash
agkan task add "パーサーのリファクタ" --model-run sonnet --effort-run high
```

`--model-planning` / `--model-run` に指定できるのは[モデルカタログ](configuration.ja.md#モデルカタログ)の `model` 名です。モデルを選ぶと、そのタスクを実行する cli も決まります。`--effort-planning` / `--effort-run` に指定できるのはそのモデルの `efforts`（モデル未指定なら既定の `agent:` に属する行の和集合）です。解決後のカタログは `agkan config get modelCatalog --json` で確認できます。

タグ付きでタスク作成（カンマ区切りのタグ名またはID、同じコマンドで付与）:
```bash
agkan task add "ログイン機能の実装" --tag "frontend,urgent"
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

### タスク詳細の取得

```bash
agkan task get 1
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

モデルと effort を変更（空文字でクリア）:
```bash
agkan task update 1 --model-run haiku --effort-run low
agkan task update 1 --model-run "" --effort-run ""
```

値は[モデルカタログ](configuration.ja.md#モデルカタログ)に対してペアで検証されます。指定しなかった側は、タスクに保存済みの値が使われます。

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

### タスクの削除

タスクを削除:
```bash
agkan task delete 1
```

### タグ管理

タグを作成:
```bash
agkan tag add "frontend"
```

タグ一覧を表示:
```bash
agkan tag list
```

タグを削除:
```bash
agkan tag delete "frontend"
```

タグ一覧のJSON出力フォーマット:
```bash
agkan tag list --json
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

### タスクへのタグ付け

タスクにタグを付与:
```bash
agkan tag attach 1 "frontend"
```

または `task add --tag` でタスク作成と同時にタグを付与（`tag attach` を別途実行する必要がない）:
```bash
agkan task add "ログイン画面の実装" --tag "frontend,urgent"
```

タスクからタグを削除:
```bash
agkan tag detach 1 "frontend"
```

タスクに付けられたタグを表示:
```bash
agkan tag show 1
```

タグ表示のJSON出力フォーマット:
```bash
agkan tag show 1 --json
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

### カンバンボード (Web UI)

ブラウザでローカルのカンバンボードビューアを起動:
```bash
agkan board
```

カスタムポートを指定:
```bash
agkan board -p 3000
```

デフォルトでは `http://localhost:8080` でボードが提供されます。

#### ボードのClaude連携機能

ボードUIにはブラウザから直接Claudeを実行するための機能が組み込まれています:

- **Runボタン**: タスクカードにある「Run」ボタンをクリックすると、そのタスクに対して `claude` を起動します。ボタン横のドロップダウンからプランモードで実行することもできます。
- **Planボタン**: タスクを実行せずに計画のみを生成するプランモードで `claude` を起動します。
- **ストリームモーダル**: Claude実行中はモーダルウィンドウにリアルタイムで出力が表示されます。「Stop」ボタンでプロセスを終了できます。
- **実行中インジケーター**: Claudeプロセスが動作中の場合、ヘッダーにインジケーターが表示されます。
- **実行ログタブ**: タスク詳細パネルの「Run Logs」タブに、過去のClaude実行履歴（タイムスタンプと全出力）が表示されます。

### Claudeプロセスの状態確認

現在実行中のClaudeプロセスを一覧表示します（ボードサーバーが起動している必要があります）:
```bash
agkan ps
```

カスタムポートのボードサーバーに接続:
```bash
agkan ps --port 3000
```

このコマンドはボードサーバーに問い合わせて、現在実行中のClaudeプロセスとそれに関連するタスクを表示します。

JSON出力フォーマット:
```bash
agkan ps --json
```
```json
{
  "processes": [
    {
      "taskId": 42,
      "title": "機能Xの実装",
      "command": "claude"
    }
  ]
}
```

### 設定確認

`.agkan.yml` の設定値（デフォルト適用後の解決済み値）を取得します:

```bash
agkan config get              # 全設定を表示
agkan config get board.port   # 特定キーを取得（ドット記法）
agkan config get --json       # JSON出力
```

出力例:
```
✓ Resolved config

path: /workspace/.agkan/data.db
board.port: 8080
modelCatalog: claude fable (low, medium, high, xhigh, max)
modelCatalog: claude opus (low, medium, high, xhigh, max)
modelCatalog: claude sonnet (low, medium, high, xhigh, max)
modelCatalog: claude haiku (low, medium, high, xhigh, max)
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

agkanは10のデータ取得・表示コマンドで、機械可読なJSON出力をサポートしています。`--json`フラグを追加することで、人間が読みやすいテキストの代わりに構造化されたデータを出力できます。

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
- `ps` - 現在実行中のClaudeプロセスを一覧表示

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
agkan tag add "frontend"
agkan tag add "backend"
agkan tag add "urgent"

# タスクを作成してタグを付与
agkan task add "ログイン画面の実装"
# 出力: Task created with ID: 1

agkan tag attach 1 "frontend"
agkan tag attach 1 "urgent"

agkan task add "API開発"
# 出力: Task created with ID: 2

agkan tag attach 2 "backend"

# --tag を使えば同じコマンドでタグを付与できる
agkan task add "決済フローのバグ修正" --tag "backend,urgent"
# 出力: Task created with ID: 3

# タグでフィルタリング
agkan task list --tag "frontend"
# 出力:
# 1 [backlog] ログイン画面の実装 (tags: frontend, urgent)

# タスクのタグを確認
agkan tag show 1
# 出力:
# Tags for task 1:
#   - frontend
#   - urgent

# タグを削除
agkan tag detach 1 "urgent"

# タグ自体を削除（関連するすべてのタスクから削除される）
agkan tag delete "urgent"
```
