---
layout: single
title: "Command Reference"
lang: en
permalink: /reference/commands/
sidebar:
  nav: "reference"
toc: true
toc_label: "Commands"
toc_icon: "terminal"
---

<link rel="stylesheet" href="{{ '/assets/css/custom.css' | prepend: site.baseurl }}">

{% include lang-toggle.html %}

This page provides a complete reference for all agkan CLI commands.

## Global Options

| Option | Description |
|--------|-------------|
| `-V, --version` | Output the version number |
| `-h, --help` | Display help for command |

## `agkan init`

Initialize agkan configuration and data directory in the current project.

```bash
agkan init
```

Creates a `.agkan/` directory with the SQLite database file.

---

## `agkan task`

Task management commands.

### `agkan task add`

Add a new task.

```bash
agkan task add [options] [title] [body]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-a, --author <author>` | Task author |
| `--assignees <assignees>` | Task assignees (comma-separated) |
| `-s, --status <status>` | Task status (default: `backlog`) |
| `--priority <priority>` | Task priority (default: `medium`) |
| `-p, --parent <id>` | Parent task ID |
| `--file <path>` | Read body from markdown file |
| `--blocked-by <ids>` | Comma-separated task IDs that block this task |
| `--blocks <ids>` | Comma-separated task IDs that this task blocks |
| `--json` | Output in JSON format |

**Valid status values:** `icebox`, `backlog`, `ready`, `in_progress`, `review`, `done`, `closed`

**Valid priority values:** `critical`, `high`, `medium`, `low`

**Examples:**

```bash
# Basic task creation
agkan task add "Implement login feature" "User authentication system"

# With status and author
agkan task add "Fix bug" "Detailed description" --status ready --author "dev"

# From Markdown file
agkan task add "Design review" --file ./design-doc.md --status backlog

# Create subtask
agkan task add "Write tests" "Unit tests for login" --parent 1

# JSON output
agkan task add "New task" --json
```

---

### `agkan task list`

List all tasks.

```bash
agkan task list [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --status <status>` | Filter by status |
| `-a, --author <author>` | Filter by author |
| `--assignees <assignees>` | Filter by assignee |
| `-t, --tag <tags>` | Filter by tag IDs or names (comma-separated) |
| `-p, --priority <priorities>` | Filter by priority (comma-separated) |
| `--all` | Include all statuses (including done and closed) |
| `--archived` | Include archived tasks |
| `--tree` | Display tasks in tree structure |
| `--dep-tree` | Display tasks in dependency (blocking) tree structure |
| `--root-only` | Show only root tasks (tasks without parent) |
| `--sort <field>` | Sort by field (id, title, status, created_at, updated_at, priority) |
| `--order <order>` | Sort order (asc, desc) |
| `--json` | Output in JSON format |

**Examples:**

```bash
# List all active tasks
agkan task list

# Filter by status
agkan task list --status in_progress

# Tree view
agkan task list --tree

# Filter by tag
agkan task list --tag "backend"

# Filter by priority
agkan task list --priority critical,high

# Root tasks only
agkan task list --root-only

# Include done/closed tasks
agkan task list --all

# JSON output
agkan task list --json
```

---

### `agkan task get`

Get a task by ID.

```bash
agkan task get <id> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |

**Examples:**

```bash
agkan task get 1
agkan task get 1 --json
```

---

### `agkan task update`

Update a task field.

```bash
agkan task update <id> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--title <title>` | Update title |
| `--status <status>` | Update status |
| `--body <body>` | Update body |
| `--author <author>` | Update author |
| `--assignees <assignees>` | Update assignees |
| `--priority <priority>` | Update priority |
| `--file <path>` | Read body from file |
| `--json` | Output in JSON format |

**Examples:**

```bash
agkan task update 1 --status review
agkan task update 1 --title "Updated title"
agkan task update 1 --body "New description"
agkan task update 1 --priority high
```

---

### `agkan task find`

Search tasks by keyword (in title and body).

```bash
agkan task find <keyword> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--all` | Include done/closed tasks in search |
| `--json` | Output in JSON format |

**Examples:**

```bash
agkan task find "login"
agkan task find "bug" --all
agkan task find "feature" --json
```

---

### `agkan task delete`

Delete a task.

```bash
agkan task delete <id> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |

**Example:**

```bash
agkan task delete 1
```

---

### `agkan task count`

Show task count by status.

```bash
agkan task count [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --status <status>` | Filter by specific status |
| `-q, --quiet` | Output numbers only (script-friendly) |
| `--json` | Output in JSON format |

**Examples:**

```bash
agkan task count
agkan task count --status in_progress
agkan task count -s in_progress -q
agkan task count --json
```

---

### `agkan task update-parent`

Update task parent.

```bash
agkan task update-parent <id> <parent_id>
```

Use `null` to remove parent (orphan the task):

```bash
agkan task update-parent 2 1      # Set parent of task 2 to task 1
agkan task update-parent 2 null   # Remove parent from task 2
```

---

### `agkan task copy`

Copy a task by ID.

```bash
agkan task copy <id> [options]
```

---

### `agkan task block`

Task blocking relationship commands.

```bash
# Add blocking relationship (task 1 blocks task 2)
agkan task block add 1 2

# Remove blocking relationship
agkan task block remove 1 2

# List blocking relationships for a task
agkan task block list 1
```

---

### `agkan task meta`

Task metadata commands.

```bash
# Set metadata
agkan task meta set 1 key value

# Get metadata
agkan task meta get 1 key

# List all metadata
agkan task meta list 1

# Delete metadata
agkan task meta delete 1 key
```

---

### `agkan task comment`

Task comment commands.

```bash
# Add a comment
agkan task comment add 1 "This is a comment"

# List comments
agkan task comment list 1
```

---

### `agkan task purge`

Delete done/closed tasks older than a given date.

```bash
agkan task purge [options]
```

---

### `agkan task archive`

Archive done/closed tasks older than a given date.

```bash
agkan task archive [options]
```

---

### `agkan task unarchive`

Unarchive a task.

```bash
agkan task unarchive <id> [options]
```

---

## `agkan tag`

Tag management commands.

```bash
# Create a tag
agkan tag add "frontend"

# List all tags
agkan tag list

# Delete a tag
agkan tag delete "frontend"

# Rename a tag
agkan tag rename "frontend" "fe"

# Attach a tag to a task
agkan tag attach 1 "frontend"

# Remove a tag from a task
agkan tag detach 1 "frontend"

# Show tags on a task
agkan tag show 1
```

---

## `agkan board`

Start a local Kanban board viewer.

```bash
agkan board [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --port <number>` | Port to listen on (default: 8080) |
| `-t, --title <text>` | Board title to display in header |
| `--verbose` | Enable verbose logging |

**Subcommands:**

```bash
agkan board start    # Start as daemon
agkan board stop     # Stop daemon
agkan board restart  # Restart daemon
agkan board status   # Show status
```

**Example:**

```bash
agkan board
# Board available at http://localhost:8080

agkan board -p 3000
# Board available at http://localhost:3000
```

---

## `agkan ps`

List currently executing Claude processes (requires board server running).

```bash
agkan ps [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --port <number>` | Board server port |
| `--json` | Output in JSON format |

---

## `agkan export`

Export all tasks to JSON format.

```bash
agkan export > backup.json
```

---

## `agkan import`

Import tasks from a JSON export file.

```bash
agkan import <file>
```

**Example:**

```bash
agkan import backup.json
```

---

## Status Reference

| Status | Description |
|--------|-------------|
| `icebox` | On hold, not currently planned |
| `backlog` | Planned but not started |
| `ready` | Ready to start |
| `in_progress` | Currently being worked on |
| `review` | Under review |
| `done` | Completed |
| `closed` | Closed (cancelled or obsolete) |

## Priority Reference

| Priority | Description |
|----------|-------------|
| `critical` | Requires immediate action. A blocking issue. |
| `high` | Should be addressed with priority |
| `medium` | Normal priority (default) |
| `low` | Address when time permits |

---

[← Back to Home]({{ site.baseurl }}/) | [日本語版]({{ site.baseurl }}/ja/reference/commands/)
