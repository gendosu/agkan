#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';

// Task command handlers
import { setupTaskAddCommand } from './commands/task/add';
import { setupTaskListCommand } from './commands/task/list';
import { setupTaskGetCommand } from './commands/task/get';
import { setupTaskUpdateCommand } from './commands/task/update';
import { setupTaskFindCommand } from './commands/task/find';
import { setupTaskCountCommand } from './commands/task/count';
import { setupTaskUpdateParentCommand } from './commands/task/update-parent';
import { setupTaskDeleteCommand } from './commands/task/delete';

// Block command handlers
import { setupBlockAddCommand } from './commands/block/add';
import { setupBlockRemoveCommand } from './commands/block/remove';
import { setupBlockListCommand } from './commands/block/list';

// Tag command handlers
import { setupTagAddCommand } from './commands/tag/add';
import { setupTagListCommand } from './commands/tag/list';
import { setupTagDeleteCommand } from './commands/tag/delete';
import { setupTagAttachCommand } from './commands/tag/attach';
import { setupTagDetachCommand } from './commands/tag/detach';
import { setupTagShowCommand } from './commands/tag/show';

// Meta command handlers
import { setupMetaSetCommand } from './commands/meta/set';
import { setupMetaGetCommand } from './commands/meta/get';
import { setupMetaListCommand } from './commands/meta/list';
import { setupMetaDeleteCommand } from './commands/meta/delete';

const program = new Command();

// Load version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

// Program basic information
program.name('agkan').version(packageJson.version).description('TypeScript-based CLI task management tool');

// Create task command group
program.command('task').description('Task management commands');

// Register task commands
setupTaskAddCommand(program);
setupTaskListCommand(program);
setupTaskGetCommand(program);
setupTaskUpdateCommand(program);
setupTaskFindCommand(program);
setupTaskCountCommand(program);
setupTaskUpdateParentCommand(program);
setupTaskDeleteCommand(program);

// Register block commands (block and tag handlers create their own subcommands)
setupBlockAddCommand(program);
setupBlockRemoveCommand(program);
setupBlockListCommand(program);

// Create tag command group
program.command('tag').description('Tag management commands');

// Register tag commands
setupTagAddCommand(program);
setupTagListCommand(program);
setupTagDeleteCommand(program);
setupTagAttachCommand(program);
setupTagDetachCommand(program);
setupTagShowCommand(program);

// Register meta commands
setupMetaSetCommand(program);
setupMetaGetCommand(program);
setupMetaListCommand(program);
setupMetaDeleteCommand(program);

// Execute program
program.parse(process.argv);
