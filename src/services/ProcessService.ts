import { spawn, execSync } from 'child_process';

export interface TmuxSessionInfo {
  name: string;
  created: string;
  windows: string;
  attached: string;
}

/**
 * Service for managing tmux sessions using child_process.spawn.
 * Avoids zombie processes by using native Node.js APIs with spawn for tmux sessions.
 * Properly handles process reaping in Docker containers by using:
 * - spawn with detached=true for session creation (allows proper signal handling)
 * - execSync for query operations (tmux commands that don't spawn long-lived processes)
 *
 * The key fix: tmux new-session is spawned with detached=true so it becomes
 * a child of init, preventing zombie processes when the Node.js container doesn't
 * have a proper init system.
 */
export class ProcessService {
  /**
   * Start a new tmux session running the given command.
   * Uses spawn with detached=true to prevent zombie processes in Docker.
   * Throws if a session with the same name already exists (double-start prevention).
   */
  startSession(sessionName: string, command: string): void {
    if (this.sessionExists(sessionName)) {
      throw new Error(`Session '${sessionName}' already exists`);
    }

    // Use spawn with detached=true and stdio 'ignore' for proper process management
    // This allows the tmux server to become a child of init rather than Node.js,
    // preventing zombie processes when Node.js doesn't reap children
    const child = spawn('tmux', ['new-session', '-d', '-s', sessionName, command], {
      stdio: 'ignore',
      detached: true,
    });

    // Immediately unref so Node.js doesn't wait for this process
    child.unref();
  }

  /**
   * Kill an existing tmux session.
   */
  killSession(sessionName: string): void {
    try {
      execSync(`tmux kill-session -t ${shellEscape(sessionName)}`, { stdio: 'pipe' });
    } catch {
      // Session might not exist, that's fine
    }
  }

  /**
   * List all tmux sessions.
   * Returns an empty array when no tmux server is running.
   */
  listSessions(): TmuxSessionInfo[] {
    try {
      const output = execSync(
        "tmux list-sessions -F '#{session_name}|#{session_created_string}|#{session_windows}|#{session_attached}'",
        { stdio: 'pipe' }
      )
        .toString()
        .trim();

      if (!output) return [];
      return output.split('\n').map((line) => {
        const [name, created, windows, attached] = line.split('|');
        return { name, created, windows, attached };
      });
    } catch {
      // No server running or no sessions
      return [];
    }
  }

  /**
   * Check whether a session with the given name currently exists.
   */
  sessionExists(sessionName: string): boolean {
    try {
      execSync(`tmux has-session -t ${shellEscape(sessionName)}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Capture the visible pane content of a tmux session.
   * Returns the captured text, or null when the session does not exist.
   */
  capturePane(sessionName: string, lines: number = 500): string | null {
    if (!this.sessionExists(sessionName)) {
      return null;
    }
    try {
      const output = execSync(`tmux capture-pane -pt ${shellEscape(sessionName)} -S -${lines}`, {
        stdio: 'pipe',
      }).toString();
      return output;
    } catch {
      return null;
    }
  }

  /**
   * Asynchronously stream pane content at regular intervals.
   * Calls onData with each captured snapshot and onEnd when the session exits.
   * Returns a stop function to cancel polling.
   */
  streamPane(
    sessionName: string,
    onData: (chunk: string) => void,
    onEnd: () => void,
    intervalMs: number = 500
  ): () => void {
    let lastContent = '';
    let stopped = false;

    const poll = (): void => {
      if (stopped) return;

      if (!this.sessionExists(sessionName)) {
        onEnd();
        return;
      }

      const content = this.capturePane(sessionName);
      if (content !== null && content !== lastContent) {
        lastContent = content;
        onData(content);
      }

      setTimeout(poll, intervalMs);
    };

    setTimeout(poll, 0);

    return (): void => {
      stopped = true;
    };
  }

  /**
   * Send a key sequence to a tmux session pane.
   */
  sendKeys(sessionName: string, keys: string): void {
    try {
      execSync(`tmux send-keys -t ${shellEscape(sessionName)} ${shellEscape(keys)} Enter`, {
        stdio: 'pipe',
      });
    } catch {
      // Session might have ended
    }
  }
}

/**
 * Minimal shell escaping: wraps value in single quotes and escapes embedded single quotes.
 * Suitable for passing arguments to tmux commands.
 */
function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
