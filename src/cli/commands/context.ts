/**
 * Context command handler
 *
 * Outputs a minimal agkan usage guide intended for Claude Code's
 * SessionStart hook. Plain text by default; JSON with additionalContext
 * when --hook is specified (matches the agent-guide convention).
 */

import { Command } from 'commander';

const CONTEXT_CONTENT = `This project uses agkan (Agent Kanban) for task management.

Common commands:
- agkan task list [--status <s>] [--tag <id>] [--tree]
- agkan task get <id>
- agkan task add "<title>" [--status <s>] [--parent <id>] [--file <path>]
- agkan task update <id> --status <s>
- agkan task find "<keyword>"
- agkan task block add <blocker-id> <blocked-id>
- agkan tag list / attach / detach

Statuses: icebox → backlog → ready → in_progress → review → done → closed

Use --json on most commands for machine-readable output.

For the full reference (all subcommands, JSON schemas, workflows), run:
  agkan agent-guide
`;

export function setupContextCommand(program: Command): void {
  program
    .command('context')
    .description('Output minimal agkan context for Claude Code SessionStart hook')
    .option('--hook', 'Output as JSON for use in SessionStart hooks')
    .action((options: { hook?: boolean }) => {
      if (options.hook) {
        console.log(JSON.stringify({ additionalContext: CONTEXT_CONTENT }));
      } else {
        console.log(CONTEXT_CONTENT);
      }
    });
}
