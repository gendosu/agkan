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
# Uncomment and modify the settings below to customize your agkan instance.

# Default AI coding agent used by the board
# Applies to tasks with no model override. A task that selects a model from
# modelCatalog runs on that row's cli instead.
# Valid values: claude | codex
# Default: claude
agent: claude

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

# Model configuration
# Model used when executing planning and run commands via the board.
# The value is passed to the selected agent CLI.
# Valid effort values come from the model's modelCatalog row (see below).
# If omitted for claude, the Claude CLI's own default model is used.
# If omitted for codex, agkan defaults to gpt-5.6-sol instead of the Codex CLI's own default.
# models:
#   claude:
#     planning:
#       model: opus
#       effort: high
#     run:
#       model: sonnet
#       effort: high
#   codex:
#     planning:
#       model: gpt-5.6-sol
#       effort: high
#     run:
#       model: gpt-5.6-sol
#       effort: high

# Model catalog
# Rows of cli + model + selectable efforts. Selecting a model on a task also
# selects the cli that runs it. Setting this key replaces the built-in catalog
# entirely (no per-row merge), and each model name may appear only once, even
# across cli values. The block below is the built-in default.
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
#     model: gpt-5.6-sol
#     efforts: [none, low, medium, high, xhigh]

# Permission mode configuration
# Controls permission prompts for the selected agent CLI.
# Default: auto
# Valid values: auto | acceptEdits | bypassPermissions | default | dontAsk | plan | skipPermissions
# Permission values are translated to the selected CLI's flags.
# Note: skipPermissions bypasses permission checks for both agents.
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
