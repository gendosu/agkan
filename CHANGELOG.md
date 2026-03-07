# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

(no entries yet)

## [2.0.0] - 2026-03-07

### Added
- Add `agkan board` command for local Kanban board viewer (web UI)
- Add Priority model with shared constants and type guard
- Add task detail panel with slide-in UI on card click in board
- Add board features: create/delete tasks, priority sort, context menu
- Add Agent Skills section to README with link to agkan-skills

### Tests
- Add board E2E tests integrated into test suite
- Add unit tests for Priority model and sortByPriority
- Add API endpoint tests for POST/DELETE/PATCH `/api/tasks`
- Add tag and priority badge rendering tests for board HTML

## [1.6.0] - 2026-03-06

### Added
- Add `--dep-tree` option to `task list` command for dependency tree display (#19)
- Add `--sort` and `--order` options to `task list` command (#17)
- Support multiple statuses filter in `task list` command (#16)
- Add `--assignees` filter option to `task list` command (#15)
- Add `tag rename` command (#14)
- Support multi-field update via option flags in `task update` command (#18)
- Add tmux to devcontainer Dockerfile (#23)

### Fixed
- Convert empty assignees string to null in `task update` (#13)

### Tests
- Add `--json` flag tests to `task update` (#22)
- Add assignees field tests for tree JSON output (#21)
- Add post-update verification steps for assignees in e2e tests (#20)

## [1.5.0] - 2026-03-05

### Added
- Add `assignees` field to tasks for tracking task ownership (`--assignees` option in `task add` and `task update`)
- Display `assignees` in task list, task get, and task create output
- Add `assignees` field to JSON output of task commands

## [1.4.0] - 2026-03-02

### Added
- Add `--json` option to `task update` command for structured JSON output (`success`, `task`, `counts` fields)

## [1.3.2] - 2026-02-21

### Fixed
- Normalize bin entry path in package.json (remove redundant `./` prefix)

## [1.3.1] - 2026-02-21

### Fixed
- Resolve TypeScript type casting errors (TS2322, TS2352) in SQLiteAdapter and service layer
- Fix `pragma()` return type cast in SQLiteAdapter
- Fix `as unknown as T` pattern for `Record<string, unknown>` casts in MetadataService, TagService, TaskBlockService, TaskService, TaskTagService
- Fix `TagService.updateTag()` to handle optional `name` parameter with nullish coalescing

## [1.3.0] - 2026-02-20

### Added
- DB layer abstraction with StorageProvider interface for multi-backend support
- SQLite adapter implementing StorageProvider interface for better-sqlite3 integration
- Storage factory for backend selection and provider instantiation
- Comprehensive unit tests for SQLiteAdapter (46 tests covering all methods)
- DB architecture documentation

### Changed
- Internal: DB connections now use StorageProvider interface (no user-facing changes)

## [1.2.0] - 2026-02-20

### Added
- Display metadata in tree view of task list

### Changed
- Strengthen ESLint rules: `no-explicit-any` from warn to error, add `max-lines-per-function`, `max-depth`, `complexity` rules

## [1.1.1] - 2026-02-19

### Fixed
- Fix agent-guide command to show correct 7 statuses (icebox, backlog, ready, in_progress, review, done, closed)

## [1.1.0] - 2026-02-19

### Added
- Add icebox status for parking inactive tasks
- Add `--file` option to `task update` command for reading body content from a file (`agkan task update <id> body --file <path>`)
- Add `agent-guide` command for AI agent collaboration documentation

### Fixed
- Ensure deterministic tag ordering when timestamps are equal

### Changed
- Translate agent guide content to English
- Reorganize README sections for better readability

### Removed
- Remove invalid `akan` bin alias from package.json

## [1.0.0] - 2026-02-13

### Added
- Initial release of agkan CLI tool
- Task management commands: `add`, `list`, `get`, `update`, `delete`
- Five task statuses: `backlog`, `ready`, `in_progress`, `done`, `closed`
- Task fields: title, body, author, status, created_at, updated_at
- Attachment system for files
- File service for reading markdown files
- SQLite database backend with better-sqlite3
- Colorized CLI output with chalk
- Status-based filtering and author-based filtering
- Formatted date display
- Comprehensive test suite with vitest
