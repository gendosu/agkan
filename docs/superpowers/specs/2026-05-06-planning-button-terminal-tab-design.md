# Planning Button: Terminal Tab Integration Design

**Date:** 2026-05-06
**Branch:** feat/494-terminal-based-claude-sessions

## Overview

Replace the current "Details" modal pattern with an embedded Terminal tab inside the detail panel. When a task starts executing (Planning or Run), the detail panel opens automatically and switches to the new Terminal tab, showing live xterm.js output in context with the task.

## Current Behavior

- Executing a task replaces the action button with "● Details"
- Clicking "● Details" triggers `openClaudeTerminalModal()`, opening a separate modal overlay
- The modal is decoupled from the detail panel — no task context visible alongside the terminal

## New Behavior

- Executing a task replaces the action button with "● Running" (status indicator)
- The detail panel opens automatically and switches to the new "Terminal" tab
- Live xterm.js output is displayed inside the Terminal tab, co-located with the task
- "● Running" button click: opens detail panel if closed, then switches to Terminal tab
- On completion: WebSocket disconnects but terminal output remains in the tab
- Button reverts based on current task status (not hardcoded to previous state)

## Architecture

### Before

```
[● Details] button → claudeTerminalModal.ts → modal overlay + xterm.js
```

### After

```
execution starts → openTaskDetail(taskId) → switchTab('terminal') → xterm.js (in-tab)
[● Running] button → click focuses detail panel Terminal tab
```

## File Changes

| File | Change |
|------|--------|
| `claudeTerminalModal.ts` | Remove modal-specific code; expose `attachTerminalToTab()`, `detachTerminal()`, `stopTerminal()` |
| `detailPanelHtml.ts` | Add "Terminal" tab button and `#detail-tab-content-terminal` div |
| `detailPanel.ts` | Add Terminal tab switch logic; hide footer on terminal tab; expose `switchTab` externally |
| `claudeButton.ts` | Change `replaceWithDetailBtn()` → `replaceWithRunningBtn()`; on start, call `openTaskDetail` + `switchTab('terminal')` + `attachTerminalToTab()` |
| `main.ts` | Remove modal callback registration; remove modal HTML |

## Terminal Tab Specification

### Display

- Tab always visible alongside Details / Comments / Run Logs
- Before any execution: shows placeholder text "No terminal session yet."
- During execution: live xterm.js output via WebSocket
- After execution: completed output remains (WebSocket disconnected, display preserved)

### Tab Switch Behavior

When `switchTab('terminal')` is called:
1. Footer (Save button) is hidden
2. If xterm.js not yet initialized: initialize and attach to `#detail-tab-content-terminal`
3. Run `FitAddon.fit()` to match current container size

## claudeTerminalModal.ts Refactored API

```typescript
// Initialize xterm.js in the given container and connect WebSocket for taskId
attachTerminalToTab(taskId: number, container: HTMLElement): void

// Disconnect WebSocket only; xterm.js display is preserved
detachTerminal(): void

// Call stop API for current task
stopTerminal(taskId: number): Promise<void>
```

- One xterm.js instance at a time (not per task-id)
- `terminal.reset()` called when attaching to a new task

## claudeButton.ts Execution Flow

### On execution start

1. Replace action button with "● Running" button
2. Attach click listener: opens detail panel if closed, then switches to Terminal tab
3. Call `openTaskDetail(taskId)`
4. Call `switchTab('terminal')`
5. Call `attachTerminalToTab(taskId, container)`

### On execution complete

1. Call `detachTerminal()` (WebSocket only; output preserved)
2. Fetch current task status
3. Render button based on current status:
   - `backlog` / `icebox` → "📋 Planning" button
   - `ready` / `in_progress` → "▶ Run" button (with dropdown)

## Stop Button

The Stop button currently lives in the modal header. After this change:
- Stop button is placed inside the Terminal tab content area
- Active during execution; hidden or disabled after completion
- Calls `stopTerminal(taskId)` → `DELETE /api/claude/tasks/:id/run`

## What Does Not Change

- xterm.js configuration (font, theme, scrollback, WebSocket endpoints)
- WebSocket endpoints (`/api/terminal/:id/io`, `/api/terminal/:id/control`)
- PTY server-side code
- Run Logs tab behavior
- Detail panel open/close/resize mechanics
