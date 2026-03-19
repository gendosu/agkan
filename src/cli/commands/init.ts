/**
 * Init command handler
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { getConfigFileName, getDefaultDirName } from '../../db/config';
import { TagService } from '../../services';

const DEFAULT_CONFIG_CONTENT = `# agkan configuration file
#
# This file controls the behavior of agkan (Agent Kanban).
# Uncomment and modify the settings below to customize your agkan instance.

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
#   # Default: 3000
#   # port: 3000
#
#   # Title displayed in the board UI
#   # Default: Agent Kanban
#   # title: Agent Kanban
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
    });
}
