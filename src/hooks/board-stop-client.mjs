// Board API calls shared by the session-stop hooks (hook-stop.mjs for Claude Code,
// hook-codex-notify.mjs for Codex). Both hooks must agree on what "target status
// reached" means and on the /hooks/stop request contract, so that lives here once.

// Fetches the current task status from the board and checks whether it has reached the
// run's target status. Reached = current status matches target, or has advanced to a
// terminal status (review/done/closed) — review means a PR was created and the agent's
// work has been handed off, which is a valid completion signal even for run/direct
// sessions whose target is 'done'. On fetch failure or non-200, returns false so the
// caller falls through to its normal guard checks instead of overriding them.
export async function isTargetStatusReached(apiUrl, token, taskId, targetStatus, logPrefix) {
  try {
    const res = await fetch(`${apiUrl}/api/internal/tasks/${taskId}/status`, {
      method: 'GET',
      headers: { 'x-hook-token': token },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const status = data && data.status;
    return status === targetStatus || status === 'review' || status === 'done' || status === 'closed';
  } catch (err) {
    process.stderr.write(`${logPrefix}: status check failed: ${(err && err.message) || err}\n`);
    return false;
  }
}

// POSTs the completion to the board. Never throws; failures are logged to stderr.
export async function postStopComplete(apiUrl, token, taskId, logPrefix) {
  try {
    const res = await fetch(`${apiUrl}/api/internal/hooks/stop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hook-token': token,
      },
      body: JSON.stringify({ taskId, reason: 'complete' }),
    });
    if (!res.ok) {
      process.stderr.write(`${logPrefix}: API responded ${res.status}\n`);
    } else {
      // A 200 response can still carry ok:false when the server's screen-status guard
      // skipped termination. This is not retried here — the server itself schedules a
      // delayed re-evaluation and guarantees eventual termination — but it is logged so
      // guard-skip cases are observable instead of silently looking identical to success.
      const data = await res.json().catch(() => null);
      if (data && data.ok === false) {
        process.stderr.write(`${logPrefix}: server skipped stop (reason=${data.reason ?? 'unknown'})\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`${logPrefix}: ${(err && err.message) || err}\n`);
  }
}
