import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    maxConcurrency: 1,
    env: { NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', 'dist/**', 'tests/**', '**/*.test.ts', '**/*.config.ts'],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
});
