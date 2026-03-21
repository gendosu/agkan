import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { TmuxService } from '../../src/services/TmuxService';

// We mock child_process to avoid requiring a real tmux installation in CI
vi.mock('child_process', () => {
  const mockChildProcess = {
    unref: vi.fn(),
  };
  return {
    execSync: vi.fn(),
    exec: vi.fn(),
    spawn: vi.fn(() => mockChildProcess),
  };
});

import { execSync } from 'child_process';

const mockExecSync = execSync as ReturnType<typeof vi.fn>;

function resetMocks(): void {
  mockExecSync.mockReset();
}

describe('TmuxService', () => {
  let service: TmuxService;

  beforeEach(() => {
    resetMocks();
    service = new TmuxService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sessionExists', () => {
    it('returns true when tmux has-session exits with 0', () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(''));
      expect(service.sessionExists('test')).toBe(true);
    });

    it('returns false when tmux has-session throws', () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('no server running');
      });
      expect(service.sessionExists('test')).toBe(false);
    });
  });

  describe('startSession', () => {
    it('starts a new session when it does not already exist', () => {
      // First call: has-session throws (session does not exist)
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('no server');
      });

      expect(() => service.startSession('my-session', 'echo hi')).not.toThrow();
      // Only one execSync call for sessionExists check; spawn is called but not mocked in execSync
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('throws when the session already exists', () => {
      // has-session returns successfully (session exists)
      mockExecSync.mockReturnValueOnce(Buffer.from(''));

      expect(() => service.startSession('my-session', 'echo hi')).toThrow("Session 'my-session' already exists");
      // Only one execSync call for sessionExists check
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('killSession', () => {
    it('calls tmux kill-session', () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(''));
      service.killSession('my-session');
      expect(mockExecSync).toHaveBeenCalledTimes(1);
      const cmd = mockExecSync.mock.calls[0][0] as string;
      expect(cmd).toContain('kill-session');
    });
  });

  describe('listSessions', () => {
    it('returns parsed session list', () => {
      const fakeOutput = 'alpha|Mon Jan  1 00:00:00 2026|2|0\nbeta|Mon Jan  1 00:00:01 2026|1|1';
      mockExecSync.mockReturnValueOnce(Buffer.from(fakeOutput));
      const sessions = service.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].name).toBe('alpha');
      expect(sessions[1].name).toBe('beta');
      expect(sessions[1].attached).toBe('1');
    });

    it('returns empty array when no tmux server is running', () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('no server running on /tmp/tmux-1000/default');
      });
      expect(service.listSessions()).toEqual([]);
    });

    it('returns empty array for empty output', () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(''));
      expect(service.listSessions()).toEqual([]);
    });
  });

  describe('capturePane', () => {
    it('returns pane content when session exists', () => {
      // sessionExists check
      mockExecSync.mockReturnValueOnce(Buffer.from(''));
      // capture-pane
      mockExecSync.mockReturnValueOnce(Buffer.from('Hello from tmux\n$ '));

      const content = service.capturePane('my-session');
      expect(content).toBe('Hello from tmux\n$ ');
    });

    it('returns null when session does not exist', () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('no server');
      });
      expect(service.capturePane('missing')).toBeNull();
    });

    it('returns null when capture-pane throws', () => {
      // sessionExists: ok
      mockExecSync.mockReturnValueOnce(Buffer.from(''));
      // capture-pane: fails
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('error');
      });
      expect(service.capturePane('my-session')).toBeNull();
    });
  });

  describe('streamPane', () => {
    it('calls onData when pane content changes', async () => {
      vi.useFakeTimers();

      const chunks: string[] = [];
      let endedCalled = false;

      // Poll 1: streamPane.sessionExists → ok
      mockExecSync.mockReturnValueOnce(Buffer.from(''));
      // Poll 1: capturePane.sessionExists → ok (internal double-check)
      mockExecSync.mockReturnValueOnce(Buffer.from(''));
      // Poll 1: capturePane execSync(capture-pane) → new content
      mockExecSync.mockReturnValueOnce(Buffer.from('line1\n'));
      // Poll 2: streamPane.sessionExists → session gone -> triggers onEnd
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('no server');
      });

      service.streamPane(
        'my-session',
        (c) => chunks.push(c),
        () => {
          endedCalled = true;
        },
        100
      );

      // Advance past time 0 to fire poll 1, then 100ms to fire poll 2
      await vi.advanceTimersByTimeAsync(200);

      vi.useRealTimers();

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('line1\n');
      expect(endedCalled).toBe(true);
    });

    it('calls onEnd when session disappears immediately', async () => {
      vi.useFakeTimers();

      let ended = false;
      // sessionExists: session gone immediately
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('no server');
      });

      service.streamPane(
        'gone',
        () => {},
        () => {
          ended = true;
        },
        100
      );

      // First poll executes at time 0
      await vi.advanceTimersByTimeAsync(0);

      vi.useRealTimers();

      expect(ended).toBe(true);
    });

    it('stop function prevents further polling', async () => {
      vi.useFakeTimers();

      // sessionExists: ok for first check
      mockExecSync.mockReturnValue(Buffer.from(''));

      const stop = service.streamPane(
        'my-session',
        () => {},
        () => {},
        100
      );

      // Stop before any timer fires
      stop();

      // Advance time; if polling continued it would keep calling execSync
      await vi.advanceTimersByTimeAsync(500);

      vi.useRealTimers();

      // With stopped=true the first scheduled callback should not call execSync at all
      // (poll returns immediately when stopped)
      // execSync call count is 0 since poll returns early on stopped flag
      expect(mockExecSync).toHaveBeenCalledTimes(0);
    });
  });
});
