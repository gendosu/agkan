# Configuration

Full configuration reference for agkan, covering `.agkan.yml` fields, database path resolution, test mode behavior, and per-project setup.

## Table of Contents

- [Database Storage Location](#database-storage-location)
  - [Configuration File: `.agkan.yml`](#configuration-file-agkanyml)
  - [Path Specification](#path-specification)
  - [Environment Variable Configuration](#environment-variable-configuration)
  - [Default Behavior](#default-behavior)
  - [Per-Project Management](#per-project-management)
- [Board Settings](#board-settings)
- [Models Settings](#models-settings)
- [Permission Mode Settings](#permission-mode-settings)

## Database Storage Location

agkan allows customization of the database storage location via a configuration file.

### Configuration File: `.agkan.yml`

Create a `.agkan.yml` file in your project root directory to specify the database storage location.

**Configuration Example:**

```yaml
# Path to database file
path: ./.agkan/data.db
```

### Path Specification

- **Relative Path**: Resolved relative to the current directory
  ```yaml
  path: ./data/kanban.db
  path: ./.agkan/data.db
  ```

- **Absolute Path**: Used as-is
  ```yaml
  path: /home/user/.config/akan/data.db
  ```

### Environment Variable Configuration

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
   NODE_ENV=test pnpm test
   # Uses .agkan-test/data.db by default

   # Override with custom test database
   NODE_ENV=test AGENT_KANBAN_DB_PATH=/tmp/test.db pnpm test
   ```

### Default Behavior

If no `.agkan.yml` file exists and no environment variable is set, the database is created in:

```
<current-directory>/.agkan/data.db
```

In test mode (`NODE_ENV=test`), the default location is:

```
<current-directory>/.agkan-test/data.db
```

### Per-Project Management

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

## Board Settings

The `board` section in `.agkan.yml` allows you to customize the behavior of the `agkan board` command.

### Available Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `board.port` | number | `8080` | Port number for the board web server |
| `board.title` | string | `"agkan Board"` | Title displayed in the board UI |

### Configuration Example

```yaml
# Path to database file
path: ./.agkan/data.db

# Board settings
board:
  port: 8080
  title: "My Project Board"
```

### Field Details

- **`board.port`**: Specifies the TCP port on which the board web server listens. Useful when the default port `8080` is already in use.
  ```yaml
  board:
    port: 8080
  ```

- **`board.title`**: Sets the title shown in the board UI. Helps distinguish boards when managing multiple projects.
  ```yaml
  board:
    title: "My Project Board"
  ```

## Models Settings

The `models` section in `.agkan.yml` allows you to specify the Claude model and effort level used when executing planning and run commands via the board.

### Available Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `models.planning.model` | string | (Claude CLI default) | Model used for planning command execution |
| `models.planning.effort` | string | (Claude CLI default) | Effort level for planning command (`low`, `medium`, `high`, `xhigh`, `max`) |
| `models.run.model` | string | (Claude CLI default) | Model used for run/pr command execution |
| `models.run.effort` | string | (Claude CLI default) | Effort level for run/pr command (`low`, `medium`, `high`, `xhigh`, `max`) |

Both full model names and Claude CLI aliases are supported. Both `model` and `effort` are optional within each entry.

### Configuration Example

```yaml
# Database path
path: ./.agkan/data.db

# Model settings
models:
  planning:
    model: claude-opus-4-7
    effort: high
  run:
    model: claude-sonnet-4-6
    effort: low
```

### Using Aliases

You can use short aliases instead of full model names:

```yaml
models:
  planning:
    model: opus
    effort: high
  run:
    model: sonnet
```

Supported aliases: `opus`, `sonnet`, `haiku` (resolved by the Claude CLI)

### Field Details

- **`models.planning`**: Specifies the Claude model and effort level used when the board executes planning tasks. Recommended to use a high-capability model and effort level such as `opus` with `high`.
  ```yaml
  models:
    planning:
      model: opus
      effort: high
  ```

- **`models.run`**: Specifies the Claude model and effort level used when the board executes run or pr commands. The `pr` command also uses this value.
  ```yaml
  models:
    run:
      model: sonnet
      effort: low
  ```

## Permission Mode Settings

The `permissionMode` field in `.agkan.yml` controls how Claude CLI permission checks are handled when executing tasks from the board.

### Available Values

| Value | Claude CLI flag | Description |
|-------|----------------|-------------|
| (not set) | `--permission-mode auto` | Default. Claude uses auto permission mode |
| `auto` | `--permission-mode auto` | Claude uses auto permission mode |
| `bypassPermissions` | `--permission-mode bypassPermissions` | Bypass all permission checks |
| `acceptEdits` | `--permission-mode acceptEdits` | Automatically accept file edits |
| `dontAsk` | `--permission-mode dontAsk` | Do not ask for permissions |
| `plan` | `--permission-mode plan` | Plan-only mode |
| `default` | `--permission-mode default` | Claude default permission mode |
| `skipPermissions` | `--dangerously-skip-permissions` | Legacy flag (same as bypassing all checks) |

### Configuration Example

```yaml
# Use auto permission mode (default)
permissionMode: auto

# Use legacy --dangerously-skip-permissions flag
permissionMode: skipPermissions
```

> **Breaking Change**: Prior to this feature, `--dangerously-skip-permissions` was always passed. The new default is `--permission-mode auto`. To restore the previous behavior, set `permissionMode: skipPermissions` in your `.agkan.yml`.
