---
layout: single
title: "agkan — AI-Optimized Task Management"
lang: en
permalink: /
header:
  overlay_color: "#1a1a2e"
  overlay_filter: 0.5
custom_css: true
---

<link rel="stylesheet" href="{{ '/assets/css/custom.css' | prepend: site.baseurl }}">

{% include lang-toggle.html %}

<div class="hero-section">
  <h1>agkan</h1>
  <p class="tagline">A lightweight CLI task management tool optimized for AI-assisted development</p>
  <div class="badges">
    <a href="https://github.com/gendosu/agkan/actions/workflows/test.yml">
      <img src="https://github.com/gendosu/agkan/workflows/Test/badge.svg?branch=main" alt="Test">
    </a>
    &nbsp;
    <a href="https://github.com/gendosu/agkan/actions/workflows/quality.yml">
      <img src="https://github.com/gendosu/agkan/workflows/Quality%20Check/badge.svg?branch=main" alt="Quality Check">
    </a>
  </div>
  <div class="install-box">
    <code id="install-cmd">npm install -g agkan</code>
    <button class="copy-btn" onclick="copyInstallCmd(this)" aria-label="Copy to clipboard">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      <span class="copy-label">Copy</span>
    </button>
  </div>
</div>

<script>
function copyInstallCmd(btn) {
  var text = document.getElementById('install-cmd').textContent;
  navigator.clipboard.writeText(text).then(function() {
    var label = btn.querySelector('.copy-label');
    label.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(function() {
      label.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 2000);
  });
}
</script>

---

## Features

<div class="features-grid">
  <div class="feature-card">
    <h3>🤖 AI-Native Design</h3>
    <p>Built for seamless collaboration with Claude Code and AI agents. Automate task execution, planning, and reviews.</p>
  </div>
  <div class="feature-card">
    <h3>📋 Kanban Workflow</h3>
    <p>Manage tasks with 7 statuses: icebox, backlog, ready, in_progress, review, done, closed.</p>
  </div>
  <div class="feature-card">
    <h3>🗄️ SQLite Storage</h3>
    <p>Fast local data management with SQLite. No cloud dependency required.</p>
  </div>
  <div class="feature-card">
    <h3>🌳 Parent-Child Tasks</h3>
    <p>Manage task hierarchy with tree view. Organize complex work into subtasks.</p>
  </div>
  <div class="feature-card">
    <h3>🔗 Blocking Relationships</h3>
    <p>Define task dependencies and detect circular references automatically.</p>
  </div>
  <div class="feature-card">
    <h3>🏷️ Tag System</h3>
    <p>Classify and filter tasks with custom tags for better organization.</p>
  </div>
  <div class="feature-card">
    <h3>🖥️ Kanban Board UI</h3>
    <p>Local web-based Kanban board with built-in Claude integration for one-click task execution.</p>
  </div>
  <div class="feature-card">
    <h3>📤 JSON Output</h3>
    <p>Machine-readable JSON output for all commands — perfect for scripting and automation.</p>
  </div>
</div>

---

## Demo

<div class="demo-section">
  <p>See agkan in action with these common workflows:</p>
  <div class="demo-placeholder">
<pre>
# Initialize agkan in your project
$ agkan init

# Create a task
$ agkan task add "Implement login feature" "User authentication system"

# List all tasks
$ agkan task list
 ID  TITLE                      STATUS    PRIORITY
 1   Implement login feature    backlog   medium

# Update task status
$ agkan task update 1 --status in_progress

# List in_progress tasks
$ agkan task list --status in_progress
 ID  TITLE                      STATUS       PRIORITY
 1   Implement login feature    in_progress  medium

# Use tags
$ agkan tag add "backend"
$ agkan tag attach 1 "backend"

# Start Kanban board in browser
$ agkan board
Board started at http://localhost:8080
</pre>
  </div>
</div>

---

## Installation

### Prerequisites

- Node.js 20 or higher
- npm

### Install from npm (Recommended)

```bash
npm install -g agkan
```

### Install from GitHub

```bash
npm install -g https://github.com/gendosu/agkan.git
```

### Initialize in Your Project

```bash
cd your-project
agkan init
```

---

## Usage

### Create Tasks

```bash
# Basic task creation
agkan task add "Task title" "Task description"

# Create with status and author
agkan task add "Implement login feature" "User auth system" \
  --status ready \
  --author "your-name"

# Create from Markdown file
agkan task add "Design review" --file ./design-doc.md
```

### List and Search Tasks

```bash
# List all tasks
agkan task list

# Filter by status
agkan task list --status in_progress

# Tree view (parent-child)
agkan task list --tree

# Filter by tag
agkan task list --tag "backend"

# Search by keyword
agkan task find "login"
```

### Update Tasks

```bash
# Update status
agkan task update 1 --status review

# Update title
agkan task update 1 --title "New title"
```

### Kanban Board

```bash
# Start local web UI
agkan board

# Custom port
agkan board -p 3000
```

### Agent Skills

For AI-assisted task execution with Claude Code:

```bash
# Install companion skills package
npm install -g agkan-skills
```

See [agkan-skills](https://github.com/gendosu/agkan-skills) for details.

<div class="warning-box">
  <p>⚠️ <strong>Important</strong>: agkan launches Claude Code in <code>--dangerously-skip-permissions</code> mode. Only use on trusted code in isolated environments.</p>
</div>

---

## Links

- [GitHub Repository](https://github.com/gendosu/agkan)
- [Command Reference]({{ site.baseurl }}/reference/commands/)
- [日本語]({{ site.baseurl }}/ja/)
- [npm Package](https://www.npmjs.com/package/agkan)
