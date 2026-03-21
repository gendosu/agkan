import { execSync } from 'child_process';

export interface TmuxSessionInfo {
  name: string;
  created: string;
  windows: string;
  attached: string;
}

/**
 * Service for managing tmux sessions.
 * Provides session lifecycle management and stdout capture via capture-pane.
 */
export class TmuxService {
  /**
   * Start a new tmux session running the given command.
   * Throws if a session with the same name already exists (double-start prevention).
   */
  startSession(sessionName: string, command: string): void {
    if (this.sessionExists(sessionName)) {
      throw new Error(`Session '${sessionName}' already exists`);
    }
    execSync(`tmux new-session -d -s ${shellEscape(sessionName)} '${shellEscape(command)}'`, { stdio: 'pipe' });
  }

  /**
   * Kill an existing tmux session.
   */
  killSession(sessionName: string): void {
    execSync(`tmux kill-session -t ${shellEscape(sessionName)}`, { stdio: 'pipe' });
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
    execSync(`tmux send-keys -t ${shellEscape(sessionName)} ${shellEscape(keys)} Enter`, {
      stdio: 'pipe',
    });
  }
}

/**
 * Minimal shell escaping: wraps value in single quotes and escapes embedded single quotes.
 * Suitable for passing arguments to tmux commands.
 */
function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
