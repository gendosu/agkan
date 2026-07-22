/**
 * Tests for reference-data.json / commander definition drift
 */

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createProgram } from '../helpers/command-test-utils';

// Task command handlers
import { setupTaskAddCommand } from '../../src/cli/commands/task/add';
import { setupTaskListCommand } from '../../src/cli/commands/task/list';
import { setupTaskGetCommand } from '../../src/cli/commands/task/get';
import { setupTaskUpdateCommand } from '../../src/cli/commands/task/update';
import { setupTaskFindCommand } from '../../src/cli/commands/task/find';
import { setupTaskCountCommand } from '../../src/cli/commands/task/count';
import { setupTaskUpdateParentCommand } from '../../src/cli/commands/task/update-parent';
import { setupTaskDeleteCommand } from '../../src/cli/commands/task/delete';
import { setupTaskPurgeCommand } from '../../src/cli/commands/task/purge';
import { setupTaskArchiveCommand } from '../../src/cli/commands/task/archive';
import { setupTaskUnarchiveCommand } from '../../src/cli/commands/task/unarchive';
import { setupTaskCopyCommand } from '../../src/cli/commands/task/copy';

// Block command handlers
import { setupBlockAddCommand } from '../../src/cli/commands/block/add';
import { setupBlockRemoveCommand } from '../../src/cli/commands/block/remove';
import { setupBlockListCommand } from '../../src/cli/commands/block/list';

// Tag command handlers
import { setupTagAddCommand } from '../../src/cli/commands/tag/add';
import { setupTagListCommand } from '../../src/cli/commands/tag/list';
import { setupTagDeleteCommand } from '../../src/cli/commands/tag/delete';
import { setupTagAttachCommand } from '../../src/cli/commands/tag/attach';
import { setupTagDetachCommand } from '../../src/cli/commands/tag/detach';
import { setupTagShowCommand } from '../../src/cli/commands/tag/show';
import { setupTagRenameCommand } from '../../src/cli/commands/tag/rename';

// Meta command handlers
import { setupMetaSetCommand } from '../../src/cli/commands/meta/set';
import { setupMetaGetCommand } from '../../src/cli/commands/meta/get';
import { setupMetaListCommand } from '../../src/cli/commands/meta/list';
import { setupMetaDeleteCommand } from '../../src/cli/commands/meta/delete';

// Comment command handlers
import { setupCommentAddCommand } from '../../src/cli/commands/comment/add';
import { setupCommentListCommand } from '../../src/cli/commands/comment/list';
import { setupCommentDeleteCommand } from '../../src/cli/commands/comment/delete';
import { setupCommentUpdateCommand } from '../../src/cli/commands/comment/update';

// Ps command handler
import { setupPsCommand } from '../../src/cli/commands/ps';

// Board command handler
import { setupBoardCommand } from '../../src/cli/commands/board';

// Agent guide command handler
import { setupAgentGuideCommand } from '../../src/cli/commands/agent-guide';

// Init command handler
import { setupInitCommand } from '../../src/cli/commands/init';

// Context command handler
import { setupContextCommand } from '../../src/cli/commands/context';

// Export/Import command handlers
import { setupExportCommand } from '../../src/cli/commands/export';
import { setupImportCommand } from '../../src/cli/commands/import';

// Config command handler
import { setupConfigGetCommand } from '../../src/cli/commands/config/get';

/**
 * Subcommand groups whose children are documented in reference-data.json as a
 * single aggregated entry (e.g. "agkan task block") rather than as individual
 * leaf commands. Keep in sync with docs/src/reference-data.json.
 */
const AGGREGATE_GROUP_NAMES = new Set(['block', 'comment', 'meta']);

/**
 * Commands that both have their own action AND whose daemon-style
 * subcommands are documented as a single "start / stop / ..." opts line
 * instead of individual entries. Keep in sync with docs/src/reference-data.json.
 */
const DAEMON_SUBCOMMAND_PARENTS = new Set(['board']);

interface CliEntry {
  name: string;
  opts: Set<string>;
}

function argUsage(arg: { name(): string; required: boolean }): string {
  return arg.required ? `<${arg.name()}>` : `[${arg.name()}]`;
}

/**
 * Flag-style opts (starting with '-') are compared without their
 * placeholder name, since reference-data.json sometimes uses a more
 * descriptive placeholder than the commander definition (e.g. "-p, --port
 * <n>" vs "-p, --port <number>"). Verb-style opts (subcommand + args, used
 * for aggregated groups) are left untouched so argument changes still
 * surface as drift.
 */
function normalizeOpt(flag: string): string {
  if (!flag.startsWith('-')) return flag;
  return flag
    .replace(/[<[][^>\]]*[>\]]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildProgram(): Command {
  return createProgram((prog) => {
    // Create task command group
    prog.command('task').description('Task management commands');

    // Register task commands
    setupTaskAddCommand(prog);
    setupTaskListCommand(prog);
    setupTaskGetCommand(prog);
    setupTaskUpdateCommand(prog);
    setupTaskFindCommand(prog);
    setupTaskCountCommand(prog);
    setupTaskUpdateParentCommand(prog);
    setupTaskDeleteCommand(prog);
    setupTaskPurgeCommand(prog);
    setupTaskArchiveCommand(prog);
    setupTaskUnarchiveCommand(prog);
    setupTaskCopyCommand(prog);

    // Register block commands
    setupBlockAddCommand(prog);
    setupBlockRemoveCommand(prog);
    setupBlockListCommand(prog);

    // Create tag command group
    prog.command('tag').description('Tag management commands');

    // Register tag commands
    setupTagAddCommand(prog);
    setupTagListCommand(prog);
    setupTagDeleteCommand(prog);
    setupTagAttachCommand(prog);
    setupTagDetachCommand(prog);
    setupTagShowCommand(prog);
    setupTagRenameCommand(prog);

    // Register meta commands
    setupMetaSetCommand(prog);
    setupMetaGetCommand(prog);
    setupMetaListCommand(prog);
    setupMetaDeleteCommand(prog);

    // Register comment commands
    setupCommentAddCommand(prog);
    setupCommentListCommand(prog);
    setupCommentDeleteCommand(prog);
    setupCommentUpdateCommand(prog);

    // Register ps command
    setupPsCommand(prog);

    // Register board command
    setupBoardCommand(prog);

    // Register agent-guide command
    setupAgentGuideCommand(prog);

    // Register init command
    setupInitCommand(prog);

    // Register context command
    setupContextCommand(prog);

    // Register export/import commands
    setupExportCommand(prog);
    setupImportCommand(prog);

    // Register config commands
    setupConfigGetCommand(prog);
  });
}

/**
 * Recursively walk the commander tree and collect the set of entries that
 * reference-data.json is expected to document.
 *
 * - Commands with their own `.action()` are leaf entries, named by their full
 *   path (e.g. "agkan task add").
 * - Container commands (no `.action()`) are recursed into transparently,
 *   UNLESS their name is in AGGREGATE_GROUP_NAMES, in which case the whole
 *   subtree collapses into a single entry (e.g. "agkan task block") whose
 *   opts merge each child's own option flags plus a `<verb> <args>` entry
 *   per child (matching how these groups are documented).
 */
function collectCliEntries(command: Command, pathParts: string[]): CliEntry[] {
  const entries: CliEntry[] = [];

  for (const child of command.commands) {
    const childPath = [...pathParts, child.name()];
    const hasAction = (child as unknown as { _actionHandler: unknown })._actionHandler != null;

    if (AGGREGATE_GROUP_NAMES.has(child.name()) && !hasAction) {
      const opts = new Set<string>();
      for (const grandchild of child.commands) {
        const args = grandchild.registeredArguments.map(argUsage).join(' ');
        opts.add(`${grandchild.name()}${args ? ` ${args}` : ''}`);
        for (const option of grandchild.options) {
          opts.add(normalizeOpt(option.flags));
        }
      }
      entries.push({ name: `agkan ${childPath.join(' ')}`, opts });
      continue;
    }

    if (hasAction) {
      const opts = new Set(child.options.map((option) => normalizeOpt(option.flags)));
      if (DAEMON_SUBCOMMAND_PARENTS.has(child.name()) && child.commands.length > 0) {
        opts.add(child.commands.map((grandchild) => grandchild.name()).join(' / '));
      }
      entries.push({ name: `agkan ${childPath.join(' ')}`, opts });
    }

    if (child.commands.length > 0 && !DAEMON_SUBCOMMAND_PARENTS.has(child.name())) {
      entries.push(...collectCliEntries(child, childPath));
    }
  }

  return entries;
}

interface RefDetailCommand {
  name: string;
  opts: [string, string][];
}

interface RefDetailSection {
  task: RefDetailCommand[];
  tag: RefDetailCommand[];
  other: RefDetailCommand[];
}

interface ReferenceData {
  en: { refDetail: RefDetailSection };
  ja: { refDetail: RefDetailSection };
}

function loadReferenceData(): ReferenceData {
  const jsonPath = join(__dirname, '../../docs/src/reference-data.json');
  return JSON.parse(readFileSync(jsonPath, 'utf8')) as ReferenceData;
}

function flattenRefDetail(section: RefDetailSection): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const group of [section.task, section.tag, section.other]) {
    for (const command of group) {
      map.set(command.name, new Set(command.opts.map(([flag]) => normalizeOpt(flag))));
    }
  }
  return map;
}

describe('reference-data.json drift', () => {
  const program = buildProgram();
  const cliEntries = collectCliEntries(program, []);
  const cliEntryMap = new Map(cliEntries.map((entry) => [entry.name, entry.opts]));

  for (const lang of ['en', 'ja'] as const) {
    describe(`${lang}.refDetail`, () => {
      const referenceData = loadReferenceData();
      const jsonEntryMap = flattenRefDetail(referenceData[lang].refDetail);

      it('documents every CLI command (no missing entries)', () => {
        const missing = [...cliEntryMap.keys()].filter((name) => !jsonEntryMap.has(name));
        expect(missing).toEqual([]);
      });

      it('does not document commands that no longer exist in the CLI', () => {
        const stale = [...jsonEntryMap.keys()].filter((name) => !cliEntryMap.has(name));
        expect(stale).toEqual([]);
      });

      it('lists the same options for each command as the CLI defines', () => {
        const mismatches: string[] = [];
        for (const [name, cliOpts] of cliEntryMap) {
          const jsonOpts = jsonEntryMap.get(name);
          if (!jsonOpts) continue;

          const missingInJson = [...cliOpts].filter((flag) => !jsonOpts.has(flag));
          const extraInJson = [...jsonOpts].filter((flag) => !cliOpts.has(flag));
          if (missingInJson.length > 0 || extraInJson.length > 0) {
            mismatches.push(
              `${name}: missing in JSON=${JSON.stringify(missingInJson)}, extra in JSON=${JSON.stringify(extraInJson)}`
            );
          }
        }
        expect(mismatches).toEqual([]);
      });
    });
  }
});
