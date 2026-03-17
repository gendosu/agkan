/**
 * Init command handler
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { getConfigFileName, getDefaultDirName } from '../../db/config';

const DEFAULT_CONFIG_CONTENT = `# agkan configuration
path: .agkan/data.db
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
