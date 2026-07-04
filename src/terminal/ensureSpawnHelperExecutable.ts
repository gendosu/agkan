import { statSync, chmodSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const EXEC_BITS = 0o111;

/**
 * Make a single file executable (chmod +x equivalent) if it exists and lacks
 * execute bits. Best-effort: never throws. Returns true only when it changed
 * the file's mode.
 */
export function makeExecutable(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) return false;
    const mode = statSync(filePath).mode;
    if ((mode & EXEC_BITS) === EXEC_BITS) return false;
    chmodSync(filePath, mode | EXEC_BITS);
    return true;
  } catch {
    return false;
  }
}

// Mirrors node-pty's own lookup order (see node-pty's src/utils.ts
// loadNativeModule): a node-gyp source build lands in build/Release (or
// build/Debug), while platforms with no compiled output ship a bundled
// prebuild instead.
const SPAWN_HELPER_SEARCH_DIRS = ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`];

/**
 * Find `spawn-helper` under a node-pty package directory, checking each
 * search dir in order and returning the first one that exists.
 */
export function findSpawnHelperInPackage(
  pkgRoot: string,
  searchDirs: string[] = SPAWN_HELPER_SEARCH_DIRS
): string | null {
  for (const dir of searchDirs) {
    const candidate = join(pkgRoot, dir, 'spawn-helper');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve node-pty's `spawn-helper` binary path for the current install.
 * Returns null when node-pty cannot be resolved or spawn-helper isn't found
 * in any of its known locations.
 */
export function resolveSpawnHelperPath(): string | null {
  try {
    const require = createRequire(__filename);
    const pkgPath = require.resolve('node-pty/package.json');
    return findSpawnHelperInPackage(dirname(pkgPath));
  } catch {
    return null;
  }
}

let healed = false;

/**
 * Startup self-heal for the node-pty `spawn-helper` binary.
 *
 * Under pnpm on macOS the prebuilt `spawn-helper` is materialized as a clone of
 * the store copy (mode 0644), so it loses its execute bit on every install and
 * `pty.spawn()` fails with "posix_spawnp failed.". The install-time
 * scripts/fix-node-pty-perms.mjs is the first line of defense; this runtime
 * self-heal guarantees the bit is set before the first spawn regardless of how
 * node_modules was materialized (cache restore, --ignore-scripts, etc.).
 *
 * Runs at most once per process and never throws.
 */
export function ensureSpawnHelperExecutable(): void {
  if (healed) return;
  healed = true;
  // Windows node-pty uses conpty/winpty, not spawn-helper.
  if (process.platform === 'win32') return;
  const helper = resolveSpawnHelperPath();
  if (!helper) return;
  if (makeExecutable(helper)) {
    console.error(`[pty] self-healed node-pty spawn-helper permissions (+x): ${helper}`);
  }
}
