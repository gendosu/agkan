import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { verifyWALReads } from './lib/verify-wal-reads.mjs';

const exec = promisify(execFile);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bwrap = '/usr/bin/bwrap';
assert.ok(existsSync(bwrap), 'Install bubblewrap to verify with the build source hidden');
const archive = join(root, 'dist', 'bun', 'agkan-linux-x64.tar.gz');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'agkan-binary-verify-'));
const workspace = join(scratch, 'workspace');
const binDirectory = join(scratch, 'bin');
const binary = join(scratch, 'agkan-linux-x64', 'agkan');
const boardMode = process.env.AGKAN_VERIFY_BOARD_MODE ?? 'daemon';
assert.ok(['daemon', 'foreground'].includes(boardMode), 'AGKAN_VERIFY_BOARD_MODE must be daemon or foreground');
let boardStarted = false;
let foreground;
let foregroundDiagnostics = '';
const lockProcesses = new Set();

function isolatedArgs(args) {
  return [
    '--die-with-parent',
    '--ro-bind',
    '/',
    '/',
    '--dev',
    '/dev',
    '--tmpfs',
    homedir(),
    '--bind',
    scratch,
    scratch,
    '--chdir',
    workspace,
    '--clearenv',
    '--setenv',
    'PATH',
    binDirectory,
    '--setenv',
    'TMPDIR',
    join(scratch, 'tmp'),
    '--setenv',
    'AGENT_KANBAN_DB_PATH',
    join(workspace, 'data.db'),
    '--setenv',
    'AGKAN_DATA_DIR',
    join(scratch, 'state'),
    binary,
    ...args,
  ];
}

function cli(...args) {
  return execFileSync(bwrap, isolatedArgs(args), { encoding: 'utf8', timeout: 15000 });
}

async function stopBoard() {
  if (foreground) {
    foreground.kill('SIGTERM');
    await waitFor(() => foreground.exitCode !== null || foreground.signalCode !== null, 'foreground board exit');
    foreground = undefined;
  }
  if (boardStarted) {
    cli('board', 'stop');
    boardStarted = false;
  }
}

async function startBoard(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  if (boardMode === 'foreground') {
    foreground = spawn(bwrap, isolatedArgs(['board', '--port', String(port)]), { stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [foreground.stdout, foreground.stderr]) {
      stream.on('data', (data) => {
        foregroundDiagnostics = (foregroundDiagnostics + data.toString()).slice(-16_000);
      });
    }
    await waitFor(
      () =>
        fetch(`${baseUrl}/api/version`)
          .then((res) => res.ok)
          .catch(() => false),
      'foreground board startup'
    );
  } else {
    boardStarted = true;
    cli('board', 'start', '--port', String(port));
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check, description, timeout = 5000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await check();
    if (result) return result;
    await delay(25);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}

async function json(url, options, timeout = 5000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  assert.ok(response.ok, `${response.status}: ${await response.clone().text()}`);
  return response.json();
}

async function openSocket(url) {
  const ws = new WebSocket(url, { handshakeTimeout: 5000 });
  let output = '';
  ws.on('message', (data) => {
    const text = data.toString();
    output += text;
    // xterm normally answers cursor-position queries from interactive CLIs.
    if (text.includes('\x1b[6n')) ws.send('\x1b[1;1R');
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, output: () => output };
}

async function verifySession(baseUrl, taskId, command, action, expectedCode, origin) {
  await json(`${baseUrl}/api/claude/tasks/${taskId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });
  const io = await openSocket(`${baseUrl.replace('http:', 'ws:')}/api/terminal/${taskId}/io`);
  let control;
  const logs = () => json(`${baseUrl}/api/claude/tasks/${taskId}/run-logs`);
  try {
    await waitFor(() => io.output().includes('AGKAN_PTY_READY'), 'output after initial idle period');
    assert.match(io.output(), /tty=111/);
    assert.ok(io.output().includes(`cwd=${workspace}`));
    assert.ok(io.output().includes(`task=${taskId} target=${command === 'run' ? 'done' : 'none'}`));
    const pid = Number(io.output().match(/pid=(\d+)/)[1]);
    // A first output alone used to pass even though EAGAIN immediately killed the child.
    await delay(350);
    const running = await json(`${baseUrl}/api/running-tasks`);
    assert.ok(running.tasks.some((task) => task.taskId === taskId));
    assert.equal((await logs()).logs[0].finished_at, null);
    io.ws.send('ping\r');
    await waitFor(() => io.output().includes('AGKAN_PONG_日本語'), 'interactive UTF-8 response after idle');

    control = await openSocket(`${baseUrl.replace('http:', 'ws:')}/api/terminal/${taskId}/control`);
    control.ws.send(JSON.stringify({ type: 'resize', cols: 103, rows: 31 }));
    // Separate WebSockets do not guarantee ordering; ask until the resize has taken effect.
    await waitFor(async () => {
      io.ws.send('size\r');
      await delay(25);
      return /AGKAN_SIZE=31 103/.test(io.output());
    }, 'PTY resize to 103x31');

    if (action === 'stop') {
      await json(`${baseUrl}/api/claude/tasks/${taskId}/run`, { method: 'DELETE' });
    } else {
      io.ws.send(`${action}\r`);
    }
    const log = await waitFor(async () => {
      const { logs: runs } = await logs();
      return runs[0]?.finished_at ? runs[0] : null;
    }, `persisted ${action} exit`);
    assert.equal(log.exit_code, expectedCode, JSON.stringify(log.events));
    const text = log.events.map((event) => event.text ?? '').join('');
    assert.ok(text.includes(`origin=${origin}`), text);
    if (action === 'finish') assert.ok(text.includes('AGKAN_LAST_OK'), text);
    if (action === 'fail') assert.ok(text.includes('AGKAN_LAST_FAILURE'), text);
    assert.equal(
      (await json(`${baseUrl}/api/running-tasks`)).tasks.some((task) => task.taskId === taskId),
      false
    );
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    console.log(
      `PASS ${command}: idle, TTY/env/cwd, UTF-8 input/output, resize, ${action} (exit ${expectedCode}), run log and child cleanup`
    );
  } finally {
    io.ws.terminate();
    control?.ws.terminate();
  }
}

async function verifyContention(baseUrl, { count, duration, action }) {
  const sessions = [];
  let locker;
  let watchdog;
  try {
    for (let index = 0; index < count; index++) {
      const task = JSON.parse(cli('task', 'add', `SQLite contention ${action} ${index}`, '--json')).task;
      await json(`${baseUrl}/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'planning' }),
      });
      const io = await openSocket(`${baseUrl.replace('http:', 'ws:')}/api/terminal/${task.id}/io`);
      sessions.push({ taskId: task.id, io });
      await waitFor(() => io.output().includes('AGKAN_PTY_READY'), 'contention session startup');
    }
    // Ensure output triggers the regular two-second save cycle.
    if (action !== 'finish') await delay(2100);
    locker = spawn(
      process.execPath,
      [join(root, 'tests/fixtures/sqlite-write-lock.cjs'), join(workspace, 'data.db'), String(duration)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    lockProcesses.add(locker);
    const exited = once(locker, 'exit');
    watchdog = setTimeout(() => locker.kill('SIGKILL'), 25_000);
    const [ready] = await once(locker.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.toString(), 'locked\n');
    const lockStart = performance.now();
    for (const { io } of sessions) io.ws.send(action === 'finish' ? 'finish\r' : 'probe:locked\r');
    await delay(150);
    const probeStart = performance.now();
    let httpResets = 0;
    let stopResets = 0;
    const requestDuringLock = async (path, method = 'GET') => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { Connection: 'close' },
            signal: AbortSignal.timeout(25_000),
          });
          // A reset may lose the response after DELETE has already stopped the task.
          // No session is restarted during this probe, so a repeated DELETE is safe.
          if (method === 'DELETE' && attempt > 0 && response.status === 404) return;
          assert.ok(response.ok, `${response.status}: ${await response.clone().text()}`);
          await response.json();
          return;
        } catch (error) {
          if (error.cause?.code !== 'ECONNRESET' || attempt === 2) throw error;
          if (method === 'DELETE') stopResets++;
          else httpResets++;
        }
      }
    };
    const http = requestDuringLock('/api/version').then(() => performance.now() - probeStart);
    const terminal = Promise.all(
      sessions.map(async ({ io }) => {
        if (action === 'finish') return null;
        if (action === 'output') io.ws.send('probe:during\r');
        await waitFor(
          () => io.output().includes(action === 'output' ? 'AGKAN_PROBE_during' : 'AGKAN_PROBE_locked'),
          'terminal output during lock',
          25_000
        );
        return performance.now() - lockStart;
      })
    );
    const stop =
      action === 'stop'
        ? requestDuringLock(`/api/claude/tasks/${sessions[0].taskId}/run`, 'DELETE').then(
            () => performance.now() - probeStart
          )
        : Promise.resolve(null);
    const [httpMs, terminalMs, stopMs] = await Promise.all([http, terminal, stop]);
    await exited;
    assert.equal(locker.exitCode, 0);
    clearTimeout(watchdog);
    const releasedMs = performance.now() - lockStart;
    for (const { taskId, io } of sessions) {
      const logs = () => json(`${baseUrl}/api/claude/tasks/${taskId}/run-logs`, undefined, 25_000);
      if (action === 'output') {
        await waitFor(
          async () => (await logs()).logs[0].events.some((event) => event.text?.includes('AGKAN_PROBE_locked')),
          'latest snapshot saved without further output',
          10_000
        );
        io.ws.send('finish\r');
      }
      const log = await waitFor(
        async () => {
          const { logs: runs } = await logs();
          return runs[0]?.finished_at ? runs[0] : null;
        },
        'final log saved after long lock',
        10_000
      );
      assert.equal(log.exit_code, 0);
      if (action === 'finish' || action === 'output') {
        assert.ok(log.events.some((event) => event.text?.includes('AGKAN_LAST_OK')));
      }
      const summary = log.events.at(-1).text;
      if (action === 'stop') assert.ok(summary.includes('origin=user'));
      const pid = Number(summary.match(/pid=(\d+)/)[1]);
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      assert.equal(
        (await json(`${baseUrl}/api/running-tasks`)).tasks.some((run) => run.taskId === taskId),
        false
      );
    }
    console.log(
      `PASS SQLite contention ${JSON.stringify({
        count,
        action,
        lockMs: duration,
        releaseMs: Math.round(releasedMs),
        httpMs: Math.round(httpMs),
        httpResets,
        stopResets,
        terminalMs: terminalMs.map((ms) => (ms === null ? null : Math.round(ms))),
        stopMs: stopMs === null ? null : Math.round(stopMs),
      })}: board alive, latest/final logs and child cleanup`
    );
  } finally {
    clearTimeout(watchdog);
    for (const { io } of sessions) io.ws.terminate();
    if (locker) {
      const exited = locker.exitCode !== null || locker.signalCode !== null ? Promise.resolve() : once(locker, 'exit');
      locker.kill('SIGKILL');
      await exited;
      lockProcesses.delete(locker);
    }
  }
}

async function verifyCodexTui(baseUrl) {
  mkdirSync(join(scratch, 'codex-home'));
  writeFileSync(
    join(binDirectory, 'codex'),
    '#!/bin/sh\nexport CODEX_HOME="${0%/*}/../codex-home"\nif [ "${1-}" = "--help" ]; then exec "${0%/*}/real-codex" --help; fi\nexec "${0%/*}/real-codex"\n',
    { mode: 0o755 }
  );
  const task = JSON.parse(cli('task', 'add', 'Real Codex login TUI probe', '--json')).task;
  await json(`${baseUrl}/api/claude/tasks/${task.id}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'planning' }),
  });
  const io = await openSocket(`${baseUrl.replace('http:', 'ws:')}/api/terminal/${task.id}/io`);
  let control;
  try {
    await waitFor(() => io.output().includes('ChatGPT'), 'real Codex login screen');
    await delay(350);
    assert.ok((await json(`${baseUrl}/api/running-tasks`)).tasks.some((run) => run.taskId === task.id));
    let mark = io.output().length;
    // Move the login menu selection without choosing a login method or sending a prompt.
    io.ws.send('\x1b[B');
    await waitFor(() => io.output().length > mark, 'real Codex key input response');
    control = await openSocket(`${baseUrl.replace('http:', 'ws:')}/api/terminal/${task.id}/control`);
    mark = io.output().length;
    control.ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
    await waitFor(() => io.output().length > mark, 'real Codex resize redraw');
    await json(`${baseUrl}/api/claude/tasks/${task.id}/run`, { method: 'DELETE' });
    const log = await waitFor(async () => {
      const { logs } = await json(`${baseUrl}/api/claude/tasks/${task.id}/run-logs`);
      return logs[0]?.finished_at ? logs[0] : null;
    }, 'real Codex TUI stop');
    assert.equal(log.exit_code, 0, JSON.stringify(log.events));
    const summary = log.events.at(-1).text;
    assert.ok(summary.includes('agent=codex origin=user'), summary);
    assert.throws(() => process.kill(Number(summary.match(/pid=(\d+)/)[1]), 0), { code: 'ESRCH' });
    console.log(
      'PASS real Codex login TUI: stays open, key input, resize redraw, stop and child cleanup (no login or AI request)'
    );
  } finally {
    io.ws.terminate();
    control?.ws.terminate();
  }
}

try {
  mkdirSync(workspace);
  mkdirSync(binDirectory);
  mkdirSync(join(scratch, 'tmp'));
  execFileSync('tar', ['-xzf', archive, '-C', scratch]);
  for (const utility of ['which', 'git']) symlinkSync(`/usr/bin/${utility}`, join(binDirectory, utility));
  const fakeAgent = `#!/bin/sh
if [ "\${1-}" = "--help" ]; then
  printf 'Codex CLI\\n      --approve-for-me\\n'
  exit 0
fi
/bin/sleep 0.2
# Trigger the save cycle with agent output rather than the PTY's earlier input echo.
/bin/stty -echo
tty_flags=''
for fd in 0 1 2; do
  if [ -t "$fd" ]; then tty_flags="\${tty_flags}1"; else tty_flags="\${tty_flags}0"; fi
done
printf 'AGKAN_PTY_READY pid=%s task=%s target=%s tty=%s cwd=%s\\n' "$$" "$BOARD_TASK_ID" "\${BOARD_TARGET_STATUS-none}" "$tty_flags" "$PWD"
while IFS= read -r command; do
  case "$command" in
    ping) printf 'AGKAN_PONG_日本語\\n' ;;
    size) printf 'AGKAN_SIZE='; /usr/bin/stty size ;;
    finish) printf 'AGKAN_LAST_OK\\n'; exit 0 ;;
    fail) printf 'AGKAN_LAST_FAILURE\\n'; exit 7 ;;
    signal) kill -HUP "$$" ;;
    probe:*) printf 'AGKAN_PROBE_%s\\n' "\${command#probe:}" ;;
  esac
done
`;
  for (const agent of ['claude', 'codex']) {
    writeFileSync(join(binDirectory, agent), fakeAgent, { mode: 0o755 });
  }
  writeFileSync(join(workspace, '.agkan.yml'), 'agent: codex\n');
  assert.equal(existsSync(join(binDirectory, 'node')), false);
  assert.equal(existsSync(join(binDirectory, 'bun')), false);
  assert.equal(cli('--version').trim(), version);
  assert.match(cli('--help'), /Task management/);
  console.log('PASS archive extraction, --version and --help without source, node_modules, Node or Bun on PATH');

  const created = JSON.parse(cli('task', 'add', 'Binary SQLite検証', '--status', 'ready', '--json')).task;
  assert.equal(JSON.parse(cli('task', 'get', String(created.id), '--json')).task.title, created.title);
  cli('task', 'update', String(created.id), '--body', 'persisted by standalone binary', '--json');
  assert.equal(
    JSON.parse(cli('task', 'get', String(created.id), '--json')).task.body,
    'persisted by standalone binary'
  );
  const removed = JSON.parse(cli('task', 'add', 'delete probe', '--json')).task;
  cli('task', 'delete', String(removed.id), '--json');
  console.log('PASS binary SQLite migrations and persistent task CRUD across processes');

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  await startBoard(port);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/version`)).json(), { version });
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /static\/main.js/);
  for (const [filename, contentType] of [
    ['main.js', 'javascript'],
    ['main.css', 'text/css'],
  ]) {
    const response = await fetch(`${baseUrl}/static/${filename}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').includes(contentType));
    assert.ok((await response.text()).length > 100);
  }
  const { tasks } = await (await fetch(`${baseUrl}/api/tasks?all=1`)).json();
  assert.equal(tasks.find(({ id }) => id === created.id).body, 'persisted by standalone binary');
  console.log(`PASS ${boardMode} board, HTTP API and embedded JavaScript/CSS`);

  for (const mode of ['new', 'migrate']) {
    cli('task', 'update', String(created.id), '--title', 'WAL before lock', '--json');
    if (mode === 'migrate') {
      await stopBoard();
      // Simulate an old database only after every application connection is closed.
      execFileSync(
        process.execPath,
        [
          '-e',
          `
        const assert = require('node:assert/strict');
        const Database = require('better-sqlite3');
        const db = new Database(process.argv[1]);
        const before = db.prepare('SELECT * FROM tasks ORDER BY id').all();
        assert.equal(db.pragma('journal_mode = DELETE', { simple: true }), 'delete');
        assert.deepEqual(db.prepare('SELECT * FROM tasks ORDER BY id').all(), before);
        db.close();
      `,
          join(workspace, 'data.db'),
        ],
        { cwd: root, timeout: 10_000 }
      );
      await startBoard(port); // The binary itself must migrate DELETE to WAL.
    }
    const count = JSON.parse(cli('task', 'count', '--json')).total;
    const elapsed = await verifyWALReads({
      filename: join(workspace, 'data.db'),
      baseUrl,
      count,
      taskId: created.id,
      runCount: async () =>
        (
          await exec(bwrap, isolatedArgs(['task', 'count', '--json']), {
            encoding: 'utf8',
            timeout: 5500,
          })
        ).stdout,
    });
    console.log(
      `PASS standalone ${mode} database: HTTP and CLI read in ${elapsed}ms during 7s EXCLUSIVE writer transaction`
    );
  }

  for (const [command, action, code, origin] of [
    ['planning', 'finish', 0, 'process-exit'],
    ['run', 'finish', 0, 'process-exit'],
    ['planning', 'fail', 7, 'process-exit'],
    ['planning', 'signal', 129, 'unexpected-signal'],
    ['planning', 'stop', 0, 'user'],
  ]) {
    await verifySession(baseUrl, created.id, command, action, code, origin);
  }
  await verifyContention(baseUrl, { count: 1, duration: 6250, action: 'output' });
  await verifyContention(baseUrl, { count: 1, duration: 6250, action: 'finish' });
  await verifyContention(baseUrl, { count: 1, duration: 6250, action: 'stop' });
  await verifyContention(baseUrl, { count: 2, duration: 11_000, action: 'output' });
  writeFileSync(join(workspace, '.agkan.yml'), 'agent: claude\n');
  await verifySession(baseUrl, created.id, 'planning', 'finish', 0, 'process-exit');

  if (process.env.AGKAN_VERIFY_CODEX_BIN) {
    // Only run --help: do not send a prompt, use credentials, or call an AI service.
    copyFileSync(process.env.AGKAN_VERIFY_CODEX_BIN, join(binDirectory, 'real-codex'));
    writeFileSync(join(binDirectory, 'codex'), '#!/bin/sh\nexec "${0%/*}/real-codex" --help\n', { mode: 0o755 });
    writeFileSync(join(workspace, '.agkan.yml'), 'agent: codex\n');
    const probe = JSON.parse(cli('task', 'add', 'Real Codex help probe', '--json')).task;
    await json(`${baseUrl}/api/claude/tasks/${probe.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'planning' }),
    });
    const log = await waitFor(async () => {
      const { logs } = await json(`${baseUrl}/api/claude/tasks/${probe.id}/run-logs`);
      return logs[0]?.finished_at ? logs[0] : null;
    }, 'real Codex --help exit');
    assert.equal(log.exit_code, 0, JSON.stringify(log.events));
    assert.ok(log.events.some((event) => event.text?.includes('Codex CLI')));
    console.log('PASS installed real Codex --help through planning PTY without credentials or an AI request');
    await verifyCodexTui(baseUrl);
  }

  await stopBoard();
  assert.equal(existsSync(join(workspace, '.agkan', 'board.pid')), false);
  console.log(`PASS ${boardMode} board stop and PID cleanup`);
} catch (error) {
  if (foregroundDiagnostics) console.error(foregroundDiagnostics);
  throw error;
} finally {
  for (const child of lockProcesses) child.kill('SIGKILL');
  await stopBoard();
  rmSync(scratch, { recursive: true, force: true });
}
