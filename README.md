# agkan

[![Test](https://github.com/gendosu/agkan/workflows/Test/badge.svg?branch=main)](https://github.com/gendosu/agkan/actions/workflows/test.yml)
[![Quality Check](https://github.com/gendosu/agkan/workflows/Quality%20Check/badge.svg?branch=main)](https://github.com/gendosu/agkan/actions/workflows/quality.yml)

A lightweight CLI task management tool, built for humans and AI coding agents working together.

![agkan Kanban board](docs/assets/readme-board.png)

## Features

**Task Management**
- Simple, intuitive CLI backed by local SQLite storage
- 7-status Kanban workflow: icebox, backlog, ready, in_progress, review, done, closed
- Create tasks from CLI arguments or Markdown files; filter by status, author, or tag
- Color-coded terminal output
- Metadata support (e.g. `priority`) for structured, per-task key/value fields

**Dependencies**
- Parent-child relationships with tree view (`task list --tree`)
- Blocking relationships with automatic circular-reference detection
- Tag system for classifying and searching tasks

**Kanban Board**
- Local, zero-config web UI (`agkan board`)
- Filter and browse tasks by status, tag, or author in the browser
- Task detail panel with full task history and Claude run logs

**AI Integration**
- Machine-readable JSON output on key commands for scripting and automation
- Companion [agkan-skills](https://github.com/gendosu/agkan-skills) package for Claude Code
- Run Claude directly from the board, with live streaming output and run history
- `agkan init` installs a SessionStart hook so Claude Code loads agkan context automatically each session

## Quick Start

Go from zero to a running Kanban board in five steps.

### 1. Install

```bash
npm install -g agkan
```

Requires Node.js 20+ and npm. To install the latest code directly from GitHub instead:
```bash
npm install -g https://github.com/gendosu/agkan.git
```

### 2. Initialize your project

```bash
agkan init
```
```
Created: .agkan.yml
Created: .agkan/ directory
Created: .claude/settings.local.json (added agkan SessionStart hook)
```

### 3. Create a task

```bash
agkan task add "Implement login feature" "Implement user authentication system"
```
```
✓ Task created successfully

ID: 1
Title: Implement login feature
Status: backlog
Created: 2026/7/10 15:02:48
```

### 4. List tasks

```bash
agkan task list
```
```
Found 1 task(s):

────────────────────────────────────────────────────────────────────────────────

[1] Implement login feature
  Status: backlog
  Priority: medium
  Created: 2026/7/10 15:02:48
```

### 5. Open the Kanban board

```bash
agkan board
```
```
Server is running on http://localhost:8080
```

Need a different port? `agkan board -p 3000`.

## Command Cheat Sheet

Every command also accepts `--help` for its own usage details.

| Command | Description |
|---|---|
| `agkan init` | Initialize `.agkan.yml` and the `.agkan/` data directory |
| `agkan task add <title> [body]` | Create a task (`--status`, `--author`, `--parent`, `--tag`, `--file`, `--json`) |
| `agkan task list` | List tasks (`--tree`, `--root-only`, `--status`, `--author`, `--tag`, `--json`) |
| `agkan task find <keyword>` | Search tasks by title/body (`--all` includes done/closed) |
| `agkan task get <id>` | Show task details |
| `agkan task update <id> <field> <value>` | Update a task's status, title, body, or author |
| `agkan task update-parent <id> <parent-id>` | Set or clear (`null`) a task's parent |
| `agkan task delete <id>` | Delete a task |
| `agkan task block add <id> <id2>` | Mark `<id>` as blocking `<id2>` |
| `agkan task block remove <id> <id2>` | Remove a blocking relationship |
| `agkan task block list <id>` | Show what a task blocks and is blocked by |
| `agkan task meta set <id> <key> <value>` | Set a metadata value on a task (e.g. `priority`) |
| `agkan task meta get <id> <key>` | Get a metadata value from a task |
| `agkan task meta list <id>` | List all metadata for a task |
| `agkan task meta delete <id> <key>` | Delete a metadata value from a task |
| `agkan task count` | Count tasks by status (`--status`, `--json`) |
| `agkan tag add <name>` | Create a tag |
| `agkan tag list` | List all tags with task counts |
| `agkan tag delete <name>` | Delete a tag |
| `agkan tag attach <task-id> <tag>` | Attach a tag to a task |
| `agkan tag detach <task-id> <tag>` | Detach a tag from a task |
| `agkan tag show <task-id>` | List tags attached to a task |
| `agkan board` | Start the local Kanban board web UI |
| `agkan ps` | List currently running Claude processes |
| `agkan config get [key]` | Show resolved configuration values |
| `agkan --help` | Show all commands |

For full options, JSON output formats, and worked examples, see **[documentation/cli-reference.md](documentation/cli-reference.md)**.

## Claude Code Integration

agkan is designed to be driven by AI coding agents as well as humans:

- **[agkan-skills](https://github.com/gendosu/agkan-skills)** — Claude Code skills for automated task execution, planning, and review
- **Run / Plan**: each task card in the board has a "Run" button that launches `claude` for that task, with a dropdown to run in plan mode instead
- **Stream modal**: while Claude is running, a modal shows the live output stream in real time, with a "Stop" button and a header indicator for active processes
- **Run Logs**: the task detail panel's "Run Logs" tab keeps the full history of past Claude executions, with timestamps and output
- **`agkan ps`**: from any terminal, list which Claude processes the board currently has running and which tasks they belong to

## Configuration

Customize the database location and board via a `.agkan.yml` file in your project root:

```yaml
path: ./.agkan/data.db

board:
  port: 8080
```

The database path can also be overridden with the `AGENT_KANBAN_DB_PATH` environment variable, which takes priority over `.agkan.yml`.

In test mode (`NODE_ENV=test`), agkan automatically isolates data using `.agkan-test.yml` and `.agkan-test/` instead, so tests never touch your real task database.

See **[documentation/configuration.md](documentation/configuration.md)** for the full reference, including per-project setup, model selection, and permission modes.

## Task Statuses

Every task moves through one of seven statuses:

| Status | Meaning |
|---|---|
| `icebox` | Frozen, not actively being considered |
| `backlog` | Not yet started |
| `ready` | Ready to be started |
| `in_progress` | Currently being worked on |
| `review` | Under review |
| `done` | Completed |
| `closed` | Closed |

## Documentation

Detailed reference material lives outside this file:

| Document | Description |
|---|---|
| [documentation/cli-reference.md](documentation/cli-reference.md) | Full command reference, options, and JSON output formats |
| [documentation/configuration.md](documentation/configuration.md) | `.agkan.yml` reference (paths, board, models, permission mode) |
| [documentation/project-structure.md](documentation/project-structure.md) | Repository directory layout |
| [documentation/database-schema.md](documentation/database-schema.md) | SQLite schema reference |
| [documentation/development.md](documentation/development.md) | Technology stack, local setup, and build information |
| [documentation/TESTING.md](documentation/TESTING.md) | Testing guide |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## License

ISC

## Author

GENDOSU
