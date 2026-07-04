#!/usr/bin/env node
// Ensure node-pty's prebuilt `spawn-helper` binaries keep their execute bit.
//
// Under pnpm on macOS the prebuilds are materialized as clones of the store
// copy (mode 0644), so they lose +x on every install and `pty.spawn()` then
// fails with "posix_spawnp failed.". This runs from the `postinstall` script.
// A runtime self-heal (src/terminal/ensureSpawnHelperExecutable.ts) covers the
// cases where install scripts do not run (cache restore, --ignore-scripts).
import { statSync, chmodSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const EXEC_BITS = 0o111;

function makeExecutable(filePath) {
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

let prebuildsDir;
try {
  prebuildsDir = join(dirname(require.resolve('node-pty/package.json')), 'prebuilds');
} catch {
  // node-pty is not installed (e.g. a --prod install without it) — nothing to do.
  process.exit(0);
}

if (!existsSync(prebuildsDir)) process.exit(0);

for (const entry of readdirSync(prebuildsDir)) {
  const helper = join(prebuildsDir, entry, 'spawn-helper');
  if (makeExecutable(helper)) {
    console.log(`[fix-node-pty-perms] +x ${helper}`);
  }
}
