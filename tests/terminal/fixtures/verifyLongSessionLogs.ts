import assert from 'node:assert/strict';
import { PtySessionService } from '../../../src/terminal/PtySessionService';
import { emitData, emitExit } from './ptyTestDouble';

type Event = { kind: string; text: string };

export async function verifyLongSessionLogs(): Promise<void> {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    for (const agent of ['codex', 'claude'] as const) {
      const saves: Event[][] = [];
      const finished: { at: string; code: number; events: Event[] }[] = [];
      const db = {
        runLogs: {
          create: () => 42,
          updateEvents: (_id: number, events: string) => saves.push(JSON.parse(events)),
          updateFinished: (_id: number, at: string, code: number, events: string) => {
            finished.push({ at, code, events: JSON.parse(events) });
          },
          findIdsByTaskId: () => [42],
        },
      };
      const service = new PtySessionService(db as never);
      await service.startProcess(1, 'prompt', 'run', undefined, undefined, agent);
      const rawOutput: string[] = [];
      const exited: unknown[] = [];
      let updates = 0;
      service.subscribeRawOutput(1, (data) => rawOutput.push(data));
      service.subscribeOutputUpdate(1, () => updates++);
      service.subscribeOutput(1, (event) => exited.push(event));

      const chunk = '\x1b[1A\x1b[2Kx'.repeat(40_000);
      emitData(chunk);
      assert.deepEqual(saves[0], [{ kind: 'text', text: 'x'.repeat(40_000) }]);
      assert.equal(updates, 1);

      // Advance the save clock and exceed the 500,000-character raw buffer.
      now += 2001;
      emitData(chunk);
      const retained = (chunk + chunk).slice(-500_000);
      const retainedText = retained.replace(/\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g, '');
      assert.equal(service.getSnapshot(1), retained);
      assert.deepEqual(saves[1], [{ kind: 'text', text: retainedText }]);

      now += 2001;
      const overwrite = '\rold\r' + 'y'.repeat(100_000) + '\r\n';
      emitData(overwrite);
      assert.equal(saves.length, 3);
      assert.deepEqual(saves[2], [{ kind: 'text', text: 'y'.repeat(100_000) + '\r\n' }]);
      assert.deepEqual(rawOutput, [chunk, chunk, overwrite]);

      const tail = 'z'.repeat(500_000);
      emitData(tail);
      assert.equal(saves.length, 3);
      emitExit();
      assert.equal(finished.length, 1);
      assert.equal(finished[0].code, 0);
      assert.ok(Number.isFinite(Date.parse(finished[0].at)));
      assert.deepEqual(finished[0].events[0], { kind: 'text', text: tail });
      assert.ok(finished[0].events[1].text.includes(`agent=${agent} origin=process-exit`));
      assert.equal(rawOutput.at(-1), tail);
      assert.equal(updates, 4);
      assert.deepEqual(exited, [{ kind: 'done', exitCode: 0 }]);
      assert.equal(service.getSnapshot(1), tail);
    }
  } finally {
    Date.now = originalNow;
  }
}
