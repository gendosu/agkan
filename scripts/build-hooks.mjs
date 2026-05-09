#!/usr/bin/env node
import { copyFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const srcDir = join(rootDir, 'src', 'hooks');
const destDir = join(rootDir, 'dist', 'hooks');

await mkdir(destDir, { recursive: true });

const hooks = ['hook-attention.mjs', 'hook-session-start.mjs', 'hook-stop.mjs'];
for (const hook of hooks) {
  await copyFile(join(srcDir, hook), join(destDir, hook));
  console.log(`Copied ${hook} to dist/hooks/`);
}
