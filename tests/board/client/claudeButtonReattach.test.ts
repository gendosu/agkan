/**
 * @vitest-environment jsdom
 *
 * Tests for the "reattach terminal on new session" behavior in claudeButton.
 * The claudeTerminalModal module is mocked so we can control which task is
 * currently displayed and assert on the reattach call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { terminalModule } = vi.hoisted(() => {
  const terminalModule = {
    attachTerminalToTab: vi.fn(),
    detachTerminal: vi.fn(),
    getCurrentTerminalTaskId: vi.fn(() => null as number | null),
    reattachTerminalForNewSession: vi.fn(),
  };
  return { terminalModule };
});

vi.mock('../../../src/board/client/claudeTerminalModal', () => terminalModule);

import { updateButtonStates } from '../../../src/board/client/claudeButton';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  terminalModule.getCurrentTerminalTaskId.mockReturnValue(null);
  // Reset the module-level running set to empty.
  updateButtonStates(new Set());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reattach on new session', () => {
  it('reattaches when the displayed terminal task enters the running set', () => {
    terminalModule.getCurrentTerminalTaskId.mockReturnValue(5);
    updateButtonStates(new Set([5]));
    expect(terminalModule.reattachTerminalForNewSession).toHaveBeenCalledWith(5);
  });

  it('does not reattach when a different task enters the running set', () => {
    terminalModule.getCurrentTerminalTaskId.mockReturnValue(5);
    updateButtonStates(new Set([99]));
    expect(terminalModule.reattachTerminalForNewSession).not.toHaveBeenCalled();
  });

  it('does not reattach when no terminal task is displayed', () => {
    terminalModule.getCurrentTerminalTaskId.mockReturnValue(null);
    updateButtonStates(new Set([5]));
    expect(terminalModule.reattachTerminalForNewSession).not.toHaveBeenCalled();
  });

  it('does not reattach again when the displayed task was already running', () => {
    terminalModule.getCurrentTerminalTaskId.mockReturnValue(5);
    updateButtonStates(new Set([5])); // first start → reattach fires
    terminalModule.reattachTerminalForNewSession.mockClear();
    updateButtonStates(new Set([5])); // still running → must NOT reattach again
    expect(terminalModule.reattachTerminalForNewSession).not.toHaveBeenCalled();
  });

  it('still detaches when the displayed task leaves the running set', () => {
    terminalModule.getCurrentTerminalTaskId.mockReturnValue(5);
    updateButtonStates(new Set([5]));
    terminalModule.detachTerminal.mockClear();
    updateButtonStates(new Set()); // task 5 stopped
    expect(terminalModule.detachTerminal).toHaveBeenCalled();
  });

  it('reattaches again when the displayed task stops and then starts a new session', () => {
    terminalModule.getCurrentTerminalTaskId.mockReturnValue(5);
    updateButtonStates(new Set([5])); // first start → reattach fires
    updateButtonStates(new Set()); // task 5 stopped
    terminalModule.reattachTerminalForNewSession.mockClear();
    updateButtonStates(new Set([5])); // second start → reattach must fire again
    expect(terminalModule.reattachTerminalForNewSession).toHaveBeenCalledWith(5);
  });
});
