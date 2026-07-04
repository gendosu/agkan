/**
 * Task purge command handler
 */

import { Command } from 'commander';
import { setupPurgeArchiveCommand } from './purge-archive-helpers';

export function setupTaskPurgeCommand(program: Command): void {
  setupPurgeArchiveCommand(program, {
    commandName: 'purge',
    verb: 'purge',
    pastVerb: 'Purged',
    description: 'Delete done/closed tasks older than a given date to reduce database size',
    beforeHelp: 'Purge tasks last updated before this date (ISO 8601, e.g. 2026-01-01). Defaults to 3 days ago.',
    serviceMethod: (taskService, beforeDate, statuses, dryRun) =>
      taskService.purgeTasksBefore(beforeDate, statuses, dryRun),
  });
}
