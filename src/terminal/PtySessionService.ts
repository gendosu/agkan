import * as pty from 'node-pty';
import { execSync } from 'child_process';
import type { StorageBackend, RunLogRow } from '../db/types/repository';
import type { RunLog, OutputEvent as ClaudeOutputEvent, CompletionConfirmCallback } from '../services/types';
import { ConflictError } from '../errors';
import { ensureBoardHookSettings } from '../hooks/claudeHookSettings';
import { buildHookEnv } from './buildHookEnv';
import { ensureSpawnHelperExecutable } from './ensureSpawnHelperExecutable';
import { AttentionStateService } from '../services/AttentionStateService';
import {
  loadConfig,
  buildPermissionArgs,
  buildCodexPermissionArgs,
  resolveAgentTool,
  type AgentTool,
} from '../db/config';

export function stripAnsi(text: string): string {
  return (
    text
      // CSI sequences: ESC [ <param bytes> <intermediate bytes> <final byte>
      .replace(/\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g, '')
      // OSC sequences: ESC ] ... BEL or ESC \ (also handles unterminated)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, '')
      // Single ESC sequences (e.g. ESC = ESC >)
      .replace(/\x1b[=>]/g, '')
      // Carriage return overwrite: collapse lines with CR to last segment
      .replace(/[^\n]*\r([^\n])/g, '$1')
  );
}

function resolveClaudePath(): string {
  try {
    return execSync('which claude', { env: process.env }).toString().trim() || 'claude';
  } catch {
    return 'claude';
  }
}

const CLAUDE_BIN = resolveClaudePath();
const CODEX_BIN = 'codex';
const DEFAULT_CODEX_MODEL = 'gpt-5.6-sol';
const PROMPT_FALLBACK_DELAY_MS = 10000;
const PROMPT_ENTER_DELAY_MS = 200;
const ENTER_RETRY_INTERVAL_MS = 2000;
const MAX_ENTER_RETRIES = 3;
// When stopProcessFromHook's screen-status guard skips termination (screen still looks
// working/blocked), the Stop hook that triggered the call fires only once per turn and may
// never fire again if this really was the session's final turn — leaving the PTY process
// leaked forever with no further signal to clean it up. Re-evaluate the screen status on a
// delay instead of trusting the single stale snapshot; a "working" screen whose output has
// been static for this many consecutive checks is treated as a stale frame and force-stopped
// (see scheduleDeferredHookStop), so a leaked session is never permanent.
const DEFERRED_HOOK_STOP_INTERVAL_MS = 3000;
const MAX_STALLED_DEFERRED_HOOK_STOP_CHECKS = 5;
const CLAUDE_BUSY_SIGNAL = 'esc to interrupt';
const MAX_SNAPSHOT_BYTES = 500_000;
const MAX_COMPLETED_SNAPSHOTS = 10;
const RECENT_SCREEN_LINE_LIMIT = 80;

type OutputEvent = { kind: 'done'; exitCode: number } | { kind: 'error'; message: string };
type SubscribeCallback = (event: OutputEvent) => void;
export type ClaudeScreenStatus = 'working' | 'blocked' | 'idle' | 'unknown';

interface SessionInfo {
  taskId: number;
  command: string;
  ptyProcess: pty.IPty;
  startedAt: Date;
  outputBuffer: string;
  totalOutputLength: number;
  exitSubscribers: Set<SubscribeCallback>;
  rawOutputSubscribers: Set<(data: string) => void>;
  outputUpdateSubscribers: Set<() => void>;
  runLogId: number | null;
  pendingPrompt: string | null;
  promptTimer: ReturnType<typeof setTimeout> | null;
  enterWatchdogTimer: ReturnType<typeof setTimeout> | null;
  deferredHookStopTimer: ReturnType<typeof setTimeout> | null;
  workspaceTrustHandled: boolean;
  lastEventsUpdate: number;
}

function hasWorkspaceTrustPrompt(text: string): boolean {
  return /trust.*folder|Do you trust/i.test(text) && /y\/n|yes.*trust/i.test(text);
}

function hasClaudeReadySignal(text: string): boolean {
  return text.includes('bypass permissions');
}

const OSC_TITLE_PATTERN = /\x1b\](?:0|2);([^\x07\x1b]*)(?:\x07|\x1b\\|$)/y;

// Returns the payload of the most recent OSC 0/2 "set title" sequence in `text`,
// or null if there is none. Only the last match is ever needed, so this walks
// backward from the end of the (up to 500KB) buffer via lastIndexOf instead of
// running a global regex (matchAll) over the entire buffer to find every match
// just to discard all but the last one.
function latestOscTitle(text: string): string | null {
  let searchEnd = text.length;
  while (searchEnd > 0) {
    const idx = text.lastIndexOf('\x1b]', searchEnd - 1);
    if (idx === -1) return null;
    OSC_TITLE_PATTERN.lastIndex = idx;
    const match = OSC_TITLE_PATTERN.exec(text);
    if (match) {
      return match[1] ?? null;
    }
    searchEnd = idx;
  }
  return null;
}

const CSI_PATTERN = /^\x1b\[([\x30-\x3F]*)([\x20-\x2F]*)([\x40-\x7E])/;
const OSC_PATTERN = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/;
const LONE_ESC_PATTERN = /^\x1b[=>]/;

interface ScreenCursor {
  row: number;
  col: number;
}

function parseCsiParam(raw: string): number | undefined {
  const value = parseInt(raw, 10);
  return Number.isNaN(value) ? undefined : value;
}

function ensureRow(lines: string[], row: number): void {
  while (lines.length <= row) lines.push('');
}

function eraseLine(lines: string[], cursor: ScreenCursor, mode: number | undefined): void {
  const line = lines[cursor.row] ?? '';
  if (mode === 1) {
    // Erase from start of line to cursor, inclusive of the cursor position.
    const eraseEnd = Math.min(cursor.col + 1, line.length);
    lines[cursor.row] = ' '.repeat(eraseEnd) + line.slice(eraseEnd);
  } else if (mode === 2) {
    // Erase entire line.
    lines[cursor.row] = '';
  } else {
    // Erase from cursor to end of line (default).
    lines[cursor.row] = line.slice(0, cursor.col);
  }
}

function eraseDisplay(lines: string[], cursor: ScreenCursor, mode: number | undefined): void {
  if (mode === 1) {
    // Erase from start of screen to cursor.
    for (let i = 0; i < cursor.row; i++) lines[i] = '';
    eraseLine(lines, cursor, 1);
  } else if (mode === 2 || mode === 3) {
    // Erase entire screen (and scrollback for mode 3, which we treat the same).
    for (let i = 0; i < lines.length; i++) lines[i] = '';
  } else {
    // Erase from cursor to end of screen (default).
    eraseLine(lines, cursor, 0);
    lines.length = cursor.row + 1;
  }
}

function applyCsiSequence(lines: string[], cursor: ScreenCursor, paramStr: string, final: string): void {
  const n = paramStr.split(';').map(parseCsiParam)[0];
  switch (final) {
    case 'A':
      cursor.row = Math.max(0, cursor.row - (n ?? 1));
      break;
    case 'B':
      cursor.row += n ?? 1;
      ensureRow(lines, cursor.row);
      break;
    case 'K':
      eraseLine(lines, cursor, n);
      break;
    case 'J':
      eraseDisplay(lines, cursor, n);
      break;
    default:
      break;
  }
}

// Consumes one escape sequence starting at `text[at]` and returns its length in
// characters (at least 1, so callers always make progress). Recognized CSI cursor
// movement (A/B) and erase (K/J) sequences are applied to the virtual screen; all
// other CSI/OSC/lone-ESC sequences are consumed with no effect, matching stripAnsi.
function consumeEscapeSequence(text: string, at: number, lines: string[], cursor: ScreenCursor): number {
  const rest = text.slice(at);

  const csiMatch = CSI_PATTERN.exec(rest);
  if (csiMatch) {
    const [full, paramStr, , final] = csiMatch;
    applyCsiSequence(lines, cursor, paramStr, final);
    return full.length;
  }

  const oscMatch = OSC_PATTERN.exec(rest);
  if (oscMatch) return oscMatch[0].length;

  const loneMatch = LONE_ESC_PATTERN.exec(rest);
  if (loneMatch) return loneMatch[0].length;

  // Unrecognized escape byte: drop it alone so we can't get stuck looping.
  return 1;
}

function writeChar(lines: string[], cursor: ScreenCursor, ch: string): void {
  ensureRow(lines, cursor.row);
  const line = lines[cursor.row];
  const padded = line.length < cursor.col ? line + ' '.repeat(cursor.col - line.length) : line;
  lines[cursor.row] = padded.slice(0, cursor.col) + ch + padded.slice(cursor.col + 1);
  cursor.col += 1;
}

// Interprets cursor-movement (CUU/CUD) and erase (EL/ED) escape sequences against a
// virtual line buffer instead of just stripping them. Claude Code's TUI redraws its
// footer in place by moving the cursor up and erasing the old line(s) rather than
// emitting a newline, so a naive strip-and-split (the old `recentScreenText`
// implementation) leaves stale, visually-erased text (e.g. "esc to interrupt")
// looking like it's still part of the "recent" screen.
function renderVisibleScreen(text: string): string {
  const lines: string[] = [''];
  const cursor: ScreenCursor = { row: 0, col: 0 };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '\x1b') {
      i += consumeEscapeSequence(text, i, lines, cursor);
      continue;
    }

    if (ch === '\r') {
      cursor.col = 0;
      i += 1;
      continue;
    }

    if (ch === '\n') {
      cursor.row += 1;
      cursor.col = 0;
      ensureRow(lines, cursor.row);
      i += 1;
      continue;
    }

    writeChar(lines, cursor, ch);
    i += 1;
  }

  return lines.join('\n');
}

function recentScreenText(text: string): string {
  return renderVisibleScreen(text).split('\n').slice(-RECENT_SCREEN_LINE_LIMIT).join('\n');
}

const BLOCKED_LINE_PATTERNS = [
  /\benter to select\b/,
  /\besc to cancel\b/,
  /\brun a dynamic workflow\b/,
  /\bdo you want to proceed\b/,
];

// A permission prompt's selection cursor also renders as "❯ 1. Yes", reusing the same
// glyph as the idle input prompt marker. Without excluding this shape, a permission UI
// with no trailing hint line (e.g. "Do you want to proceed?\n❯ 1. Yes\n  2. No") would have
// its lowest ❯-bearing line mistaken for an idle prompt instead of the selection cursor.
const SELECTION_CURSOR_LINE_PATTERN = /^\s*❯\s*\d+[.)]/;

function isBlockedLine(line: string): boolean {
  return BLOCKED_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function isIdlePromptLine(line: string): boolean {
  return line.includes('❯') && !SELECTION_CURSOR_LINE_PATTERN.test(line);
}

function findLastMatchingLineIndex(lines: string[], predicate: (line: string) => boolean): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (predicate(lines[i])) {
      return i;
    }
  }
  return -1;
}

export function detectClaudeScreenStatus(outputBuffer: string): ClaudeScreenStatus {
  const recent = recentScreenText(outputBuffer);
  const normalized = recent.toLowerCase();

  if (normalized.includes(CLAUDE_BUSY_SIGNAL)) {
    return 'working';
  }

  // Blocked words (e.g. "esc to cancel") and the idle prompt marker (❯) can both appear
  // on screen at once: an ordinary answer may mention "Press Esc to cancel" above a fresh
  // idle prompt, while a real permission UI renders its hint words below the prompt's
  // selection cursor. Rather than a fixed precedence, prefer whichever signal is on the
  // lowest (most recently rendered) line.
  const lines = normalized.split('\n');
  const blockedLineIdx = findLastMatchingLineIndex(lines, isBlockedLine);
  const idleLineIdx = findLastMatchingLineIndex(lines, isIdlePromptLine);

  if (blockedLineIdx !== -1 && blockedLineIdx >= idleLineIdx) {
    return 'blocked';
  }

  const title = latestOscTitle(outputBuffer);
  if (title && /^[\u2800-\u28ff] /.test(title)) {
    return 'working';
  }

  if (idleLineIdx !== -1) {
    return 'idle';
  }

  return 'unknown';
}

function buildAgentArgs(
  agent: AgentTool,
  config: ReturnType<typeof loadConfig>,
  prompt: string,
  model?: string,
  effort?: string,
  hookSettingsPath?: string | null
): string[] {
  if (agent === 'codex') {
    const modelArgs = ['--model', model || DEFAULT_CODEX_MODEL];
    const effortArgs = effort ? ['--config', 'model_reasoning_effort=' + JSON.stringify(effort)] : [];
    return [...modelArgs, ...effortArgs, ...buildCodexPermissionArgs(config), prompt];
  }

  const modelArgs = model ? ['--model', model] : [];
  const effortArgs = effort ? ['--effort', effort] : [];
  const settingsArgs = hookSettingsPath ? ['--settings', hookSettingsPath] : [];
  return [...settingsArgs, ...modelArgs, ...effortArgs, ...buildPermissionArgs(config)];
}

export interface PtySessionServiceOptions {
  boardApiUrl: string | null;
  attentionStateService: AttentionStateService;
  hookSettingsDataDir: string;
}

export class PtySessionService {
  private sessions: Map<number, SessionInfo> = new Map();
  private completedSnapshots: Map<number, string> = new Map();
  private db: StorageBackend | null;
  private runningTasksChangeSubscribers: Set<() => void> = new Set();
  private userStoppedTasks: Set<number> = new Set();
  private explicitUserStopTasks: Set<number> = new Set();
  private completionConfirmSubscribers: Set<CompletionConfirmCallback> = new Set();
  private boardApiUrl: string | null;
  private attentionStateService: AttentionStateService | null;
  private hookSettingsDataDir: string | null;
  private hookSettingsPath: string | null = null;

  constructor(db?: StorageBackend | null, options?: PtySessionServiceOptions) {
    this.db = db ?? null;
    this.boardApiUrl = options?.boardApiUrl ?? null;
    this.attentionStateService = options?.attentionStateService ?? null;
    this.hookSettingsDataDir = options?.hookSettingsDataDir ?? null;
    // Self-heal node-pty's spawn-helper permissions so pty.spawn() cannot fail
    // with "posix_spawnp failed." when the prebuilt binary lost its execute bit.
    ensureSpawnHelperExecutable();
  }

  setBoardApiUrl(url: string): void {
    this.boardApiUrl = url;
  }

  subscribeRunningTasksChange(callback: () => void): () => void {
    this.runningTasksChangeSubscribers.add(callback);
    return () => {
      this.runningTasksChangeSubscribers.delete(callback);
    };
  }

  subscribeCompletionConfirm(callback: CompletionConfirmCallback): () => void {
    this.completionConfirmSubscribers.add(callback);
    return () => {
      this.completionConfirmSubscribers.delete(callback);
    };
  }

  notifyCompletionConfirm(taskId: number, targetStatus: string): void {
    this.completionConfirmSubscribers.forEach((cb) => cb(taskId, targetStatus));
  }

  isUserStopped(taskId: number): boolean {
    return this.userStoppedTasks.has(taskId);
  }

  // Unlike isUserStopped(), true only for a stop that originated from the user clicking
  // Stop — not from stopProcessFromHook's normal-completion stop, which also sets
  // userStoppedTasks (see stopProcess's `origin` param). BulkRunService needs this
  // narrower signal to skip its done auto-advance only when the task is genuinely
  // incomplete, while still auto-advancing on hook-driven completion.
  isExplicitUserStop(taskId: number): boolean {
    return this.explicitUserStopTasks.has(taskId);
  }

  private notifyRunningTasksChange(): void {
    this.runningTasksChangeSubscribers.forEach((cb) => cb());
  }

  // Claude Code's TUI treats fast consecutive writes as a paste, which can absorb the
  // final '\r' as a soft newline instead of submitting when the terminal is slow to
  // render (e.g. right after startup). Watch the output for the busy signal and resend
  // '\r' until it appears or we run out of retries.
  private sendEnterWithRetry(taskId: number, info: SessionInfo): void {
    const ptyProcess = info.ptyProcess;
    // Use the monotonic total-output counter rather than an index into outputBuffer:
    // outputBuffer is truncated from the front once it exceeds MAX_SNAPSHOT_BYTES, which
    // would desync a raw string-length mark recorded before the truncation happened.
    const markLength = info.totalOutputLength;
    let attempts = 0;

    const scheduleCheck = () => {
      info.enterWatchdogTimer = setTimeout(() => {
        info.enterWatchdogTimer = null;
        if (!this.sessions.has(taskId)) return;
        const removedSoFar = info.totalOutputLength - info.outputBuffer.length;
        const sinceMarkStart = Math.max(0, markLength - removedSoFar);
        if (info.outputBuffer.slice(sinceMarkStart).includes(CLAUDE_BUSY_SIGNAL)) {
          return;
        }
        if (attempts >= MAX_ENTER_RETRIES) {
          console.error(
            `[pty][enter-watchdog] taskId=${taskId} gave up resending Enter after ${MAX_ENTER_RETRIES} retries`
          );
          return;
        }
        attempts += 1;
        ptyProcess.write('\r');
        scheduleCheck();
      }, ENTER_RETRY_INTERVAL_MS);
    };

    ptyProcess.write('\r');
    scheduleCheck();
  }

  async startProcess(taskId: number, prompt: string, command = 'run', model?: string, effort?: string): Promise<void> {
    if (this.sessions.has(taskId)) {
      throw new ConflictError(`Process for taskId ${taskId} is already running`);
    }

    const config = loadConfig();
    const agent = resolveAgentTool(config);

    // Board hooks use Claude Code's settings format and are not passed to Codex.
    if (agent === 'claude' && this.hookSettingsDataDir !== null && this.hookSettingsPath === null) {
      this.hookSettingsPath = await ensureBoardHookSettings(this.hookSettingsDataDir);
    }

    const args = buildAgentArgs(agent, config, prompt, model, effort, this.hookSettingsPath);

    const hookEnv = buildHookEnv(taskId, this.boardApiUrl, command);

    const agentBin = agent === 'codex' ? CODEX_BIN : CLAUDE_BIN;
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(agentBin, args, {
        name: 'xterm-256color',
        cols: 220,
        rows: 50,
        cwd: process.cwd(),
        env: {
          ...process.env,
          COLORTERM: 'truecolor',
          TERM: 'xterm-256color',
          ...hookEnv,
        },
      });
    } catch (e) {
      console.error(
        `[pty][spawn-error] taskId=${taskId} command=${command} agent=${agent} bin=${agentBin} error=${e instanceof Error ? e.message : String(e)}`
      );
      throw e;
    }

    const info: SessionInfo = {
      taskId,
      command,
      ptyProcess,
      startedAt: new Date(),
      outputBuffer: '',
      totalOutputLength: 0,
      exitSubscribers: new Set(),
      rawOutputSubscribers: new Set(),
      outputUpdateSubscribers: new Set(),
      runLogId: null,
      pendingPrompt: agent === 'claude' ? prompt : null,
      promptTimer: null,
      enterWatchdogTimer: null,
      deferredHookStopTimer: null,
      workspaceTrustHandled: false,
      lastEventsUpdate: 0,
    };

    this.sessions.set(taskId, info);
    this.notifyRunningTasksChange();

    if (this.db) {
      info.runLogId = this.db.runLogs.create(taskId, info.startedAt.toISOString());
    }

    // Claude starts without a positional prompt, so inject it once the TUI is
    // ready. Codex receives the prompt as its final CLI argument.
    // Fallback: send prompt if ready signal never detected within timeout.
    if (agent === 'claude') {
      info.promptTimer = setTimeout(() => {
        info.promptTimer = null;
        if (info.pendingPrompt !== null && this.sessions.has(taskId)) {
          const fallbackPrompt = info.pendingPrompt;
          info.pendingPrompt = null;
          ptyProcess.write(fallbackPrompt);
          setTimeout(() => {
            if (this.sessions.has(taskId)) {
              this.sendEnterWithRetry(taskId, info);
            }
          }, PROMPT_ENTER_DELAY_MS);
        }
      }, PROMPT_FALLBACK_DELAY_MS);
    }

    ptyProcess.onData((data: string) => {
      info.outputBuffer += data;
      info.totalOutputLength += data.length;
      if (info.outputBuffer.length > MAX_SNAPSHOT_BYTES) {
        info.outputBuffer = info.outputBuffer.slice(-MAX_SNAPSHOT_BYTES);
      }

      // Auto-confirm workspace trust
      if (!info.workspaceTrustHandled && hasWorkspaceTrustPrompt(info.outputBuffer)) {
        info.workspaceTrustHandled = true;
        ptyProcess.write('y\r');
      }

      // Send pending prompt as soon as Claude's input prompt is ready.
      // Delay slightly to ensure the interactive input line is fully initialized
      // before writing — the ready signal fires before the prompt cursor appears.
      if (info.pendingPrompt !== null && hasClaudeReadySignal(info.outputBuffer)) {
        if (info.promptTimer !== null) {
          clearTimeout(info.promptTimer);
          info.promptTimer = null;
        }
        const prompt = info.pendingPrompt;
        info.pendingPrompt = null;
        setTimeout(() => {
          if (this.sessions.has(taskId)) {
            ptyProcess.write(prompt);
            setTimeout(() => {
              if (this.sessions.has(taskId)) {
                this.sendEnterWithRetry(taskId, info);
              }
            }, PROMPT_ENTER_DELAY_MS);
          }
        }, 500);
      }

      info.rawOutputSubscribers.forEach((cb) => cb(data));

      // Throttle: persist current output snapshot as events every 2 seconds
      const now = Date.now();
      if (this.db && info.runLogId && now - info.lastEventsUpdate > 2000) {
        info.lastEventsUpdate = now;
        const cleanText = stripAnsi(info.outputBuffer);
        this.db.runLogs.updateEvents(info.runLogId, JSON.stringify([{ kind: 'text', text: cleanText }]));
        info.outputUpdateSubscribers.forEach((cb) => cb());
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      const code = exitCode ?? 0;

      if (info.promptTimer !== null) {
        clearTimeout(info.promptTimer);
        info.promptTimer = null;
      }
      if (info.enterWatchdogTimer !== null) {
        clearTimeout(info.enterWatchdogTimer);
        info.enterWatchdogTimer = null;
      }
      if (info.deferredHookStopTimer !== null) {
        clearTimeout(info.deferredHookStopTimer);
        info.deferredHookStopTimer = null;
      }
      info.pendingPrompt = null;

      if (this.db && info.runLogId) {
        const finishedAt = new Date().toISOString();
        const cleanText = stripAnsi(info.outputBuffer);
        const events = JSON.stringify([{ kind: 'text', text: cleanText }]);
        this.db.runLogs.updateFinished(info.runLogId, finishedAt, code, events);
        const ids = this.db.runLogs.findIdsByTaskId(taskId);
        if (ids.length > 5) {
          this.db.runLogs.deleteMany(ids.slice(5));
        }
      }

      this.completedSnapshots.set(taskId, info.outputBuffer);
      if (this.completedSnapshots.size > MAX_COMPLETED_SNAPSHOTS) {
        const firstKey = this.completedSnapshots.keys().next().value!;
        this.completedSnapshots.delete(firstKey);
      }

      info.outputUpdateSubscribers.forEach((cb) => cb());
      info.outputUpdateSubscribers.clear();

      const doneEvent: OutputEvent = { kind: 'done', exitCode: code };
      info.exitSubscribers.forEach((cb) => cb(doneEvent));

      this.attentionStateService?.clearTask(taskId);

      if (this.sessions.get(taskId) === info) {
        this.sessions.delete(taskId);
        this.notifyRunningTasksChange();
      }
      this.userStoppedTasks.delete(taskId);
      this.explicitUserStopTasks.delete(taskId);
    });
  }

  stopProcess(taskId: number, origin: 'user' | 'hook' = 'user'): boolean {
    const info = this.sessions.get(taskId);
    if (!info) return false;
    if (info.promptTimer !== null) {
      clearTimeout(info.promptTimer);
      info.promptTimer = null;
    }
    if (info.enterWatchdogTimer !== null) {
      clearTimeout(info.enterWatchdogTimer);
      info.enterWatchdogTimer = null;
    }
    if (info.deferredHookStopTimer !== null) {
      clearTimeout(info.deferredHookStopTimer);
      info.deferredHookStopTimer = null;
    }
    info.pendingPrompt = null;
    // Mark as user-stopped before emitting so synchronous subscribers (e.g. boardRoutes.ts)
    // observe isUserStopped() === true and skip auto-advancing status on this done event.
    // This fires for both origins (user and hook) — that part of the contract is unchanged.
    this.userStoppedTasks.add(taskId);
    if (origin === 'user') {
      this.explicitUserStopTasks.add(taskId);
    }
    // Notify subscribers before clearing so they can advance (e.g. BulkRunService.runNext()).
    const doneEvent: OutputEvent = { kind: 'done', exitCode: 0 };
    info.exitSubscribers.forEach((cb) => cb(doneEvent));
    info.exitSubscribers.clear();
    info.ptyProcess.kill();
    this.sessions.delete(taskId);
    this.attentionStateService?.clearTask(taskId);
    this.notifyRunningTasksChange();
    return true;
  }

  stopProcessFromHook(taskId: number): boolean {
    const info = this.sessions.get(taskId);
    if (!info) return false;

    const status = detectClaudeScreenStatus(info.outputBuffer);
    if (status === 'working' || status === 'blocked') {
      console.error(`[pty][hook-stop-guard] taskId=${taskId} skipped stopProcess because Claude screen is ${status}`);
      this.scheduleDeferredHookStop(taskId, info, 0, info.outputBuffer);
      return false;
    }

    return this.stopProcess(taskId, 'hook');
  }

  // Re-evaluates the screen-status guard after a delay instead of trusting the single stale
  // snapshot taken during stopProcessFromHook. This is not an immediate retry (which would
  // observe the same unchanged outputBuffer and reach the same wrong conclusion) — by the
  // time the timer fires, the render has often settled to idle/unknown, in which case we
  // stop right away.
  //
  // If the screen still looks working/blocked, compare the buffer against the snapshot taken
  // at the last check: while output keeps changing, this is genuine in-flight work, so we
  // keep re-evaluating indefinitely and never force-stop it. Only once output has been
  // completely static for MAX_STALLED_DEFERRED_HOOK_STOP_CHECKS consecutive re-evaluations
  // while the screen claims "working" do we force-stop — a working screen with zero output
  // for that long is a stale frame (genuine work always animates the spinner or streams
  // tokens), which means the process is almost certainly a leaked PTY. A `blocked` screen is
  // never force-stopped this way: a permission prompt is legitimately static while it waits
  // for the user, so it just keeps being re-evaluated until it clears (the timer is cleaned
  // up on stopProcess/natural exit regardless).
  private scheduleDeferredHookStop(taskId: number, info: SessionInfo, stalledChecks: number, lastBuffer: string): void {
    if (info.deferredHookStopTimer !== null) {
      // A re-evaluation is already pending for this session; do not stack another one on
      // top of it just because another Stop-hook call skipped again in the meantime.
      return;
    }

    info.deferredHookStopTimer = setTimeout(() => {
      info.deferredHookStopTimer = null;
      // The session may have exited (and a new one for the same taskId started) between
      // scheduling and firing; only act if this exact session is still the live one.
      if (this.sessions.get(taskId) !== info) return;

      const status = detectClaudeScreenStatus(info.outputBuffer);
      if (status !== 'working' && status !== 'blocked') {
        console.error(
          `[pty][hook-stop-guard] taskId=${taskId} deferred re-evaluation found screen ${status}; stopping now`
        );
        this.stopProcess(taskId, 'hook');
        return;
      }

      if (info.outputBuffer !== lastBuffer) {
        // Output is still flowing: genuine in-flight work, so reset the stall counter and
        // keep watching rather than ever force-stopping it.
        this.scheduleDeferredHookStop(taskId, info, 0, info.outputBuffer);
        return;
      }

      const next = stalledChecks + 1;
      if (status === 'working' && next >= MAX_STALLED_DEFERRED_HOOK_STOP_CHECKS) {
        console.error(
          `[pty][hook-stop-guard] taskId=${taskId} still working but stalled with no output after ${MAX_STALLED_DEFERRED_HOOK_STOP_CHECKS} consecutive checks; force-stopping to avoid a leaked session`
        );
        // Default origin ('user') is intentional here: the screen still claims "working",
        // so this is a leaked session being force-killed, not a genuine completion — the
        // task is not done, so BulkRunService must not auto-advance it on this event either.
        this.stopProcess(taskId);
        return;
      }

      this.scheduleDeferredHookStop(taskId, info, next, lastBuffer);
    }, DEFERRED_HOOK_STOP_INTERVAL_MS);
  }

  listRunningTasks(): { taskId: number; command: string }[] {
    return Array.from(this.sessions.values()).map((s) => ({ taskId: s.taskId, command: s.command }));
  }

  getSnapshot(taskId: number): string {
    return this.sessions.get(taskId)?.outputBuffer ?? this.completedSnapshots.get(taskId) ?? '';
  }

  subscribeOutput(taskId: number, callback: SubscribeCallback): () => void {
    const info = this.sessions.get(taskId);
    if (!info) {
      if (this.db) {
        const row = this.db.runLogs.findLatestByTaskId(taskId);
        if (row) {
          callback({ kind: 'done', exitCode: row.exit_code ?? 0 });
          return () => {};
        }
      }
      // Session not found and no run log: process may have exited before subscription.
      // Notify caller immediately so the caller can advance to the next action.
      callback({ kind: 'error', message: `No session or run log found for taskId ${taskId}` });
      return () => {};
    }
    info.exitSubscribers.add(callback);
    return () => {
      info.exitSubscribers.delete(callback);
    };
  }

  subscribeOutputUpdate(taskId: number, callback: () => void): () => void {
    const info = this.sessions.get(taskId);
    if (!info) {
      if (this.db) {
        const row = this.db.runLogs.findLatestByTaskId(taskId);
        if (row?.finished_at) {
          callback();
          return () => {};
        }
      }
      return () => {};
    }
    info.outputUpdateSubscribers.add(callback);
    return () => {
      info.outputUpdateSubscribers.delete(callback);
    };
  }

  subscribeRawOutput(taskId: number, callback: (data: string) => void): () => void {
    const info = this.sessions.get(taskId);
    if (!info) return () => {};
    info.rawOutputSubscribers.add(callback);
    return () => {
      info.rawOutputSubscribers.delete(callback);
    };
  }

  resize(taskId: number, cols: number, rows: number): void {
    this.sessions.get(taskId)?.ptyProcess.resize(cols, rows);
  }

  writeInput(taskId: number, data: string): void {
    this.sessions.get(taskId)?.ptyProcess.write(data);
  }

  getRunLogs(taskId: number): RunLog[] {
    if (!this.db) return [];
    const rows = this.db.runLogs.findByTaskId(taskId, 5);
    return rows.map((r: RunLogRow) => ({
      id: r.id,
      task_id: r.task_id,
      started_at: r.started_at,
      finished_at: r.finished_at,
      exit_code: r.exit_code,
      session_id: r.session_id,
      events: JSON.parse(r.events) as ClaudeOutputEvent[],
    }));
  }
}
