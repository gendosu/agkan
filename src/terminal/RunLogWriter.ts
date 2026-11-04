import type { RunLogRepository } from '../db/types/repository';

const SAVE_INTERVAL_MS = 2000;
const RETRY_DELAYS_MS = [250, 1000];

export function logRunLogError(
  taskId: number,
  runLogId: number | null,
  operation: string,
  error: unknown,
  attempt = 1,
  outcome = 'failed'
): void {
  const { code, errno } = sqliteErrorMetadata(error);
  console.error(
    `[pty][run-log] taskId=${taskId} runLogId=${runLogId} operation=${operation} code=${code} errno=${errno} attempt=${attempt} outcome=${outcome}`
  );
}

function sqliteErrorMetadata(error: unknown): { code: string; errno: number | null } {
  const value = error as { code?: unknown; errno?: unknown } | null;
  return {
    code: typeof value?.code === 'string' && /^SQLITE_[A-Z_]+$/.test(value.code) ? value.code : 'unknown',
    errno: typeof value?.errno === 'number' ? value.errno : null,
  };
}

function isBusy(error: unknown): boolean {
  const { code, errno } = sqliteErrorMetadata(error);
  return code === 'SQLITE_BUSY' || code.startsWith('SQLITE_BUSY_') || (errno !== null && (errno & 255) === 5);
}

/** One bounded save cycle per run; snapshots are read at the time of each attempt. */
export class RunLogWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastAttemptAt = -Infinity;
  private lastSavedAt = -Infinity;
  private attempt = 0;
  private ended = false;
  private cancelled = false;
  private paused = false;
  private final: { finishedAt: string; exitCode: number; events: string } | null = null;

  constructor(
    readonly taskId: number,
    readonly runLogId: number,
    private repository: Pick<RunLogRepository, 'updateEvents' | 'updateFinished'>,
    private snapshot: () => string,
    private onSaved: () => void,
    private onFinished: (saved: boolean) => void
  ) {}

  update(): void {
    if (this.ended || this.cancelled || this.paused || this.timer !== null) return;
    const now = Date.now();
    if (now - Math.max(this.lastAttemptAt, this.lastSavedAt) <= SAVE_INTERVAL_MS) return;
    this.attempt = 0;
    this.save();
  }

  finish(finishedAt: string, exitCode: number, events: string): void {
    if (this.ended || this.cancelled) return;
    this.clearTimer();
    this.ended = true;
    this.final = { finishedAt, exitCode, events };
    this.attempt = 0;
    this.save();
  }

  cancel(): void {
    this.cancelled = true;
    this.clearTimer();
  }

  pause(): void {
    this.paused = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private save(): void {
    if (this.cancelled) return;
    this.lastAttemptAt = Date.now();
    this.attempt++;
    const operation = this.final ? 'updateFinished' : 'updateEvents';
    try {
      if (this.final) {
        const { finishedAt, exitCode, events } = this.final;
        this.repository.updateFinished(this.runLogId, finishedAt, exitCode, events);
      } else {
        this.repository.updateEvents(this.runLogId, this.snapshot());
      }
    } catch (error) {
      // A synchronous SQLite call may itself consume the entire busy timeout.
      // Start the output cooldown when the failed attempt returns.
      this.lastAttemptAt = Date.now();
      const delay = RETRY_DELAYS_MS[this.attempt - 1];
      const retry = isBusy(error) && delay !== undefined;
      logRunLogError(
        this.taskId,
        this.runLogId,
        operation,
        error,
        this.attempt,
        retry ? 'retry' : isBusy(error) ? 'exhausted' : 'non-retryable'
      );
      if (retry) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.save();
        }, delay);
      } else if (this.final) {
        this.onFinished(false);
      }
      return;
    }
    this.lastSavedAt = Date.now();
    if (this.attempt > 1) {
      logRunLogError(this.taskId, this.runLogId, operation, null, this.attempt, 'recovered');
    }
    this.onSaved();
    if (this.final) this.onFinished(true);
  }
}
