import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    testTimeout: 30000,
    hookTimeout: 30000,
    env: { NODE_ENV: 'test' },
    exclude: ['node_modules/**', '.claude/worktrees/**', 'tmp/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['node_modules/**', 'dist/**', 'tests/**', '**/*.test.ts', '**/*.config.ts', '**/*.d.ts'],
      thresholds: {
        // 実測ベースライン (2026-07-19時点: Stmts 89.83 / Branch 82.16 / Funcs 90.56 / Lines 91.3)。
        // 将来的にラチェットで引き上げる (agkan task #640)
        lines: 91,
        functions: 90,
        branches: 82,
        statements: 89,
      },
    },
  },
});
