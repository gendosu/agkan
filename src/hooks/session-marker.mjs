// Resolves the main-session marker file path shared by hook-session-start.mjs,
// hook-stop.mjs, and hook-attention.mjs. BOARD_SESSION_MARKER_FILE lets callers
// (tests) redirect this to an isolated path instead of the real /tmp location.
export function getSessionMarkerPath(taskId) {
  return process.env.BOARD_SESSION_MARKER_FILE || `/tmp/board-main-session-${taskId}`;
}
