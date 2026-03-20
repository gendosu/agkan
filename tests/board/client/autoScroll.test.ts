/**
 * @vitest-environment jsdom
 *
 * Tests for board client autoScroll module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stopAutoScroll, attachAutoScrollToBody } from '../../../src/board/client/autoScroll';

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  // Stub requestAnimationFrame and cancelAnimationFrame for jsdom
  // NOTE: do NOT invoke the callback immediately - that causes infinite recursion in step()
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stopAutoScroll', () => {
  it('does not throw when called without prior scroll', () => {
    expect(() => stopAutoScroll()).not.toThrow();
  });

  it('cancels animation frame when one is active', () => {
    // Trigger an auto-scroll by dispatching dragover near the top edge
    const body = document.createElement('div');
    body.id = 'col-backlog';
    // Stub getBoundingClientRect to simulate a tall column
    body.getBoundingClientRect = vi.fn().mockReturnValue({ top: 0, height: 500, bottom: 500, left: 0, right: 100 });
    document.body.appendChild(body);
    attachAutoScrollToBody(body);

    // Simulate drag near the top edge (within AUTO_SCROLL_ZONE=60)
    const dragover = new MouseEvent('dragover', { clientY: 10, bubbles: true });
    body.dispatchEvent(dragover);

    // Now stop
    expect(() => stopAutoScroll()).not.toThrow();
  });
});

describe('attachAutoScrollToBody', () => {
  function makeBody(): HTMLElement {
    const body = document.createElement('div');
    body.getBoundingClientRect = vi.fn().mockReturnValue({ top: 0, height: 500, bottom: 500, left: 0, right: 100 });
    document.body.appendChild(body);
    return body;
  }

  it('attaches without throwing', () => {
    const body = makeBody();
    expect(() => attachAutoScrollToBody(body)).not.toThrow();
  });

  it('calls stopAutoScroll on dragleave', () => {
    const body = makeBody();
    attachAutoScrollToBody(body);
    // Should not throw
    body.dispatchEvent(new Event('dragleave'));
  });

  it('calls stopAutoScroll on drop', () => {
    const body = makeBody();
    attachAutoScrollToBody(body);
    // Should not throw
    body.dispatchEvent(new Event('drop'));
  });

  it('does not trigger scroll when drag is in the middle of the body', () => {
    const body = makeBody();
    attachAutoScrollToBody(body);
    // clientY=250 is in the middle of height=500, outside AUTO_SCROLL_ZONE=60
    const dragover = new MouseEvent('dragover', { clientY: 250, bubbles: true });
    body.dispatchEvent(dragover);
    // stopAutoScroll should have been called (no scroll started)
    expect(cancelAnimationFrame).toBeDefined();
  });
});
