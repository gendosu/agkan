import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.versions.bun || process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('This packaging experiment requires Bun on Linux x64');
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const ptyRoot = dirname(require.resolve('node-pty/package.json'));
const nativeDirectory = ['build/Release', 'build/Debug', 'prebuilds/linux-x64']
  .map((directory) => join(ptyRoot, directory))
  .find((directory) => existsSync(join(directory, 'pty.node')));
if (!nativeDirectory) throw new Error('Install the Linux x64 node-pty native addon before building');

const outputDirectory = join(root, 'dist', 'bun', 'agkan-linux-x64');
const binary = join(outputDirectory, 'agkan');
const archive = join(root, 'dist', 'bun', 'agkan-linux-x64.tar.gz');
const stagingDirectory = mkdtempSync(join(tmpdir(), 'agkan-bun-build-'));
try {
  // node-pty dynamically loads build/Release/pty.node, which the bundler cannot discover.
  const nativeAsset = join(stagingDirectory, 'build', 'Release');
  mkdirSync(nativeAsset, { recursive: true });
  copyFileSync(join(nativeDirectory, 'pty.node'), join(nativeAsset, 'pty.node'));
  mkdirSync(outputDirectory, { recursive: true });
  execFileSync(
    process.execPath,
    [
      'build',
      'src/cli/index.ts',
      '--compile',
      '--target=bun-linux-x64-baseline',
      `--compile-executable-path=${process.execPath}`,
      '--no-compile-autoload-dotenv',
      '--no-compile-autoload-bunfig',
      '--asset',
      join(stagingDirectory, 'build'),
      '--asset',
      join(root, 'dist', 'board', 'client'),
      `--outfile=${binary}`,
    ],
    { cwd: root, stdio: 'inherit' }
  );
  execFileSync('tar', ['-czf', archive, '-C', dirname(outputDirectory), 'agkan-linux-x64'], {
    cwd: root,
    stdio: 'inherit',
  });
  console.log(`Binary: ${binary} (${statSync(binary).size} bytes)`);
  console.log(`Archive: ${archive} (${statSync(archive).size} bytes)`);
} finally {
  rmSync(stagingDirectory, { recursive: true, force: true });
}
