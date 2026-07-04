/**
 * Task archive command handler
 */

import { Command } from 'commander';
import { setupPurgeArchiveCommand } from './purge-archive-helpers';

export function setupTaskArchiveCommand(program: Command): void {
  setupPurgeArchiveCommand(program, {
    commandName: 'archive',
    verb: 'archive',
    pastVerb: 'Archived',
    description: 'Archive done/closed tasks older than a given date (sets is_archived flag)',
    beforeHelp: 'Archive tasks last updated before this date (ISO 8601, e.g. 2026-01-01). Defaults to 3 days ago.',
    serviceMethod: (taskService, beforeDate, statuses, dryRun) =>
      taskService.archiveTasksBefore(beforeDate, statuses, dryRun),
  });
}
