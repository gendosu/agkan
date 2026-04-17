# Database Schema

## tasks Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| title | TEXT | Task title (required) |
| body | TEXT | Task body |
| status | TEXT | Status (icebox, backlog, ready, in_progress, review, done, closed) |
| author | TEXT | Creator/author |
| parent_id | INTEGER | Parent task ID (foreign key, nullable) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |
| updated_at | TEXT | Update timestamp (ISO 8601 format) |

Notes:
- `parent_id` is automatically set to NULL when parent task is deleted (ON DELETE SET NULL)

## attachments Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| task_id | INTEGER | Task ID (foreign key) |
| file_path | TEXT | File path (required) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

## task_blocks Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| blocker_task_id | INTEGER | Task ID that blocks (foreign key) |
| blocked_task_id | INTEGER | Task ID that is blocked (foreign key) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

Notes:
- `blocker_task_id` and `blocked_task_id` combination has a unique constraint
- Blocking relationships are automatically deleted when either task is deleted (ON DELETE CASCADE)

## tags Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| name | TEXT | Tag name (required, unique) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

## task_tags Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| task_id | INTEGER | Task ID (foreign key) |
| tag_id | INTEGER | Tag ID (foreign key) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

Notes:
- `task_id` and `tag_id` combination has a unique constraint
- Associations are automatically deleted when task or tag is deleted (ON DELETE CASCADE)

## task_metadata Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| task_id | INTEGER | Task ID (foreign key) |
| key | TEXT | Metadata key |
| value | TEXT | Metadata value |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

Notes:
- `task_id` and `key` combination has a unique constraint
- Metadata is automatically deleted when the task is deleted (ON DELETE CASCADE)
