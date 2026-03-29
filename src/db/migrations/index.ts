export type { MigratableDatabase, Migration } from './types';

import type { Migration } from './types';
import { up as initialSchema } from './20260328000000_initial_schema';
import { up as addSessionId } from './20260329000000_add_session_id_to_task_run_logs';

export const migrations: Migration[] = [
  {
    version: '20260328000000',
    description: 'initial_schema',
    up: initialSchema,
  },
  {
    version: '20260329000000',
    description: 'add_session_id_to_task_run_logs',
    up: addSessionId,
  },
];
