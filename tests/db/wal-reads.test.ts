import { it } from 'vitest';
import { verifyWALReadProcesses } from './sqlite-wal-processes';

it.each(['new', 'migrate'])(
  'keeps HTTP and a new CLI process readable during a 7s writer lock: %s DB',
  async (mode) => {
    await verifyWALReadProcesses(mode);
  },
  30_000
);
