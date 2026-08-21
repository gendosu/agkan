import { Hono } from 'hono';
import { BulkRunService, BulkRunCommand } from '../BulkRunService';

export function registerBulkRunRoutes(app: Hono, bulkRunService: BulkRunService): void {
  app.post('/api/claude/bulk-run', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { command?: string };
    const command: BulkRunCommand = body.command === 'pr' ? 'pr' : 'direct';
    const result = await bulkRunService.start(command);
    if (result.error) {
      return c.json({ error: result.error }, 409);
    }
    return c.json({ started: true });
  });

  app.post('/api/claude/bulk-run/stop', (c) => {
    bulkRunService.stop();
    return c.json({ stopped: true });
  });

  app.get('/api/claude/bulk-run/stream', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        let finalized = false;

        const encode = (event: string, data: unknown): Uint8Array => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          return new TextEncoder().encode(payload);
        };

        const safeClose = () => {
          if (finalized) return;
          finalized = true;
          unsub();
          controller.close();
        };

        const sendUpdate = (status: ReturnType<BulkRunService['getStatus']>) => {
          if (finalized) return;
          try {
            controller.enqueue(encode('update', status));
          } catch {
            safeClose();
          }
        };

        const unsub = bulkRunService.subscribeStateChange(sendUpdate);

        try {
          controller.enqueue(encode('update', bulkRunService.getStatus()));
        } catch {
          safeClose();
          return;
        }

        c.req.raw.signal?.addEventListener('abort', () => {
          safeClose();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  });
}
