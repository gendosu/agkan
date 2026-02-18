/**
 * ErrorOnlyReporter - A custom Vitest reporter that shows only failed tests.
 *
 * Usage:
 *   npx vitest run --reporter=./tests/reporters/error-only.ts
 *   npm run test:errors
 *
 * Output:
 *   - Silences all passing test output
 *   - Shows full error details for each failing test
 *   - Prints a summary line at the end
 */

import type { Reporter, TestCase } from 'vitest/node';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export default class ErrorOnlyReporter implements Reporter {
  private passed = 0;
  private failed = 0;
  private skipped = 0;

  onTestCaseResult(testCase: TestCase): void {
    const result = testCase.result();

    if (result.state === 'passed') {
      this.passed++;
      return;
    }

    if (result.state === 'skipped') {
      this.skipped++;
      return;
    }

    if (result.state === 'failed') {
      this.failed++;
      const modulePath = testCase.module.moduleId.replace(process.cwd() + '/', '');
      console.log(`\n${RED}${BOLD}✗ FAIL${RESET} ${YELLOW}${modulePath}${RESET}`);
      console.log(`  ${BOLD}${testCase.fullName}${RESET}`);

      for (const error of result.errors) {
        if (error.message) {
          const lines = error.message.split('\n');
          for (const line of lines.slice(0, 10)) {
            console.log(`  ${line}`);
          }
          if (lines.length > 10) {
            console.log(`  ... (${lines.length - 10} more lines)`);
          }
        }
        if (error.diff) {
          console.log(`\n${error.diff}`);
        }
      }
    }
  }

  onTestRunEnd(): void {
    const total = this.passed + this.failed + this.skipped;
    const parts: string[] = [];

    if (this.failed > 0) {
      parts.push(`${RED}${this.failed} failed${RESET}`);
    }
    if (this.passed > 0) {
      parts.push(`${GREEN}${this.passed} passed${RESET}`);
    }
    if (this.skipped > 0) {
      parts.push(`${YELLOW}${this.skipped} skipped${RESET}`);
    }

    console.log(`\n${BLUE}Tests:${RESET} ${parts.join(', ')} ${BLUE}(${total} total)${RESET}`);

    if (this.failed === 0) {
      console.log(`${GREEN}${BOLD}✓ All tests passed${RESET}`);
    }
  }
}
