export type { MigratableDatabase, Migration } from './types';

import type { Migration } from './types';
import { up as initialSchema } from './20260328000000_initial_schema';

export const migrations: Migration[] = [
  {
    version: '20260328000000',
    description: 'initial_schema',
    up: initialSchema,
  },
];
