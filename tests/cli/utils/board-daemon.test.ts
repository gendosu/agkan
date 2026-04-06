/**
 * Tests for board-daemon utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';

vi.mock('fs');
vi.mock('child_process');
vi.mock('../../../src/db/config', () => ({
  getDefaultDirName: vi.fn(() => '.agkan-test'),
}));

import fs from 'fs';
import { spawn } from 'child_process';
import {
  getPidFilePath,
  readBoardPid,
  isBoardRunning,
  spawnBoardDaemon,
  killBoardProcess,
  removePidFile,
} from '../../../src/cli/utils/board-daemon';

const mockFs = vi.mocked(fs);
const mockSpawn = vi.mocked(spawn);

describe('board-daemon', () => {
  const expectedPidFile = path.join(process.cwd(), '.agkan-test', 'board.pid');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPidFilePath', () => {
    it('returns path inside default dir', () => {
      expect(getPidFilePath()).toBe(expectedPidFile);
    });
  });

  describe('readBoardPid', () => {
    it('returns null when PID file does not exist', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);
      expect(readBoardPid()).toBeNull();
    });

    it('returns PID number from file', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('12345\n');
      expect(readBoardPid()).toBe(12345);
    });

    it('returns null for non-numeric content', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('not-a-pid');
      expect(readBoardPid()).toBeNull();
    });
  });

  describe('isBoardRunning', () => {
    it('returns false when PID file does not exist', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);
      expect(isBoardRunning()).toBe(false);
    });

    it('returns true when process is running', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('12345');
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      expect(isBoardRunning()).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(12345, 0);
      killSpy.mockRestore();
    });

    it('returns false when process is not running', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('99999');
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });
      expect(isBoardRunning()).toBe(false);
      killSpy.mockRestore();
    });
  });

  describe('removePidFile', () => {
    it('removes PID file if it exists', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.unlinkSync = vi.fn();
      removePidFile();
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expectedPidFile);
    });

    it('does nothing when PID file does not exist', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);
      mockFs.unlinkSync = vi.fn();
      removePidFile();
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('spawnBoardDaemon', () => {
    it('spawns a detached process with board args and returns PID', () => {
      const fakePid = 42000;
      const fakeChild = { pid: fakePid, unref: vi.fn() };
      mockSpawn.mockReturnValue(fakeChild as never);
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.writeFileSync = vi.fn();
      mockFs.mkdirSync = vi.fn();

      const pid = spawnBoardDaemon(['--port', '8080']);

      expect(pid).toBe(fakePid);
      expect(mockSpawn).toHaveBeenCalledWith(
        process.argv[0],
        [process.argv[1], 'board', '--port', '8080'],
        expect.objectContaining({ detached: true, stdio: 'ignore' })
      );
      expect(fakeChild.unref).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(expectedPidFile, String(fakePid), {
        encoding: 'utf8',
        mode: 0o600,
      });
    });
  });

  describe('killBoardProcess', () => {
    it('returns false when no PID file', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);
      expect(killBoardProcess()).toBe(false);
    });

    it('kills process, removes PID file, and returns true', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('12345');
      mockFs.unlinkSync = vi.fn();
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      expect(killBoardProcess()).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expectedPidFile);
      killSpy.mockRestore();
    });

    it('removes stale PID file and returns false when process does not exist', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(true);
      mockFs.readFileSync = vi.fn().mockReturnValue('99999');
      mockFs.unlinkSync = vi.fn();
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(killBoardProcess()).toBe(false);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expectedPidFile);
      killSpy.mockRestore();
    });
  });
});
