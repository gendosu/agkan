import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunLogWriter } from '../../src/terminal/RunLogWriter';

describe('RunLogWriter', () => {
  const busy = Object.assign(new Error('terminal secret must not be logged'), { code: 'SQLITE_BUSY' });
  let events: string;
  let repository: { updateEvents: ReturnType<typeof vi.fn>; updateFinished: ReturnType<typeof vi.fn> };
  let saved: ReturnType<typeof vi.fn>;
  let finished: ReturnType<typeof vi.fn>;
  let diagnostic: ReturnType<typeof vi.spyOn>;
  let writer: RunLogWriter;

  beforeEach(() => {
    vi.useFakeTimers();
    events = 'first';
    repository = { updateEvents: vi.fn(), updateFinished: vi.fn() };
    saved = vi.fn();
    finished = vi.fn();
    diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    writer = new RunLogWriter(7, 42, repository, () => events, saved, finished);
  });

  afterEach(() => {
    writer.cancel();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries without new output and saves the latest snapshot without restarting the cycle', () => {
    repository.updateEvents.mockImplementationOnce(() => {
      throw busy;
    });
    expect(() => writer.update()).not.toThrow();
    events = 'latest';
    for (let i = 0; i < 100; i++) writer.update();
    expect(repository.updateEvents).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    expect(repository.updateEvents).toHaveBeenLastCalledWith(42, 'latest');
    expect(saved).toHaveBeenCalledTimes(1);
    writer.update();
    expect(repository.updateEvents).toHaveBeenCalledTimes(2);
    expect(diagnostic.mock.calls.flat().join(' ')).not.toContain('terminal secret');
  });

  it('limits a BUSY cycle to three attempts and throttles subsequent output after exhaustion', () => {
    repository.updateEvents.mockImplementation(() => {
      throw busy;
    });
    writer.update();
    vi.advanceTimersByTime(250);
    events = 'latest';
    writer.update();
    vi.advanceTimersByTime(1000);
    for (let i = 0; i < 100; i++) writer.update();
    expect(repository.updateEvents).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60_000);
    expect(repository.updateEvents).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    writer.update();
    expect(repository.updateEvents).toHaveBeenCalledTimes(4);
    expect(diagnostic.mock.calls.flat().join(' ')).toContain('exhausted');
  });

  it('throttles from failure completion after synchronous five-second waits', () => {
    repository.updateEvents.mockImplementation(() => {
      vi.setSystemTime(Date.now() + 5000);
      throw busy;
    });
    writer.update();
    vi.advanceTimersByTime(250);
    vi.advanceTimersByTime(1000);
    for (let i = 0; i < 100; i++) writer.update();
    expect(repository.updateEvents).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(2001);
    writer.update();
    expect(repository.updateEvents).toHaveBeenCalledTimes(4);
  });

  it.each([{ errno: 5 }, { errno: 517 }, { code: 'SQLITE_BUSY_RECOVERY' }])(
    'recognizes BUSY driver metadata %j',
    (metadata) => {
      repository.updateEvents.mockImplementationOnce(() => {
        throw metadata;
      });
      writer.update();
      vi.advanceTimersByTime(250);
      expect(repository.updateEvents).toHaveBeenCalledTimes(2);
    }
  );

  it.each([{ code: 'SQLITE_LOCKED' }, { errno: 6 }, { code: 'SQLITE_READONLY' }, new Error('database is locked')])(
    'does not retry non-BUSY errors %j',
    (error) => {
      repository.updateEvents.mockImplementation(() => {
        throw error;
      });
      writer.update();
      vi.advanceTimersByTime(60_000);
      expect(repository.updateEvents).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('prioritizes final flush, cancels intermediate retries, and reports completion once', () => {
    repository.updateEvents.mockImplementation(() => {
      throw busy;
    });
    repository.updateFinished.mockImplementationOnce(() => {
      throw busy;
    });
    writer.update();
    writer.finish('finished-at', 129, 'final');
    writer.update();
    vi.advanceTimersByTime(250);
    vi.advanceTimersByTime(10_000);
    expect(repository.updateEvents).toHaveBeenCalledTimes(1);
    expect(repository.updateFinished).toHaveBeenCalledTimes(2);
    expect(repository.updateFinished).toHaveBeenLastCalledWith(42, 'finished-at', 129, 'final');
    expect(finished).toHaveBeenCalledExactlyOnceWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases final retries after exhaustion or cancellation', () => {
    repository.updateFinished.mockImplementation(() => {
      throw busy;
    });
    writer.finish('end', 0, 'final');
    vi.advanceTimersByTime(1250);
    expect(finished).toHaveBeenCalledExactlyOnceWith(false);
    expect(repository.updateFinished).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
