# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
