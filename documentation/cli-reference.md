# CLI Reference

Full command reference for agkan, including every subcommand, its options, and JSON output formats.

## Table of Contents

- [Usage](#usage)
  - [Initialize a Project](#initialize-a-project)
  - [Create Tasks](#create-tasks)
  - [List Tasks](#list-tasks)
  - [Search Tasks](#search-tasks)
  - [Get Task Details](#get-task-details)
  - [Update Tasks](#update-tasks)
  - [Manage Parent-Child Relationships](#manage-parent-child-relationships)
  - [Manage Blocking Relationships](#manage-blocking-relationships)
  - [Delete Tasks](#delete-tasks)
  - [Manage Tags](#manage-tags)
  - [Attach Tags to Tasks](#attach-tags-to-tasks)
  - [Manage Metadata](#manage-metadata)
  - [Count Tasks](#count-tasks)
  - [Kanban Board (Web UI)](#kanban-board-web-ui)
  - [Claude Process Status](#claude-process-status)
  - [Config](#config)
  - [Display Help](#display-help)
- [JSON Output Format](#json-output-format)
  - [Supported Commands](#supported-commands)
  - [Output Structure](#output-structure)
  - [Common Use Cases](#common-use-cases)
- [Usage Examples](#usage-examples)
  - [Hierarchical Task Management with Parent-Child Relationships](#hierarchical-task-management-with-parent-child-relationships)
  - [Managing Dependencies with Blocking Relationships](#managing-dependencies-with-blocking-relationships)
  - [Task Management with Tags](#task-management-with-tags)

## Usage

### Initialize a Project

Run `agkan init` in your project directory to set up agkan:

```bash
agkan init
```

This creates:
- `.agkan.yml` — configuration file
- `.agkan/` — data directory

`agkan init` also installs a SessionStart hook into `.claude/settings.local.json`
so that Claude Code automatically loads a minimal agkan usage brief at the
start of every session. The hook calls `agkan context --hook`. This step is
idempotent and merges into existing settings without touching unrelated keys.
If you are not using Claude Code, you can safely ignore the generated file.

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

Create with tags (comma-separated names or IDs, attached in the same command):
```bash
agkan task add "Implement login feature" --tag "frontend,urgent"
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
agkan tag add "frontend"
```

List all tags:
```bash
agkan tag list
```

Delete a tag:
```bash
agkan tag delete "frontend"
```

JSON output format for tag list:
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

### Attach Tags to Tasks

Attach a tag to a task:
```bash
agkan tag attach 1 "frontend"
```

Or attach tags at creation time with `task add --tag`, instead of a separate `tag attach` call:
```bash
agkan task add "Implement login screen" --tag "frontend,urgent"
```

Remove a tag from a task:
```bash
agkan tag detach 1 "frontend"
```

Display tags on a task:
```bash
agkan tag show 1
```

JSON output format for tag show:
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

### Kanban Board (Web UI)

Start a local Kanban board viewer in your browser:
```bash
agkan board
```

Specify a custom port:
```bash
agkan board -p 3000
```

The board is served at `http://localhost:8080` by default.

#### Claude Integration in the Board

The board UI includes built-in Claude integration for running tasks directly from the browser:

- **Run button**: Each task card has a "Run" button that launches `claude` for that task. A dropdown arrow next to the button also allows running in plan mode.
- **Plan button**: Runs `claude` in plan mode to generate a plan for the task without executing.
- **Stream modal**: When Claude is running, a modal window displays the live output stream in real time. A "Stop" button allows terminating the process.
- **Running indicator**: A header indicator shows when any Claude process is currently active.
- **Run Logs tab**: The task detail panel includes a "Run Logs" tab that shows the history of all past Claude executions for that task, with timestamps and full output.

### Claude Process Status

List currently executing Claude processes (requires the board server to be running):
```bash
agkan ps
```

Connect to a board server on a custom port:
```bash
agkan ps --port 3000
```

This command queries the board server to show which Claude processes are currently running and which tasks they are associated with.

JSON output format:
```bash
agkan ps --json
```
```json
{
  "processes": [
    {
      "taskId": 42,
      "title": "Implement feature X",
      "command": "claude"
    }
  ]
}
```

### Config

Get resolved configuration values from `.agkan.yml` (defaults applied):

```bash
agkan config get              # Show full resolved config
agkan config get board.port   # Show specific key (dot notation)
agkan config get --json       # JSON output
```

Example output:
```
✓ Resolved config

path: /workspace/.agkan/data.db
board.port: 8080
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

agkan supports machine-readable JSON output for 10 data retrieval and display commands. Add the `--json` flag to output structured data instead of human-readable text.

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
- `ps` - List currently executing Claude processes

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
agkan tag add "frontend"
agkan tag add "backend"
agkan tag add "urgent"

# Create tasks and attach tags
agkan task add "Implement login screen"
# Output: Task created with ID: 1

agkan tag attach 1 "frontend"
agkan tag attach 1 "urgent"

agkan task add "API development"
# Output: Task created with ID: 2

agkan tag attach 2 "backend"

# Or attach tags in the same command with --tag
agkan task add "Bug fix in payment flow" --tag "backend,urgent"
# Output: Task created with ID: 3

# Filter by tag
agkan task list --tag "frontend"
# Output:
# 1 [backlog] Implement login screen (tags: frontend, urgent)

# Display task tags
agkan tag show 1
# Output:
# Tags for task 1:
#   - frontend
#   - urgent

# Remove a tag
agkan tag detach 1 "urgent"

# Delete a tag (removes from all associated tasks)
agkan tag delete "urgent"
```
