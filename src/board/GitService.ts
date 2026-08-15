import { execSync, execFileSync } from 'child_process';

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
    const cwd = process.cwd();
    const branchExists = execFileSync('git', ['branch', '--list', branch], { cwd }).toString().trim();
    if (branchExists) {
      execFileSync('git', ['checkout', branch], { cwd });
    } else {
      execFileSync('git', ['checkout', '-b', branch], { cwd });
    }
  }
}
