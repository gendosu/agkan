import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { randomBytes } from 'crypto';

const STOP_HOOK = resolve(__dirname, 'hook-grok-notify.mjs');

const SETTINGS_FILE = 'agkan-board-stop.json';

function buildSettings(): unknown {
  return {
    hooks: {
      Stop: [
        {
          hooks: [{ type: 'command', command: `node ${JSON.stringify(STOP_HOOK)}` }],
        },
      ],
    },
  };
}

/**
 * Grok reads and merges all *.json hook files in ~/.grok/hooks/ (or a test directory).
 * To avoid touching existing hook files (e.g. herdr.json), the board creates and maintains
 * its own dedicated agkan-board-stop.json file.
 */
export async function ensureGrokHookSettings(configDir: string): Promise<string> {
  await fs.mkdir(configDir, { recursive: true });
  const path = join(configDir, SETTINGS_FILE);
  const desired = JSON.stringify(buildSettings(), null, 2);
  let existing: string | null = null;
  try {
    existing = await fs.readFile(path, 'utf-8');
  } catch {
    // File does not exist yet
  }
  if (existing !== desired) {
    const tmpPath = join(configDir, `.${SETTINGS_FILE}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
    await fs.writeFile(tmpPath, desired, 'utf-8');
    await fs.rename(tmpPath, path);
  }
  return path;
}
