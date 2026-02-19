# agkan

[![Test](https://github.com/gendosu/agkan/workflows/Test/badge.svg)](https://github.com/gendosu/agkan/actions/workflows/test.yml)
[![Quality Check](https://github.com/gendosu/agkan/workflows/Quality%20Check/badge.svg)](https://github.com/gendosu/agkan/actions/workflows/quality.yml)

A lightweight CLI task management tool implemented in TypeScript. Optimized for collaborative work with AI agents.

## Features

- **Simple CLI**: Intuitive command-line interface
- **SQLite-based**: Fast local data management
- **Kanban Format**: Manage tasks with 7 statuses (icebox, backlog, ready, in_progress, review, done, closed)
- **Flexible Input**: Create tasks from command-line arguments or Markdown files
- **Filtering**: Narrow down tasks by status or author
- **Color-coded Display**: Easy-to-read color-coded display by status
- **Parent-Child Relationships**: Manage task hierarchy (tree view supported)
- **Blocking Relationships**: Manage task dependencies (includes circular reference detection)
- **Tag System**: Classify and search tasks with tags

## Installation

### Prerequisites

- Node.js 18 or higher
- npm

### Install from npm (Recommended)

Install as a global command:
```bash
npm install -g agkan
```

Now the `agkan` command is available system-wide.

### Install from GitHub

Install directly from the repository:
```bash
npm install -g https://github.com/gendosu/agkan.git
```

## Usage

### Create Tasks

Basic task creation:
```bash
agkan task add "Task title" "Task description"
```

Create with options:
```bash
agkan task add "Implement login feature" "Implement user authentication system" \
  --status ready \
  --author "developer-name"
```

Create with parent task:
```bash
agkan task add "Subtask" "Detailed work item" --parent 1
```

Create from Markdown file:
```bash
agkan task add "Design review" --file ./design-doc.md --status backlog
```

JSON output format:
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

### List Tasks

Display all tasks:
```bash
agkan task list
```

Display in tree format (including parent-child relationships):
```bash
agkan task list --tree
```

Display root tasks only (tasks without parents):
```bash
agkan task list --root-only
```

Filter by status:
```bash
agkan task list --status in_progress
```

Filter by author:
```bash
agkan task list --author "developer-name"
```

Combined filters:
```bash
agkan task list --status ready --author "developer-name"
```

Filter by tag:
```bash
agkan task list --tag "frontend"
```

JSON output format:
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

### Search Tasks

Search by keyword (in title and body):
```bash
agkan task find "search keyword"
```

Include completed tasks in search:
```bash
agkan task find "search keyword" --all
```

Note: By default, `done` and `closed` tasks are excluded from search results.

JSON output format:
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

### Get Task Details

```bash
agkan task get 1
```

JSON output format:
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

### Update Tasks

Change status:
```bash
agkan task update 1 status done
```

Change title:
```bash
agkan task update 1 title "New title"
```

Change body:
```bash
agkan task update 1 body "New description"
```

Change author:
```bash
agkan task update 1 author "new-author"
```

### Manage Parent-Child Relationships

Update parent task:
```bash
# Set parent of task 2 to task 1
agkan task update-parent 2 1

# Remove parent (orphan task 2)
agkan task update-parent 2 null
```

Notes:
- Deleting a parent task automatically removes the parent reference from child tasks (orphaning them)
- Circular references are automatically detected and prevented

JSON output format:
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

### Manage Blocking Relationships

Add blocking relationship (task 1 blocks task 2):
```bash
agkan task block add 1 2
```

Remove blocking relationship:
```bash
agkan task block remove 1 2
```

List blocking relationships:
```bash
# Show blocking relationships for task 1
agkan task block list 1
```

Notes:
- Circular references are automatically detected and prevented
- Blocking relationships are automatically deleted when a task is deleted (CASCADE DELETE)

JSON output format:
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

### Delete Tasks

Delete a task:
```bash
agkan task delete 1
```

### Manage Tags

Create a tag:
```bash
agkan task tag add "frontend"
```

List all tags:
```bash
agkan task tag list
```

Delete a tag:
```bash
agkan task tag delete "frontend"
```

JSON output format for tag list:
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

### Attach Tags to Tasks

Attach a tag to a task:
```bash
agkan task tag attach 1 "frontend"
```

Remove a tag from a task:
```bash
agkan task tag detach 1 "frontend"
```

Display tags on a task:
```bash
agkan task tag show 1
```

JSON output format for tag show:
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

### Manage Metadata

Set metadata:
```bash
agkan task meta set 1 priority high
```

Get metadata:
```bash
agkan task meta get 1 priority
```

List all metadata:
```bash
agkan task meta list 1
```

Delete metadata:
```bash
agkan task meta delete 1 priority
```

#### Priority (priority)

Task priority is managed with the `priority` key:

| Value | Meaning |
|-------|---------|
| `critical` | Requires immediate action. A blocking issue. |
| `high` | Should be addressed with priority |
| `medium` | Normal priority (default) |
| `low` | Address when time permits |

### Count Tasks

Display task count for all statuses:
```bash
agkan task count
```

Display task count for a specific status:
```bash
agkan task count --status in_progress
```

Script-friendly output (numbers only):
```bash
agkan task count -s in_progress -q
```

JSON output format for all statuses:
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

JSON output format for specific status:
```bash
agkan task count --status in_progress --json
```

```json
{
  "status": "in_progress",
  "count": 4
}
```

### Display Help

Show command list:
```bash
agkan --help
```

Show task command help:
```bash
agkan task --help
```

Show help for specific command:
```bash
agkan task add --help
```

## JSON Output Format

agkan supports machine-readable JSON output for 9 data retrieval and display commands. Add the `--json` flag to output structured data instead of human-readable text.

### Supported Commands

The following commands support JSON output:

- `task add` - Create a new task
- `task list` - List tasks (with filtering)
- `task get` - Get task details
- `task find` - Search tasks by keyword
- `task count` - Count tasks by status
- `task update-parent` - Update parent-child relationship
- `task block list` - List blocking relationships
- `task tag list` - List all tags with task counts
- `task tag show` - Show tags for a specific task
- `task meta list` - List all metadata for a task

### Output Structure

All JSON responses follow these patterns:

**Success responses** include:
- Operation-specific data (task, tasks array, counts, etc.)
- Related data (parent, blockedBy, blocking, tags, etc.)
- Optional `success: true` field for write operations

**Error responses** follow the format:
```json
{
  "success": false,
  "error": {
    "message": "Error description"
  }
}
```

### Common Use Cases

**1. Scripting and Automation**
```bash
# Get task count for CI/CD pipeline
TASK_COUNT=$(agkan task count --status backlog --json | jq '.counts.backlog')

# Extract task IDs for processing
agkan task list --status ready --json | jq -r '.tasks[].id'
```

**2. Integration with Other Tools**
```bash
# Export tasks to external system
agkan task list --json | jq '.tasks' > tasks.json

# Process blocking relationships
agkan task block list 1 --json | jq '.blockedBy[].title'
```

**3. Validation and Testing**
```bash
# Verify task creation
RESULT=$(agkan task add "Test" --json)
echo $RESULT | jq -e '.success == true' && echo "Success"
```

## Usage Examples

### Hierarchical Task Management with Parent-Child Relationships

Example of managing a project as a parent task with individual work items as children:

```bash
# Create parent task
agkan task add "Website redesign"
# Output: Task created with ID: 1

# Create child tasks
agkan task add "Create design mockup" --parent 1
agkan task add "Implement frontend" --parent 1
agkan task add "Implement backend" --parent 1

# Display in tree format
agkan task list --tree
# Output:
# 1 [backlog] Website redesign
#   ├─ 2 [backlog] Create design mockup
#   ├─ 3 [backlog] Implement frontend
#   └─ 4 [backlog] Implement backend

# Display task details (including parent information)
agkan task get 2
# Output:
# ID: 2
# Title: Create design mockup
# Parent ID: 1
# ...

# Change parent
agkan task add "UI/UX improvements"
# Output: Task created with ID: 5
agkan task update-parent 2 5

# Remove parent (orphan task)
agkan task update-parent 2 null
```

### Managing Dependencies with Blocking Relationships

Example of explicitly managing task dependencies:

```bash
# Create tasks
agkan task add "Database design"
# Output: Task created with ID: 1

agkan task add "API implementation"
# Output: Task created with ID: 2

agkan task add "Frontend implementation"
# Output: Task created with ID: 3

# Set blocking relationships (1 blocks 2, 2 blocks 3)
# Database design blocks API implementation
agkan task block add 1 2

# API implementation blocks Frontend implementation
agkan task block add 2 3

# Verify blocking relationships
agkan task block list 1
# Output:
# Task 1 blocks:
#   - Task 2 (API implementation)
# Task 1 is blocked by:
#   (none)

agkan task block list 2
# Output:
# Task 2 blocks:
#   - Task 3 (Frontend implementation)
# Task 2 is blocked by:
#   - Task 1 (Database design)

# Attempt circular reference (error)
agkan task block add 3 1
# Output: Error: Circular reference detected

# Remove blocking relationship
agkan task block remove 1 2
```

### Task Management with Tags

Example of classifying tasks with tags:

```bash
# Create tags
agkan task tag add "frontend"
agkan task tag add "backend"
agkan task tag add "urgent"

# Create tasks and attach tags
agkan task add "Implement login screen"
# Output: Task created with ID: 1

agkan task tag attach 1 "frontend"
agkan task tag attach 1 "urgent"

agkan task add "API development"
# Output: Task created with ID: 2

agkan task tag attach 2 "backend"

# Filter by tag
agkan task list --tag "frontend"
# Output:
# 1 [backlog] Implement login screen (tags: frontend, urgent)

# Display task tags
agkan task tag show 1
# Output:
# Tags for task 1:
#   - frontend
#   - urgent

# Remove a tag
agkan task tag detach 1 "urgent"

# Delete a tag (removes from all associated tasks)
agkan task tag delete "urgent"
```

## Task Statuses

- **icebox**: Frozen tasks not actively being considered (white display)
- **backlog**: Not yet started tasks (gray display)
- **ready**: Tasks ready to be started (blue display)
- **in_progress**: Tasks currently being worked on (yellow display)
- **review**: Tasks under review (cyan display)
- **done**: Completed tasks (green display)
- **closed**: Closed tasks (magenta display)

## Configuration

### Database Storage Location

agkan allows customization of the database storage location via a configuration file.

#### Configuration File: `.agkan.yml`

Create a `.agkan.yml` file in your project root directory to specify the database storage location.

**Configuration Example:**

```yaml
# Path to database file
path: ./.agkan/data.db
```

#### Path Specification

- **Relative Path**: Resolved relative to the current directory
  ```yaml
  path: ./data/kanban.db
  path: ./.agkan/data.db
  ```

- **Absolute Path**: Used as-is
  ```yaml
  path: /home/user/.config/akan/data.db
  ```

#### Environment Variable Configuration

agkan supports the `AGENT_KANBAN_DB_PATH` environment variable for specifying the database location. This is particularly useful in CI/CD environments and for managing multiple environments.

**Setting the Environment Variable:**

```bash
# Use a custom database path
export AGENT_KANBAN_DB_PATH=/path/to/your/database.db
agkan task list

# Use absolute path
export AGENT_KANBAN_DB_PATH=/home/user/.config/akan/data.db

# Use relative path
export AGENT_KANBAN_DB_PATH=./custom/location/data.db
```

**Priority Order:**

The database path is resolved in the following priority order:

**Normal Mode (when `NODE_ENV` is not `test`):**
1. **Environment Variable** (highest priority): `AGENT_KANBAN_DB_PATH`
2. **Configuration File** (fallback): `path` field in `.agkan.yml`
3. **Default Path** (lowest priority): `.agkan/data.db`

**Test Mode (when `NODE_ENV=test`):**
1. **Environment Variable** (highest priority): `AGENT_KANBAN_DB_PATH`
2. **Configuration File** (fallback): `path` field in `.agkan-test.yml`
3. **Default Path** (lowest priority): `.agkan-test/data.db`

**Test Mode Explanation:**

Test mode (`NODE_ENV=test`) automatically isolates test data from production data:

- Uses separate configuration file: `.agkan-test.yml` instead of `.agkan.yml`
- Uses separate default directory: `.agkan-test/` instead of `.agkan/`
- Environment variable still takes highest priority in test mode
- Prevents accidental mixing of test and production data

**Use Cases:**

1. **CI/CD Pipeline:**
   ```bash
   # Use temporary database for CI tests
   export AGENT_KANBAN_DB_PATH=/tmp/ci-test-db.db
   agkan task list
   ```

2. **Multiple Environments:**
   ```bash
   # Development environment
   export AGENT_KANBAN_DB_PATH=./dev/data.db

   # Staging environment
   export AGENT_KANBAN_DB_PATH=./staging/data.db

   # Production environment
   export AGENT_KANBAN_DB_PATH=./prod/data.db
   ```

3. **Testing:**
   ```bash
   # Automated tests with isolated database
   NODE_ENV=test npm test
   # Uses .agkan-test/data.db by default

   # Override with custom test database
   NODE_ENV=test AGENT_KANBAN_DB_PATH=/tmp/test.db npm test
   ```

#### Default Behavior

If no `.agkan.yml` file exists and no environment variable is set, the database is created in:

```
<current-directory>/.agkan/data.db
```

In test mode (`NODE_ENV=test`), the default location is:

```
<current-directory>/.agkan-test/data.db
```

#### Per-Project Management

To manage separate tasks for different projects, place `.agkan.yml` in each project root:

```bash
# Project A
cd /path/to/projectA
cat > .agkan.yml << EOF
path: ./.agkan/data.db
EOF

# Project B
cd /path/to/projectB
cat > .agkan.yml << EOF
path: ./.agkan/data.db
EOF
```

This enables independent task management for each project.

## Planned Features

### Task Attachments

Task attachment management is currently under development. This feature will allow users to attach files to tasks for better context and documentation.

**Planned CLI Commands:**
- `agkan task attach add <task-id> <file-path>` - Attach a file to a task
- `agkan task attach list <task-id>` - List all attachments for a task
- `agkan task attach delete <attachment-id>` - Remove an attachment from a task

For detailed information about planned features, see [docs/planned-features.md](docs/planned-features.md).

## Technology Stack

- **Language**: TypeScript 5.x
- **CLI Framework**: Commander.js
- **Database**: SQLite3 (better-sqlite3)
- **Terminal Display**: Chalk
- **Build Tool**: TypeScript Compiler

## Project Structure

```
agkan/
├── bin/
│   └── agkan                        # CLI entry point
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── block/               # Blocking relationship commands
│   │   │   │   ├── add.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── remove.ts
│   │   │   ├── meta/                # Metadata commands
│   │   │   │   ├── delete.ts
│   │   │   │   ├── get.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── set.ts
│   │   │   ├── tag/                 # Tag commands
│   │   │   │   ├── add.ts
│   │   │   │   ├── attach.ts
│   │   │   │   ├── delete.ts
│   │   │   │   ├── detach.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── show.ts
│   │   │   └── task/                # Task commands
│   │   │       ├── add.ts
│   │   │       ├── count.ts
│   │   │       ├── delete.ts
│   │   │       ├── find.ts
│   │   │       ├── get.ts
│   │   │       ├── list.ts
│   │   │       ├── update-parent.ts
│   │   │       └── update.ts
│   │   ├── utils/                   # CLI utilities
│   │   └── index.ts                 # CLI entry point and command registration
│   ├── db/
│   │   ├── config.ts                # DB configuration
│   │   ├── connection.ts            # Database connection management
│   │   ├── schema.ts                # Schema definition and migration
│   │   └── reset.ts                 # DB reset for testing
│   ├── models/
│   │   ├── Task.ts                  # Task model
│   │   ├── Tag.ts                   # Tag model
│   │   ├── TaskBlock.ts             # Blocking relationship model
│   │   ├── TaskMetadata.ts          # Metadata model
│   │   ├── TaskTag.ts               # Task-tag association model
│   │   └── index.ts
│   ├── services/
│   │   ├── TaskService.ts           # Task management business logic
│   │   ├── TagService.ts            # Tag management business logic
│   │   ├── TaskBlockService.ts      # Blocking relationship management
│   │   ├── TaskTagService.ts        # Task-tag association management
│   │   ├── MetadataService.ts       # Metadata management
│   │   ├── FileService.ts           # File reading
│   │   └── index.ts
│   └── utils/
│       ├── format.ts                # Format utilities
│       ├── cycle-detector.ts        # Circular reference detection
│       ├── input-validators.ts      # Input validation
│       └── security.ts              # Security utilities
├── dist/                            # Build output directory
├── package.json
├── tsconfig.json
└── README.md
```

## Database Schema

### tasks Table

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

### attachments Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| task_id | INTEGER | Task ID (foreign key) |
| file_path | TEXT | File path (required) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

### task_blocks Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| blocker_task_id | INTEGER | Task ID that blocks (foreign key) |
| blocked_task_id | INTEGER | Task ID that is blocked (foreign key) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

Notes:
- `blocker_task_id` and `blocked_task_id` combination has a unique constraint
- Blocking relationships are automatically deleted when either task is deleted (ON DELETE CASCADE)

### tags Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| name | TEXT | Tag name (required, unique) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

### task_tags Table

| Column Name | Type | Description |
|-------------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| task_id | INTEGER | Task ID (foreign key) |
| tag_id | INTEGER | Tag ID (foreign key) |
| created_at | TEXT | Creation timestamp (ISO 8601 format) |

Notes:
- `task_id` and `tag_id` combination has a unique constraint
- Associations are automatically deleted when task or tag is deleted (ON DELETE CASCADE)

### task_metadata Table

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

## Development

### Developer Setup

For contributors and developers who want to work on agkan itself:

1. Clone the repository:
```bash
git clone https://github.com/gendosu/agkan.git
cd agkan
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript code:
```bash
npm run build
```

4. Register as a global command:
```bash
npm link
```

### Development Guidelines

For comprehensive development information, see the following documentation:

- **[TESTING.md](TESTING.md)** - Testing guide, coverage execution, and test patterns
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines and TDD practices
- **[docs/TDD-GUIDE.md](docs/TDD-GUIDE.md)** - Test-Driven Development guide with practical examples
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Project architecture and design patterns

### Code Quality

This project uses ESLint and Prettier for code quality:

```bash
npm run lint        # Check code
npm run lint:fix    # Auto-fix issues
npm run format      # Format code
npm run check       # Run all checks
```

### Testing

#### Unit Tests

Run unit tests with Vitest:
```bash
npm test
```

All service and model layers are tested.

#### End-to-End Tests

Run comprehensive e2e tests that execute actual CLI commands:
```bash
npm run test:e2e
```

E2E tests cover the following features:
- Build and unit tests
- Tag management (create, list, delete, duplicate check)
- Tag assignment (attach, detach, display, duplicate check)
- Tag filtering (single tag, multiple tags, status combinations)
- CASCADE delete (database integrity verification)

Tests use a local test database (`.agkan-test/test-e2e.db`) and are automatically cleaned up after execution.

### Build

```bash
npm run build
```

### Auto-build During Development

```bash
npm run dev
```

### TypeScript Type Checking

```bash
npx tsc --noEmit
```

### Initialize Database

The database is automatically created on first command execution. To manually recreate:

```bash
rm -rf data/agkan.db
agkan task list  # Database will be recreated
```

## License

ISC

## Author

Generated with Claude Code
