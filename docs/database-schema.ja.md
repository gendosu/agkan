# データベーススキーマ

## tasks テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| title | TEXT | タスクタイトル（必須） |
| body | TEXT | タスク本文 |
| status | TEXT | ステータス（icebox, backlog, ready, in_progress, review, done, closed） |
| author | TEXT | 作成者 |
| parent_id | INTEGER | 親タスクID（外部キー、NULL可） |
| created_at | TEXT | 作成日時（ISO 8601形式） |
| updated_at | TEXT | 更新日時（ISO 8601形式） |

注意事項:
- `parent_id`は親タスクが削除されると自動的にNULLに設定されます（ON DELETE SET NULL）

## attachments テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| task_id | INTEGER | タスクID（外部キー） |
| file_path | TEXT | ファイルパス（必須） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

## task_blocks テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| blocker_task_id | INTEGER | ブロックするタスクID（外部キー） |
| blocked_task_id | INTEGER | ブロックされるタスクID（外部キー） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

注意事項:
- `blocker_task_id`と`blocked_task_id`の組み合わせはユニーク制約があります
- いずれかのタスクが削除されるとブロック関係も自動的に削除されます（ON DELETE CASCADE）

## tags テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| name | TEXT | タグ名（必須、ユニーク） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

## task_tags テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 主キー（自動採番） |
| task_id | INTEGER | タスクID（外部キー） |
| tag_id | INTEGER | タグID（外部キー） |
| created_at | TEXT | 作成日時（ISO 8601形式） |

注意事項:
- `task_id`と`tag_id`の組み合わせはユニーク制約があります
- タスクまたはタグが削除されると関連付けも自動的に削除されます（ON DELETE CASCADE）

## task_metadata テーブル

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
