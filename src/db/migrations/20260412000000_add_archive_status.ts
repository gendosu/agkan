import type { MigratableDatabase } from './types';

// This migration is intentionally a no-op.
// The 'archive' status was removed from the CHECK constraint in favor of is_archived flag only.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function up(_db: MigratableDatabase): void {
  // no-op: archive status is managed via is_archived flag, not status column
}
