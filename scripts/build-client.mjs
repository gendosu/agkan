#!/usr/bin/env node
// Build script for client-side board TypeScript code

import * as esbuild from 'esbuild';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

await mkdir(join(rootDir, 'dist', 'board', 'client'), { recursive: true });

await esbuild.build({
  entryPoints: [join(rootDir, 'src', 'board', 'client', 'main.ts')],
  bundle: true,
  minify: false,
  format: 'iife',
  outfile: join(rootDir, 'dist', 'board', 'client', 'board.js'),
  target: ['es2020'],
  logLevel: 'info',
});
