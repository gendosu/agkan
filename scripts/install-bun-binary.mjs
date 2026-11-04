import { chmodSync, copyFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'dist', 'bun', `agkan-${process.platform}-${process.arch}`, 'agkan');
const installDirectory = join(homedir(), '.local', 'bin');
const destination = join(installDirectory, 'agkan');
const temporary = `${destination}.${process.pid}.tmp`;

mkdirSync(installDirectory, { recursive: true });
try {
  copyFileSync(source, temporary);
  chmodSync(temporary, 0o755);
  // Copying onto the destination fails with ETXTBSY while agkan runs; a rename replaces it atomically.
  renameSync(temporary, destination);
} finally {
  rmSync(temporary, { force: true });
}
console.log(`Installed: ${destination}`);
