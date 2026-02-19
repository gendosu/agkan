/**
 * Agent guide command handler
 */

import { Command } from 'commander';

const AGENT_GUIDE_CONTENT = `# agkan

## Overview

\`agkan\` はSQLiteベースのCLIタスク管理ツール。AIエージェントとの協働に最適化されている。

**5つのステータス:** \`backlog\` → \`ready\` → \`in_progress\` → \`done\` → \`closed\`

---

## クイックリファレンス

### タスク操作

\`\`\`bash
# タスク作成
agkan task add "タイトル" "本文"
agkan task add "タイトル" --status ready --author "agent"
agkan task add "サブタスク" --parent 1
agkan task add "タイトル" --file ./spec.md  # ファイルから本文読み込み

# 一覧表示
agkan task list                    # 全タスク
agkan task list --status in_progress
agkan task list --tree             # 階層表示
agkan task list --root-only        # ルートタスクのみ
agkan task list --tag 1,2          # タグでフィルタ

# 詳細表示
agkan task get <id>

# 検索
agkan task find "キーワード"
agkan task find "キーワード" --all  # done/closedも含む

# 更新
agkan task update <id> status in_progress

# カウント
agkan task count
agkan task count --status ready --quiet  # 数値のみ出力

# 親子関係の更新
agkan task update-parent <id> <parent_id>
agkan task update-parent <id> null  # 親を解除
\`\`\`

### ブロッキング関係

\`\`\`bash
# task1がtask2をブロック（task2はtask1完了まで着手不可）
agkan task block add <blocker-id> <blocked-id>
agkan task block remove <blocker-id> <blocked-id>
agkan task block list <id>
\`\`\`

### タグ操作

\`\`\`bash
# タグ管理
agkan task tag add "frontend"
agkan task tag list
agkan task tag delete <tag-id>

# タスクへのタグ付け
agkan task tag attach <task-id> <tag-id>
agkan task tag detach <task-id> <tag-id>
agkan task tag show <task-id>
\`\`\`

### メタデータ操作

\`\`\`bash
# メタデータ設定
agkan task meta set <task-id> <key> <value>

# メタデータ取得
agkan task meta get <task-id> <key>

# メタデータ一覧
agkan task meta list <task-id>

# メタデータ削除
agkan task meta delete <task-id> <key>
\`\`\`

#### 優先度 (priority)

タスクの優先度は \`priority\` キーで管理する:

\`\`\`bash
agkan task meta set <task-id> priority <value>
\`\`\`

| 値 | 意味 |
|-----|------|
| \`critical\` | 即時対応が必要。ブロッカーとなっている問題 |
| \`high\` | 優先して着手すべきタスク |
| \`medium\` | 通常の優先度（デフォルト） |
| \`low\` | 余裕があれば対応するタスク |

---

## JSONOutput

機械処理が必要な場合は \`--json\` フラグを使用:

\`\`\`bash
agkan task list --json
agkan task get 1 --json
agkan task count --json
agkan task tag list --json

# jqと組み合わせ
agkan task list --status ready --json | jq '.tasks[].id'
\`\`\`

### JSON出力スキーマ

#### \`agkan task list --json\`

\`\`\`json
{
  "totalCount": 10,
  "filters": {
    "status": "ready | null",
    "author": "string | null",
    "tagIds": [1, 2],
    "rootOnly": false
  },
  "tasks": [
    {
      "id": 1,
      "title": "タスクタイトル",
      "body": "本文 | null",
      "author": "string | null",
      "status": "backlog | ready | in_progress | review | done | closed",
      "parent_id": "number | null",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z",
      "parent": "object | null",
      "tags": [{ "id": 1, "name": "bug" }],
      "metadata": [{ "key": "priority", "value": "high" }]
    }
  ]
}
\`\`\`

#### \`agkan task get <id> --json\`

\`\`\`json
{
  "success": true,
  "task": {
    "id": 1,
    "title": "タスクタイトル",
    "body": "本文 | null",
    "author": "string | null",
    "status": "backlog | ready | in_progress | review | done | closed",
    "parent_id": "number | null",
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  },
  "parent": "object | null",
  "children": [],
  "blockedBy": [{ "id": 2, "title": "..." }],
  "blocking": [{ "id": 3, "title": "..." }],
  "tags": [{ "id": 1, "name": "bug" }],
  "attachments": []
}
\`\`\`

#### \`agkan task count --json\`

\`\`\`json
{
  "counts": {
    "backlog": 0,
    "ready": 2,
    "in_progress": 1,
    "review": 0,
    "done": 8,
    "closed": 5
  },
  "total": 16
}
\`\`\`

#### \`agkan task find <keyword> --json\`

\`\`\`json
{
  "keyword": "検索ワード",
  "excludeDoneClosed": true,
  "totalCount": 3,
  "tasks": [
    {
      "id": 1,
      "title": "タスクタイトル",
      "body": "本文 | null",
      "author": "string | null",
      "status": "ready",
      "parent_id": "number | null",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z",
      "parent": "object | null",
      "tags": [],
      "metadata": []
    }
  ]
}
\`\`\`

#### \`agkan task block list <id> --json\`

\`\`\`json
{
  "task": {
    "id": 1,
    "title": "タスクタイトル",
    "status": "ready"
  },
  "blockedBy": [{ "id": 2, "title": "...", "status": "in_progress" }],
  "blocking": [{ "id": 3, "title": "...", "status": "ready" }]
}
\`\`\`

#### \`agkan task meta list <id> --json\`

\`\`\`json
{
  "success": true,
  "data": [
    { "key": "priority", "value": "high" }
  ]
}
\`\`\`

#### \`agkan task tag list --json\`

\`\`\`json
{
  "totalCount": 3,
  "tags": [
    {
      "id": 1,
      "name": "bug",
      "created_at": "2026-01-01T00:00:00.000Z",
      "taskCount": 2
    }
  ]
}
\`\`\`

---

## 典型的なワークフロー

### エージェントとしてタスクを受け取る

\`\`\`bash
# 担当タスクを確認
agkan task list --status ready
agkan task get <id>

# 着手
agkan task update <id> status in_progress

# 完了
agkan task update <id> status done
\`\`\`

### タスクの構造化

\`\`\`bash
# 親タスク作成
agkan task add "機能実装" --status ready

# サブタスク追加
agkan task add "設計" --parent 1 --status ready
agkan task add "実装" --parent 1 --status backlog
agkan task add "テスト" --parent 1 --status backlog

# 依存関係設定（設計→実装→テストの順）
agkan task block add 2 3
agkan task block add 3 4

# 全体を確認
agkan task list --tree
\`\`\`

---

## 設定

\`.agkan.yml\` をプロジェクトルートに配置してDBパスをカスタマイズ:

\`\`\`yaml
path: ./.agkan/data.db
\`\`\`

または環境変数: \`AGENT_KANBAN_DB_PATH=/custom/path/data.db\`
`;

export function setupAgentGuideCommand(program: Command): void {
  program
    .command('agent-guide')
    .description('Show agent guide for using agkan')
    .action(() => {
      console.log(AGENT_GUIDE_CONTENT);
    });
}
