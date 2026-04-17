---
layout: single
title: "コマンドリファレンス"
lang: ja
permalink: /ja/reference/commands/
sidebar:
  nav: "reference_ja"
toc: true
toc_label: "コマンド"
toc_icon: "terminal"
---

<link rel="stylesheet" href="{{ '/assets/css/custom.css' | prepend: site.baseurl }}">

{% include lang-toggle.html %}

このページでは、agkan CLIの全コマンドのリファレンスを提供します。

## グローバルオプション

| オプション | 説明 |
|-----------|------|
| `-V, --version` | バージョン番号を表示 |
| `-h, --help` | コマンドのヘルプを表示 |

## `agkan init`

現在のプロジェクトでagkanの設定とデータディレクトリを初期化します。

```bash
agkan init
```

SQLiteデータベースファイルを含む `.agkan/` ディレクトリを作成します。

---

## `agkan task`

タスク管理コマンド。

### `agkan task add`

新しいタスクを追加します。

```bash
agkan task add [options] [title] [body]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-a, --author <author>` | タスクの作成者 |
| `--assignees <assignees>` | 担当者（カンマ区切り） |
| `-s, --status <status>` | タスクのステータス（デフォルト: `backlog`） |
| `--priority <priority>` | 優先度（デフォルト: `medium`） |
| `-p, --parent <id>` | 親タスクID |
| `--file <path>` | Markdownファイルから本文を読み込む |
| `--blocked-by <ids>` | このタスクをブロックするタスクIDのカンマ区切りリスト |
| `--blocks <ids>` | このタスクがブロックするタスクIDのカンマ区切りリスト |
| `--json` | JSON形式で出力 |

**有効なステータス値:** `icebox`, `backlog`, `ready`, `in_progress`, `review`, `done`, `closed`

**有効な優先度値:** `critical`, `high`, `medium`, `low`

**使用例:**

```bash
# 基本的なタスク作成
agkan task add "ログイン機能を実装する" "ユーザー認証システムの実装"

# ステータスと作者を指定
agkan task add "バグを修正する" "詳細な説明" --status ready --author "dev"

# Markdownファイルから作成
agkan task add "設計レビュー" --file ./design-doc.md --status backlog

# サブタスクを作成
agkan task add "テストを書く" "ログインのユニットテスト" --parent 1

# JSON出力
agkan task add "新しいタスク" --json
```

---

### `agkan task list`

全タスクを一覧表示します。

```bash
agkan task list [options]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-s, --status <status>` | ステータスでフィルタ |
| `-a, --author <author>` | 作者でフィルタ |
| `--assignees <assignees>` | 担当者でフィルタ |
| `-t, --tag <tags>` | タグIDまたは名前でフィルタ（カンマ区切り） |
| `-p, --priority <priorities>` | 優先度でフィルタ（カンマ区切り） |
| `--all` | done/closedを含む全ステータスを表示 |
| `--archived` | アーカイブされたタスクを含める |
| `--tree` | ツリー構造で表示 |
| `--dep-tree` | 依存関係（ブロッキング）ツリーで表示 |
| `--root-only` | ルートタスク（親なし）のみ表示 |
| `--sort <field>` | ソートフィールド（id, title, status, created_at, updated_at, priority） |
| `--order <order>` | ソート順（asc, desc） |
| `--json` | JSON形式で出力 |

**使用例:**

```bash
# アクティブな全タスクを表示
agkan task list

# ステータスでフィルタ
agkan task list --status in_progress

# ツリービュー
agkan task list --tree

# タグでフィルタ
agkan task list --tag "backend"

# 優先度でフィルタ
agkan task list --priority critical,high

# ルートタスクのみ
agkan task list --root-only

# done/closedを含める
agkan task list --all

# JSON出力
agkan task list --json
```

---

### `agkan task get`

IDでタスクを取得します。

```bash
agkan task get <id> [options]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `--json` | JSON形式で出力 |

**使用例:**

```bash
agkan task get 1
agkan task get 1 --json
```

---

### `agkan task update`

タスクのフィールドを更新します。

```bash
agkan task update <id> [options]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `--title <title>` | タイトルを更新 |
| `--status <status>` | ステータスを更新 |
| `--body <body>` | 本文を更新 |
| `--author <author>` | 作者を更新 |
| `--assignees <assignees>` | 担当者を更新 |
| `--priority <priority>` | 優先度を更新 |
| `--file <path>` | ファイルから本文を読み込む |
| `--json` | JSON形式で出力 |

**使用例:**

```bash
agkan task update 1 --status review
agkan task update 1 --title "更新されたタイトル"
agkan task update 1 --body "新しい説明"
agkan task update 1 --priority high
```

---

### `agkan task find`

キーワードでタスクを検索します（タイトルと本文が対象）。

```bash
agkan task find <keyword> [options]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `--all` | done/closedのタスクも検索に含める |
| `--json` | JSON形式で出力 |

**使用例:**

```bash
agkan task find "ログイン"
agkan task find "バグ" --all
agkan task find "機能" --json
```

---

### `agkan task delete`

タスクを削除します。

```bash
agkan task delete <id> [options]
```

**使用例:**

```bash
agkan task delete 1
```

---

### `agkan task count`

ステータス別のタスク数を表示します。

```bash
agkan task count [options]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-s, --status <status>` | 特定のステータスでフィルタ |
| `-q, --quiet` | 数値のみ出力（スクリプト向け） |
| `--json` | JSON形式で出力 |

**使用例:**

```bash
agkan task count
agkan task count --status in_progress
agkan task count -s in_progress -q
agkan task count --json
```

---

### `agkan task update-parent`

タスクの親を更新します。

```bash
agkan task update-parent <id> <parent_id>
```

`null` を使用して親を削除（タスクを孤立させる）:

```bash
agkan task update-parent 2 1      # タスク2の親をタスク1に設定
agkan task update-parent 2 null   # タスク2から親を削除
```

---

### `agkan task copy`

タスクをコピーします。

```bash
agkan task copy <id> [options]
```

---

### `agkan task block`

タスクのブロッキング関係コマンド。

```bash
# ブロッキング関係を追加（タスク1がタスク2をブロック）
agkan task block add 1 2

# ブロッキング関係を削除
agkan task block remove 1 2

# タスクのブロッキング関係を一覧表示
agkan task block list 1
```

---

### `agkan task meta`

タスクのメタデータコマンド。

```bash
# メタデータを設定
agkan task meta set 1 key value

# メタデータを取得
agkan task meta get 1 key

# 全メタデータを一覧表示
agkan task meta list 1

# メタデータを削除
agkan task meta delete 1 key
```

---

### `agkan task comment`

タスクのコメントコマンド。

```bash
# コメントを追加
agkan task comment add 1 "これはコメントです"

# コメントを一覧表示
agkan task comment list 1
```

---

### `agkan task purge`

指定日以前のdone/closedタスクを削除します。

```bash
agkan task purge [options]
```

---

### `agkan task archive`

指定日以前のdone/closedタスクをアーカイブします。

```bash
agkan task archive [options]
```

---

### `agkan task unarchive`

タスクのアーカイブを解除します。

```bash
agkan task unarchive <id> [options]
```

---

## `agkan tag`

タグ管理コマンド。

```bash
# タグを作成
agkan tag add "frontend"

# 全タグを一覧表示
agkan tag list

# タグを削除
agkan tag delete "frontend"

# タグをリネーム
agkan tag rename "frontend" "fe"

# タスクにタグを付与
agkan tag attach 1 "frontend"

# タスクからタグを外す
agkan tag detach 1 "frontend"

# タスクのタグを表示
agkan tag show 1
```

---

## `agkan board`

ローカルカンバンボードビューアーを起動します。

```bash
agkan board [options]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-p, --port <number>` | ポート番号（デフォルト: 8080） |
| `-t, --title <text>` | ヘッダーに表示するボードタイトル |
| `--verbose` | 詳細ログを有効にする |

**サブコマンド:**

```bash
agkan board start    # デーモンとして起動
agkan board stop     # デーモンを停止
agkan board restart  # デーモンを再起動
agkan board status   # ステータスを表示
```

**使用例:**

```bash
agkan board
# http://localhost:8080 でボードが利用可能

agkan board -p 3000
# http://localhost:3000 でボードが利用可能
```

---

## `agkan ps`

現在実行中のClaudeプロセスを一覧表示します（ボードサーバーの起動が必要）。

```bash
agkan ps [options]
```

**オプション:**

| オプション | 説明 |
|-----------|------|
| `-p, --port <number>` | ボードサーバーのポート |
| `--json` | JSON形式で出力 |

---

## `agkan export`

全タスクをJSON形式でエクスポートします。

```bash
agkan export > backup.json
```

---

## `agkan import`

JSONエクスポートファイルからタスクをインポートします。

```bash
agkan import <file>
```

**使用例:**

```bash
agkan import backup.json
```

---

## ステータス一覧

| ステータス | 説明 |
|-----------|------|
| `icebox` | 保留中、現在は計画なし |
| `backlog` | 計画済みだが未開始 |
| `ready` | 開始準備完了 |
| `in_progress` | 作業中 |
| `review` | レビュー中 |
| `done` | 完了 |
| `closed` | クローズ（キャンセルまたは陳腐化） |

## 優先度一覧

| 優先度 | 説明 |
|--------|------|
| `critical` | 即座の対応が必要。ブロッキングな問題。 |
| `high` | 優先的に対応すべき |
| `medium` | 通常優先度（デフォルト） |
| `low` | 時間があるときに対応 |

---

[← トップに戻る]({{ site.baseurl }}/ja/) | [English version]({{ site.baseurl }}/reference/commands/)
