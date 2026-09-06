import { resolve } from 'path';

const CODEX_NOTIFY_HOOK = resolve(__dirname, 'hook-codex-notify.mjs');

/**
 * Codex CLI args that register the Board's turn-completion hook via Codex's `notify`
 * setting. `--config` values are parsed as TOML, and JSON.stringify of a string[] is a
 * valid TOML array literal, so the command is passed as a single `key=value` argument.
 */
export function buildCodexNotifyArgs(): string[] {
  return ['--config', 'notify=' + JSON.stringify(['node', CODEX_NOTIFY_HOOK])];
}
