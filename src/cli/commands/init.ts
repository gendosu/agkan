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

# AI coding agent used by the board
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
# Valid effort values: low | medium | high | xhigh | max
# If omitted, the selected agent CLI's default model is used.
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
#       model: gpt-5.1-codex
#       effort: high
#     run:
#       model: gpt-5.1-codex
#       effort: high

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
