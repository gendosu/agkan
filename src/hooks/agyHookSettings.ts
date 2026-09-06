import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { randomBytes } from 'crypto';

const STOP_HOOK = resolve(__dirname, 'hook-agy-notify.mjs');

const HOOKS_FILE = 'hooks.json';
// The key under which the board registers its own hook in the shared file. Any other
// top-level key already present (a user's own named hooks, or another plugin's) is
// preserved untouched — see the merge logic below.
const BOARD_HOOK_NAME = 'board-stop';

function buildBoardHook(): unknown {
  return {
    Stop: [{ type: 'command', command: `node ${JSON.stringify(STOP_HOOK)}` }],
  };
}

/**
 * agy has no per-invocation flag for registering hooks (unlike claude's `--settings
 * <path>` or codex's `--config notify=[...]`): it only ever loads a single, global
 * `hooks.json` (verified against agy 1.1.27; contrary to its own bundled docs, which
 * describe a workspace-local `<workspace>/.agents/hooks.json` that this build does not
 * actually read). `configDir` is the directory containing that file — production passes
 * agy's real global config directory, tests pass a throwaway tmp directory.
 *
 * Because the file is shared with the user's own hooks (and possibly other tools'), this
 * merge-writes only the `board-stop` key and leaves every other key untouched, instead of
 * overwriting the whole file like `ensureBoardHookSettings` does for its own isolated file.
 */
export async function ensureAgyHookSettings(configDir: string): Promise<string> {
  await fs.mkdir(configDir, { recursive: true });
  const path = join(configDir, HOOKS_FILE);

  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(path, 'utf-8');
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch (parseErr) {
      // The file exists but is not valid JSON: a corrupt file must not block the board from
      // launching agy sessions, but silently starting from {} would discard every other
      // named hook the user (or another tool) had in it — so this is logged, unlike the
      // "file does not exist yet" case below.
      const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
      process.stderr.write(`ensureAgyHookSettings: ${path} is not valid JSON (${message}); replacing it\n`);
    }
  } catch {
    // File does not exist yet — nothing to preserve, nothing to warn about.
  }

  const desired = { ...existing, [BOARD_HOOK_NAME]: buildBoardHook() };
  if (JSON.stringify(existing) !== JSON.stringify(desired)) {
    // Write to a temp file first and rename into place: a plain writeFile would leave the
    // shared file half-written (and thus invalid JSON for every other agy invocation reading
    // it concurrently) if the process is killed mid-write; rename is atomic on the same
    // filesystem, so readers only ever see the old or the new complete content.
    const tmpPath = join(configDir, `.${HOOKS_FILE}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
    await fs.writeFile(tmpPath, JSON.stringify(desired, null, 2), 'utf-8');
    await fs.rename(tmpPath, path);
  }
  return path;
}
