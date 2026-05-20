import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/db/config', () => ({
  loadConfig: vi.fn(() => ({})),
}));

import { notifyBoard } from '../../../src/cli/utils/boardNotify';
import { loadConfig } from '../../../src/db/config';

describe('notifyBoard', () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockReturnValue({} as ReturnType<typeof loadConfig>);
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
  });

  it('sends POST to default port 8080', async () => {
    await notifyBoard();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/board/notify', { method: 'POST' });
  });

  it('uses configured board port', async () => {
    vi.mocked(loadConfig).mockReturnValue({ board: { port: 9090 } } as ReturnType<typeof loadConfig>);
    await notifyBoard();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:9090/api/board/notify', { method: 'POST' });
  });

  it('does not throw when board is not running', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(notifyBoard()).resolves.toBeUndefined();
  });

  it('does not throw on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(notifyBoard()).resolves.toBeUndefined();
  });
});
