import { describe, it, expect, vi } from 'vitest';
import { createTerminalWsServer } from '../../src/terminal/wsTerminalServer';

// Minimal mock PtySessionService for interface check
const mockService = {
  getSnapshot: vi.fn(() => 'snapshot data'),
  subscribeRawOutput: vi.fn(() => vi.fn()),
  writeInput: vi.fn(),
  resize: vi.fn(),
};

describe('createTerminalWsServer', () => {
  it('exports a handleUpgrade function', () => {
    const server = createTerminalWsServer(mockService as never);
    expect(typeof server.handleUpgrade).toBe('function');
  });
});
