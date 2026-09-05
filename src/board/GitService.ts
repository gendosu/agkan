import { execSync, execFileSync } from 'child_process';

/**
 * Rejects git option smuggling (leading `-`) and glob/shell metacharacters that
 * `git branch --list` would interpret as a pattern.
 */
const SAFE_BRANCH_NAME = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/;

export class GitService {
  listBranches(): string[] {
    try {
      const output = execSync('git branch -a', { cwd: process.cwd() }).toString();
      return output
        .split('\n')
        .map((line) =>
          line
            .replace(/^\*?\s+/, '')
            .replace(/^remotes\/origin\//, '')
            .trim()
        )
        .filter((line) => line && !line.startsWith('HEAD ->'))
        .filter((line, idx, arr) => arr.indexOf(line) === idx);
    } catch {
      return [];
    }
  }

  checkoutBranch(branch: string): void {
    if (!SAFE_BRANCH_NAME.test(branch)) {
      throw new Error(`Invalid branch name: ${branch}`);
    }
    const cwd = process.cwd();
    const branchExists = execFileSync('git', ['branch', '--list', branch], { cwd }).toString().trim();
    if (branchExists) {
      execFileSync('git', ['checkout', branch], { cwd });
    } else {
      execFileSync('git', ['checkout', '-b', branch], { cwd });
    }
  }
}
