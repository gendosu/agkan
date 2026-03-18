/**
 * Init command handler
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { getConfigFileName, getDefaultDirName } from '../../db/config';

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
    });
}
