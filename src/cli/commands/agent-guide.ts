/**
 * Agent guide command handler
 */

import { Command } from 'commander';

const AGENT_GUIDE_CONTENT = `# agkan

## Overview

\`agkan\` is a SQLite-based CLI task management tool, optimized for collaboration with AI agents.

**5 statuses:** \`backlog\` → \`ready\` → \`in_progress\` → \`done\` → \`closed\`

---

## Quick Reference

### Task Operations

\`\`\`bash
# Create task
agkan task add "Title" "Body"
agkan task add "Title" --status ready --author "agent"
agkan task add "Subtask" --parent 1
agkan task add "Title" --file ./spec.md  # Read body from file

# List
agkan task list                    # All tasks
agkan task list --status in_progress
agkan task list --tree             # Tree view
agkan task list --root-only        # Root tasks only
agkan task list --tag 1,2          # Filter by tag

# Show detail
agkan task get <id>

# Search
agkan task find "keyword"
agkan task find "keyword" --all  # Include done/closed

# Update
agkan task update <id> status in_progress

# Count
agkan task count
agkan task count --status ready --quiet  # Output number only

# Update parent-child relationship
agkan task update-parent <id> <parent_id>
agkan task update-parent <id> null  # Remove parent
\`\`\`

### Blocking Relationships

\`\`\`bash
# task1 blocks task2 (task2 cannot start until task1 is complete)
agkan task block add <blocker-id> <blocked-id>
agkan task block remove <blocker-id> <blocked-id>
agkan task block list <id>
\`\`\`

### Tag Operations

\`\`\`bash
# Tag management
agkan task tag add "frontend"
agkan task tag list
agkan task tag delete <tag-id>

# Attach tags to tasks
agkan task tag attach <task-id> <tag-id>
agkan task tag detach <task-id> <tag-id>
agkan task tag show <task-id>
\`\`\`

### Metadata Operations

\`\`\`bash
# Set metadata
agkan task meta set <task-id> <key> <value>

# Get metadata
agkan task meta get <task-id> <key>

# List metadata
agkan task meta list <task-id>

# Delete metadata
agkan task meta delete <task-id> <key>
\`\`\`

#### Priority

Task priority is managed with the \`priority\` key:

\`\`\`bash
agkan task meta set <task-id> priority <value>
\`\`\`

| Value | Description |
|-------|-------------|
| \`critical\` | Requires immediate attention. Blocking issues. |
| \`high\` | Tasks to prioritize. |
| \`medium\` | Normal priority (default). |
| \`low\` | Tasks to handle when time permits. |

---

## JSON Output

Use the \`--json\` flag when machine processing is needed:

\`\`\`bash
agkan task list --json
agkan task get 1 --json
agkan task count --json
agkan task tag list --json

# Combine with jq
agkan task list --status ready --json | jq '.tasks[].id'
\`\`\`

### JSON Output Schema

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
      "title": "Task title",
      "body": "body | null",
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
    "title": "Task title",
    "body": "body | null",
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
  "keyword": "search term",
  "excludeDoneClosed": true,
  "totalCount": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Task title",
      "body": "body | null",
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
    "title": "Task title",
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

## Typical Workflows

### Receiving tasks as an agent

\`\`\`bash
# Check assigned tasks
agkan task list --status ready
agkan task get <id>

# Start
agkan task update <id> status in_progress

# Complete
agkan task update <id> status done
\`\`\`

### Structuring tasks

\`\`\`bash
# Create parent task
agkan task add "Feature implementation" --status ready

# Add subtasks
agkan task add "Design" --parent 1 --status ready
agkan task add "Implementation" --parent 1 --status backlog
agkan task add "Testing" --parent 1 --status backlog

# Set dependencies (design → implementation → testing)
agkan task block add 2 3
agkan task block add 3 4

# View all tasks
agkan task list --tree
\`\`\`

---

## Configuration

Place \`.agkan.yml\` in the project root to customize the DB path:

\`\`\`yaml
path: ./.agkan/data.db
\`\`\`

Or use the environment variable: \`AGENT_KANBAN_DB_PATH=/custom/path/data.db\`
`;

export function setupAgentGuideCommand(program: Command): void {
  program
    .command('agent-guide')
    .description('Show agent guide for using agkan')
    .action(() => {
      console.log(AGENT_GUIDE_CONTENT);
    });
}
