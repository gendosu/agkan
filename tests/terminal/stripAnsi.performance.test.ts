import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { buildSync } from 'esbuild';
import { expect, it } from 'vitest';

it('processes long terminal lines in a child with an external timeout', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agkan-strip-ansi-'));
  const script = join(directory, 'benchmark.cjs');
  try {
    writeFileSync(join(directory, '.agkan-test.yml'), 'permissionMode: plan\n');
    buildSync({
      entryPoints: [join(__dirname, 'fixtures/stripAnsi.benchmark.ts')],
      outfile: script,
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'cjs',
      alias: { 'node-pty': join(__dirname, 'fixtures/ptyTestDouble.ts') },
    });
    const { stdout } = await promisify(execFile)(process.execPath, [script], {
      timeout: 30_000,
      killSignal: 'SIGKILL',
      cwd: directory,
      env: { ...process.env, NODE_PATH: join(process.cwd(), 'node_modules') },
    });
    const results = JSON.parse(stdout);
    expect(results).toHaveLength(21);
    for (const result of results) {
      expect(result.medianMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.msPerCharacter)).toBe(true);
    }
    console.table(results);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 40_000);
