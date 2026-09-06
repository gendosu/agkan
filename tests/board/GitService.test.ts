/**
 * Tests for GitService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitService } from '../../src/board/GitService';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

async function getExecFileSyncMock() {
  const { execFileSync } = await import('child_process');
  return vi.mocked(execFileSync);
}

beforeEach(async () => {
  const execFileSyncMock = await getExecFileSyncMock();
  execFileSyncMock.mockReset();
  execFileSyncMock.mockReturnValue(Buffer.from(''));
});

describe('GitService.checkoutBranch - branch name validation', () => {
  const invalidBranches = [
    '--force',
    '-b',
    '-',
    '--',
    'feature/a b',
    'feature/a;rm -rf /',
    'feature/*',
    'feature/a?b',
    'feature/a[b]',
    'feature/$(id)',
    'feature/a\nb',
    '<auto-generate>',
    '',
  ];

  it.each(invalidBranches)('rejects %j without invoking git', async (branch) => {
    const execFileSyncMock = await getExecFileSyncMock();
    const gitService = new GitService();

    expect(() => gitService.checkoutBranch(branch)).toThrow(/Invalid branch name/);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('checks out an existing branch when the name is valid', async () => {
    const execFileSyncMock = await getExecFileSyncMock();
    execFileSyncMock.mockImplementation((cmd: unknown, args: unknown) => {
      const argsArr = args as string[];
      if (cmd === 'git' && argsArr[0] === 'branch' && argsArr[1] === '--list') {
        return Buffer.from('  feature/my-branch\n');
      }
      return Buffer.from('');
    });

    new GitService().checkoutBranch('feature/my-branch');

    expect(execFileSyncMock).toHaveBeenCalledWith('git', ['checkout', 'feature/my-branch'], expect.any(Object));
  });

  it('creates a branch when the valid name does not exist locally', async () => {
    const execFileSyncMock = await getExecFileSyncMock();

    new GitService().checkoutBranch('fix/723-branch_name.v2');

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'git',
      ['checkout', '-b', 'fix/723-branch_name.v2'],
      expect.any(Object)
    );
  });
});
