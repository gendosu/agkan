// Board hook subprocess tests spawn the real hook scripts with `{ ...process.env, ...env }`.
// When these tests run inside an actual Board session, the parent process already has
// BOARD_TASK_ID / BOARD_API_URL / BOARD_HOOK_TOKEN / BOARD_TARGET_STATUS set for that real
// session, and a test that omits one of these keys from its override would silently inherit
// the parent's real value instead of being unset — contaminating the real
// /tmp/board-main-session-<taskId> marker file and producing false pass/fail results.
const BOARD_ENV_KEYS = [
  'BOARD_TASK_ID',
  'BOARD_API_URL',
  'BOARD_HOOK_TOKEN',
  'BOARD_TARGET_STATUS',
  'BOARD_SESSION_MARKER_FILE',
] as const;

export function buildHookEnv(overrides: Record<string, string>): Record<string, string | undefined> {
  const env = { ...process.env };
  for (const key of BOARD_ENV_KEYS) delete env[key];
  return { ...env, ...overrides };
}
