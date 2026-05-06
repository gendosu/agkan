/**
 * @vitest-environment jsdom
 *
 * Tests for attentionIndicator module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyAttention } from '../../../src/board/client/attentionIndicator';

describe('attentionIndicator.applyAttention', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('inserts icon when needsAttention=true', () => {
    document.body.innerHTML = `
      <div data-id="1">
        <span class="attention-indicator"></span>
      </div>
    `;
    applyAttention(1, true);
    const slot = document.querySelector('.attention-indicator');
    expect(slot?.classList.contains('is-active')).toBe(true);
    expect(slot?.innerHTML).toMatch(/icon-question/);
  });

  it('clears icon when needsAttention=false', () => {
    document.body.innerHTML = `
      <div data-id="1">
        <span class="attention-indicator"></span>
      </div>
    `;
    applyAttention(1, true);
    applyAttention(1, false);
    const slot = document.querySelector('.attention-indicator');
    expect(slot?.classList.contains('is-active')).toBe(false);
    expect(slot?.innerHTML).toBe('');
  });

  it('is no-op when card is not present', () => {
    document.body.innerHTML = '';
    expect(() => applyAttention(999, true)).not.toThrow();
  });
});
