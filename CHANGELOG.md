# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.1] - 2026-04-09

### Fixed
- Preserve scroll position in run logs by skipping unchanged re-renders (#199)

### Changed
- Replace generic Error throws with custom error classes in service layer (#200)
- Define custom error classes in src/errors.ts (#198)
- Wrap task INSERT + tag attachment in transaction in TaskService (#197)
- Wrap ExportImportService importData() in a single transaction (#196)
- Restrict PID file permissions to owner-only for security (#193)

## [3.0.0] - 2026-04-06

### Added
- Add Claude process integration with ps command to list running Claude processes
- Add ClaudeProcessService for managing claude CLI processes
- Add RunLog repository for task process run history
- Add Run Logs tab to board detail panel with polling and log viewer
- Add Claude run/plan buttons on board cards with stream modal
- Add Claude API routes for process start/stop/stream and run logs
- Add verbose logging utility

### Changed
- Move documentation to docs/ directory and extract README sections

## [3.0.0-rc10] - 2026-04-04

### Added
- Make Blocked by, Blocking, and Parent relation items clickable in board detail panel

### Fixed
- Include task_blocks in polling signature to detect dependency changes in board

## [3.0.0-rc9] - 2026-04-03

### Changed
- Add task copy command to agent guide

## [3.0.0-rc8] - 2026-04-03

### Added
- Add task copy command

### Fixed
- Fix dependency arrow rendering for same-column tasks in board
- Clear arrowMarkers cache when SVG overlay is recreated in board
- Prevent stale polling overwrite after drag-drop status update in board

## [3.0.0-rc7] - 2026-04-03

### Added
- Add daemon start/stop/restart subcommands for board
- Convert board command to proper subcommand structure
- Add status subcommand to show server status and task summary

### Changed
- Add .npmrc with minimum-release-age setting

## [3.0.0-rc6] - 2026-04-02

### Fixed
- Fix loading indicator breaking to new line in h1 in board header
- Fix detail panel copy ID button layout and styling

## [3.0.0-rc5] - 2026-03-31

### Fixed
- Move running indicator inside h1 tag in board header

## [3.0.0-rc4] - 2026-03-31

### Added
- Add running indicator spinner to board header

### Fixed
- Move running indicator to immediately after h1 in board header

## [3.0.0-rc3] - 2026-03-31

### Added
- Set default priority to medium for task creation

### Fixed
- Fix textarea resize on task switch in board using double rAF

### Refactored
- Replace pragma_table_info() with addColumnIfNotExists helper in migration
- Replace sqlite_master with SAVEPOINT-based CHECK constraint check in migration

## [3.0.0-rc2] - 2026-03-30

### Fixed
- Fix reload button size in detail panel async update warning

## [3.0.0-rc1] - 2026-03-30

## [2.15.0] - 2026-04-04

### Added
- Add `board status` subcommand to show server status and task summary (#185)
- Add `board start`, `board stop`, `board restart` daemon subcommands
- Add `task copy` command to duplicate tasks (#181)
- Add ability to create new tags from tag selectors in board (#172)
- Add copy task ID button to detail panel header (#172)
- Add dependency visualization SVG overlay with bezier lines on board (#164)
- Add favicon to board HTML page (#174)
- Set default priority to medium for task creation (#169)

### Changed
- Convert `board` command to proper subcommand structure (#185)
- Migrate from npm to pnpm (#177)

### Fixed
- Make Blocked by, Blocking, and Parent relation items clickable in detail panel (#186)
- Fix dependency arrow rendering for same-column tasks (#182)
- Fix bezier line direction when cards are on both sides (#173)
- Prevent dependency lines from rendering above detail panel (#173)
- Fix board toast z-index so it appears above detail panel (#183)
- Fix detail panel copy ID button layout and styling (#172)
- Update task updated_at when tags are added or removed via CLI (#171)
- Fix stable sort for task metadata ORDER BY (#182)

### Refactored
- Migrate StorageProvider to Repository pattern (#161)
- Migrate priority from metadata to DB column (#162)
- Introduce migration framework with initial_schema (#167)
- Replace SQLite-specific migration checks with generic runner (#167)

## [2.14.3] - 2026-03-24

### Fixed
- Fix overflow hidden on detail textarea to prevent scrollbar flickering (#257)

### Refactored
- Decompose detailPanel.ts into separate concern modules (SoC) (#260)

## [2.14.2] - 2026-03-24

### Fixed
- Fix tag input content shift and blinking on detail pane open (#254)
- Fix scroll position reset in detail pane when resizing textarea (#255)

## [2.14.1] - 2026-03-23

### Fixed
- Fix description textarea in detail pane expanding beyond text height on open (#253)

## [2.14.0] - 2026-03-23

### Added
- Add visual selection indicator for task card when detail pane is open (#252)
- Add export/import functionality for tasks (#91)
- Add tag and metadata UI to task creation modal (#246)
- Add data-updated-at attribute to board cards for change detection

### Fixed
- Fix board screen flickering with incremental DOM diffing instead of full innerHTML replacement (#248)
- Fix location.reload() calls replaced with refreshBoardCards() for smoother updates (#247, #244)
- Fix guard against null import modal elements in initImportModal
- Fix missing author/assignees fields in boardRenderer tests

## [2.13.0] - 2026-03-21

### Added
- Add dark mode support to board with CSS variables and theme toggle in burger menu (#188)
- Persist dark mode theme setting to `.agkan/config.yml` (#188)
- Add free-text search to board filter bar (#180)
- Add Escape key to close detail panel (#235)
- Add metadata display to board detail panel (#190)
- Add `ServiceContainer` to centralize service instantiation for CLI commands (#229)
- Add `formatJsonSuccess` and `formatJsonError` to output-formatter (#214)

### Fixed
- Apply dark mode styles to drag & drop status area (#239)
- Apply dark mode styles to Version Info modal (#240)
- Remove deprecated `--ext .ts` flag from ESLint scripts (#203)

### Refactored
- Replace localStorage theme management with SSR `data-theme` attribute (#238)
- Replace global window comment functions with event delegation via `data-action` (#230)
- Deduplicate HTML escape logic across board modules (#228)
- Decompose board client modules to reduce cyclomatic complexity (#222)
- Consolidate response formatters into output-formatter (#214)

## [2.12.2] - 2026-03-20

### Fixed
- Fix detail panel "Failed to load task details" error caused by `const` declarations not being added to `window` object (#214)

## [2.12.1] - 2026-03-20

### Fixed
- Resolve TypeScript null checks in board client tags and detail panel closures (#212)
- Handle promise rejection and null checks in detail panel tags (#212)

### Tests
- Add unit tests for board client tags and detailPanel modules (#213)

## [2.12.0] - 2026-03-20

### Added
- Add esbuild client bundle build pipeline for board client TypeScript (#199)
- Add typed client-side TypeScript modules under `src/board/client/` (#199)
- Add burger menu to header bar with Purge Tasks and Version Info (#195)
- Add reload button to DB update warning in detail panel (#200)
- Fix sticky column headers with independent vertical scroll and drag auto-scroll (#197)
- Add release branch creation step to release skill docs (#211)

### Changed
- Split `server.ts` into module files (phase 1) (#198)
- Update tsconfig.json files to TypeScript 5.x settings (#201)
- Update Node.js engine requirement from >=18.0.0 to >=20.0.0 (#204)

### Fixed
- Remove stale update-warning bar on detail panel reload (#207)
- Migrate kill_port() from ss to lsof for cross-platform compatibility in E2E tests
- Add env.d.ts to provide DOM lib types for IDE language server (#199)
- Fix TypeScript type errors in burger menu implementation (#195)
- Use type-only imports for verbatimModuleSyntax compatibility (#201)
- Build client bundle before running tests in pre-push hook
- Prevent root-owned directories on Mac in devcontainer (#205)

## [2.11.0] - 2026-03-19

### Added
- Add board comment UI with display, add, delete, and edit functionality (#70)
- Increase add task modal width from 360px to 520px (#101)
- Pre-create common tags on `agkan init` (#99)
- Redesign board detail pane with tab UI and comment support (#98)

### Fixed
- Remove double comments in `.agkan.yml` config template (#100)

## [2.10.1] - 2026-03-19

### Fixed
- Remove unreachable return statements after process.exit(1) (#95)
- Make --file alone trigger flag mode in task update command (#95)

## [2.10.0] - 2026-03-18

### Added
- `agkan init` now outputs full configuration template with all options commented (#93)

## [2.9.0] - 2026-03-18

### Added
- Remove parent-child relationship display from dependency tree view (`--dep-tree`) (#89)

### Fixed
- Sync `lastUpdatedAt` after detail pane save to prevent false conflict error (#90)
- Fix board server cleanup using setsid and process group kill in E2E tests (#91)

## [2.8.0] - 2026-03-17

### Added
- Add `agkan init` command to initialize configuration (#162)
- Add `board.port` and `board.title` settings to `.agkan.yml` configuration
- Persist detail pane width in `.agkan/config.yml`

### Fixed
- Use else branch to avoid unreachable code after process.exit

## [2.7.1] - 2026-03-16

### Fixed
- Fix prettier permission denied error in CI and prepublishOnly (#85)
- Increase performance test overhead threshold for stability (#85)

## [2.7.0] - 2026-03-16

### Added
- Keep detail pane open after saving task on board (#160)

### Fixed
- Improve board server test reliability (#83)

## [2.6.0] - 2026-03-15

### Added
- Add `--status` filter to `task find` command (#121)
- Add filter query params (status, priority, tag) to `GET /api/board/cards` endpoint (#157)
- Add task comment CLI commands: `task comment add`, `task comment list`, `task comment delete` (#135)
- Display parent-child relationships in dependency tree view (#136)
- Refresh detail panel on board polling update (#159)

### Fixed
- Resolve board filter tag dropdown clipping due to overflow-x: auto (#158)
- Update board test to use `task.priority` field instead of metadata array (#80)

### Changed
- Change board polling interval from 10s to 5s (#146)

## [2.5.0] - 2026-03-12

### Added
- Add task comment feature: `task comment add`, `task comment list`, `task comment delete` commands (#79)
- Display comments in `task get` output (#79)
- Implement react-select style tag editing in task detail panel (#134)
- Expand description textarea to fill bottom of detail panel (#135)

### Fixed
- Reset database before server start in e2e board test (#137)

### Changed
- Add agkan task management instruction to documentation (#65)

## [2.4.0] - 2026-03-10

### Added
- Change detail panel layout from overlay to side-by-side for improved usability (#56)

### Fixed
- Improve detail panel width management for side-by-side layout (#56)
- Hide detail panel until card is clicked and fix resize behavior (#56)
- Do not resize detail panel when already open on card click (#56)
- Clear inline width style when closing detail panel (#56)

## [2.3.0] - 2026-03-09

### Added
- Add `-t/--title` option to `agkan board` command to display a title in the header (#127)

### Fixed
- Continue board polling while detail panel is open and refresh cards in-place (#129)

### Changed
- Increase description textarea height to 240px in task detail panel (#128)

## [2.2.0] - 2026-03-08

### Added
- Add `--priority` filter option to `task list` command, supporting comma-separated values (e.g., `--priority high` or `--priority critical,high`) (#119)
- Add priority sort support to `task list` command (#118)
- Make board detail panel resizable by dragging (#125)

### Fixed
- Detect task_tags changes in board polling endpoint (#126)
- Add id as tiebreaker in listTasks sort to ensure stable ordering

## [2.1.1] - 2026-03-08

### Fixed
- Fix board card priority reading from `tasks.priority` column instead of `task_metadata` (#40)

## [2.1.0] - 2026-03-08

### Added
- Add `task purge` command for archiving and cleaning up tasks (#37)
- Add `--priority` option to `task add` and `task update` commands (#35)
- Add priority field to Task model, TaskService, and database migration (#35)
- Add board polling to auto-reload on external changes (#38)
- Add edit task functionality to board context menu (#31)
- Make board detail panel directly editable (removed context menu edit entry) (#33)
- Add `agkan show` as alias for `task get` command (#30)

### Fixed
- Ignore Enter key during IME composition in board add modal (#36)
- Rename `agkan task tag` to `agkan tag` in README (#32)

### Tests
- Add tests for priority field in TaskService and CLI commands

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
