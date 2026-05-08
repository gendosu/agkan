import { promises as fs } from 'fs';
import { join, resolve } from 'path';

const ATTENTION_HOOK = resolve(__dirname, 'hook-attention.mjs');
const SESSION_START_HOOK = resolve(__dirname, 'hook-session-start.mjs');
const STOP_HOOK = resolve(__dirname, 'hook-stop.mjs');

const SETTINGS_FILE = 'board-hook-settings.json';

function buildSettings(): unknown {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [{ type: 'command', command: `node ${SESSION_START_HOOK}` }],
        },
      ],
      PreToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [{ type: 'command', command: `node ${ATTENTION_HOOK} pre` }],
        },
      ],
      PostToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [{ type: 'command', command: `node ${ATTENTION_HOOK} post` }],
        },
      ],
      Stop: [
        {
          hooks: [{ type: 'command', command: `node ${STOP_HOOK}` }],
        },
      ],
    },
  };
}

export async function ensureBoardHookSettings(dataDir: string): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const path = join(dataDir, SETTINGS_FILE);
  const desired = JSON.stringify(buildSettings(), null, 2);
  let existing: string | null = null;
  try {
    existing = await fs.readFile(path, 'utf-8');
  } catch {
    // ignore - file does not exist yet
  }
  if (existing !== desired) {
    await fs.writeFile(path, desired, 'utf-8');
  }
  return path;
}
