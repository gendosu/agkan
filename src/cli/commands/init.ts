/**
 * Init command handler
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { getConfigFileName, getDefaultDirName } from '../../db/config';
import { TagService } from '../../services';
import { installSessionStartHook } from '../integrations/claudeSettings';

const DEFAULT_CONFIG_CONTENT = `# agkan configuration file
#
# This file controls the behavior of agkan (Agent Kanban).
# Uncomment and modify optional settings below to customize your agkan instance.

version: 2

# Fallback agent when a phase omits its agent. Version 1 configurations also
# use this as their single default agent.
# agent: claude

# Database path
# Location where agkan stores task data.
# Default: .agkan/data.db
# You can use absolute or relative paths (relative paths are resolved from current working directory)
# Example: path: /var/lib/agkan/data.db
# Example: path: ./custom/db/path/data.db
# path: .agkan/data.db

# Board server configuration
# Settings for the web-based board interface
# board:
#   # Port number for the board server
#   port: 3000
#
#   # Title displayed in the board UI
#   title: Agent Kanban

# Phase-specific launch configuration.
# A task-level model override still takes precedence and selects its catalog row's cli.
# Valid effort values come from the model's modelCatalog row (see below).
models:
  planning:
    agent: claude
    model: fable
    effort: high
  run:
    agent: codex
    model: gpt-6-astra
    effort: high

# Model catalog
# Rows of cli + model + selectable efforts. Selecting a model on a task also
# selects the cli that runs it. Setting this key replaces the built-in catalog
# entirely (no per-row merge), and each model name may appear only once. The
# block below is the built-in default.
# modelCatalog:
#   - cli: claude
#     model: fable
#     efforts: [low, medium, high, xhigh, max]
#   - cli: claude
#     model: opus
#     efforts: [low, medium, high, xhigh, max]
#   - cli: claude
#     model: sonnet
#     efforts: [low, medium, high, xhigh, max]
#   - cli: claude
#     model: haiku
#     efforts: [low, medium, high, xhigh, max]
#   - cli: codex
#     model: gpt-6.1-sol
#     efforts: [low, medium, high, xhigh, max, ultra]
#   - cli: codex
#     model: gpt-6-astra
#     efforts: [low, medium, high, xhigh, max, ultra]
#   - cli: codex
#     model: gpt-6-sol
#     efforts: [low, medium, high, xhigh, max, ultra]
#   - cli: codex
#     model: gpt-6-luna
#     efforts: [low, medium, high, xhigh, max]
#   - cli: codex
#     model: gpt-5.6-sol
#     efforts: [low, medium, high, xhigh, max, ultra]
#   - cli: codex
#     model: gpt-5.6-terra
#     efforts: [low, medium, high, xhigh, max, ultra]
#   - cli: codex
#     model: gpt-5.6-luna
#     efforts: [low, medium, high, xhigh, max]
#   - cli: agy
#     model: gemini-3.8-flash
#     efforts: [low, medium, high]
#   - cli: agy
#     model: gemini-3.7-flash
#     efforts: [low, medium, high]
#   - cli: agy
#     model: claude-sonnet-4-6
#     efforts: []
#   - cli: agy
#     model: claude-opus-4-6-thinking
#     efforts: []
#   - cli: agy
#     model: gpt-oss-120b-medium
#     efforts: []
#   - cli: grok
#     model: grok-4.7
#     efforts: [low, medium, high, xhigh]
#   - cli: grok
#     model: grok-4.6
#     efforts: [low, medium, high, xhigh]
#   - cli: grok
#     model: grok-4.5
#     efforts: [low, medium, high]

# Permission mode configuration
# Controls permission prompts for the selected agent CLI.
# Default: auto
# Valid values: auto | acceptEdits | bypassPermissions | default | dontAsk | plan | skipPermissions
# Permission values are translated to the selected CLI's flags.
# Note: skipPermissions bypasses permission checks for every agent.
# Codex unset/auto: on-request + approvals_reviewer="auto_review" + workspace-write.
# Codex workspace-write also sets sandbox_workspace_write.network_access=true for Board notifications.
# Codex default/acceptEdits/other values: on-request + workspace-write; preserve the configured reviewer.
# Codex dontAsk: never + workspace-write (no automatic approval review).
# Codex plan: never + read-only (no reviewer or workspace-write network override).
# Only explicit Codex skipPermissions/bypassPermissions disables approvals and sandboxing.
# Auto-review requires a Codex CLI advertising --approve-for-me (verified with 0.159.2).
# Unsupported/unverified CLIs fail to launch; administrator/account restrictions still apply.
# Auto-review retains sandbox boundaries; rejection requires a safer alternative or a reasoned user question, never bypass.
# Codex prompts resolve routine planning/run-all choices autonomously and record assumptions.
# Ask only about major unresolved requirements, user-only information, unauthorized irreversible actions or confidential data transmission.
# Respect prior permissions, administrator policies and stop requests. Approval review and agent questions are separate.
# The planning command normally updates tasks in workspace-write; explicit permissionMode: plan stays read-only.
# agy has no "auto" mode, so auto (the default) is passed to agy as --dangerously-skip-permissions.
# grok natively supports "auto", so permissionMode: auto maps directly to --permission-mode auto.
# Running board sessions with grok writes ~/.grok/hooks/agkan-board-stop.json to detect turn completion.
# Example: permissionMode: auto
# permissionMode: auto
`;

const DEFAULT_TAGS = ['bug', 'security', 'improvement', 'test', 'performance', 'refactor', 'docs'];

function createDefaultTags(): void {
  const tagService = new TagService();

  for (const tagName of DEFAULT_TAGS) {
    try {
      // Only create if tag doesn't already exist
      if (!tagService.getTagByName(tagName)) {
        tagService.createTag({ name: tagName });
      }
    } catch (error) {
      // Silently ignore if tag already exists (handles race conditions)
      if (!(error instanceof Error) || !error.message.includes('already exists')) {
        throw error;
      }
    }
  }
}

export function setupInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize agkan configuration and data directory')
    .action(() => {
      const cwd = process.cwd();
      const configFileName = getConfigFileName();
      const dirName = getDefaultDirName();
      const configPath = path.join(cwd, configFileName);
      const dirPath = path.join(cwd, dirName);

      // Handle config file
      if (fs.existsSync(configPath)) {
        console.log(`Skipped: ${configFileName} already exists`);
      } else {
        fs.writeFileSync(configPath, DEFAULT_CONFIG_CONTENT, 'utf8');
        console.log(`Created: ${configFileName}`);
      }

      // Handle data directory
      if (fs.existsSync(dirPath)) {
        console.log(`Skipped: ${dirName}/ directory already exists`);
      } else {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created: ${dirName}/ directory`);
      }

      // Create default tags
      try {
        createDefaultTags();
      } catch (error) {
        // Tags creation is non-critical, so we log but don't fail init
        if (error instanceof Error) {
          console.error(`Warning: Failed to create default tags: ${error.message}`);
        }
      }

      // Install Claude Code SessionStart hook (non-critical)
      const claudeResult = installSessionStartHook(cwd);
      if (claudeResult.status === 'error') {
        console.error(`Warning: ${claudeResult.message}`);
      } else {
        console.log(claudeResult.message);
      }
    });
}
