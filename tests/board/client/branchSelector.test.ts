/**
 * @vitest-environment jsdom
 *
 * Tests for the shared branchSelector component used by addTaskModal and detailPanel.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initBranchSelector,
  BRANCH_AUTO_GENERATE,
  BRANCH_AUTO_GENERATE_DISPLAY,
} from '../../../src/board/client/branchSelector';

function setupDOM(inputId: string, dropdownId: string): void {
  document.body.innerHTML = `
    <div class="branch-select-wrapper">
      <input type="text" id="${inputId}" readonly>
      <div class="branch-select-dropdown" id="${dropdownId}" style="display:none;"></div>
    </div>
  `;
}

describe('initBranchSelector', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in auto-generate mode by default', () => {
    setupDOM('branch-input', 'branch-dropdown');
    const selector = initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown' });

    expect(selector.getValue()).toBe(BRANCH_AUTO_GENERATE);
  });

  it('initializes with a manual branch when initialBranch is provided', () => {
    setupDOM('branch-input', 'branch-dropdown');
    const selector = initBranchSelector({
      inputId: 'branch-input',
      dropdownId: 'branch-dropdown',
      initialBranch: 'feature/existing',
    });

    expect(selector.getValue()).toBe('feature/existing');
  });

  it('treats null, undefined and the auto-generate sentinel as auto mode', () => {
    setupDOM('branch-input', 'branch-dropdown');
    expect(
      initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown', initialBranch: null }).getValue()
    ).toBe(BRANCH_AUTO_GENERATE);

    setupDOM('branch-input', 'branch-dropdown');
    expect(
      initBranchSelector({
        inputId: 'branch-input',
        dropdownId: 'branch-dropdown',
        initialBranch: undefined,
      }).getValue()
    ).toBe(BRANCH_AUTO_GENERATE);

    setupDOM('branch-input', 'branch-dropdown');
    expect(
      initBranchSelector({
        inputId: 'branch-input',
        dropdownId: 'branch-dropdown',
        initialBranch: BRANCH_AUTO_GENERATE,
      }).getValue()
    ).toBe(BRANCH_AUTO_GENERATE);
  });

  it('switches to manual mode and captures the first character on keydown, preventing duplication', () => {
    setupDOM('branch-input', 'branch-dropdown');
    initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown' });

    const input = document.getElementById('branch-input') as HTMLInputElement;
    const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    input.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    expect(input.readOnly).toBe(false);
    expect(input.classList.contains('branch-auto-mode')).toBe(false);
    expect(input.value).toBe('f');
  });

  it('ignores control/meta/alt modified keydowns while in auto mode', () => {
    setupDOM('branch-input', 'branch-dropdown');
    initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown' });

    const input = document.getElementById('branch-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(input.readOnly).toBe(true);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(input.readOnly).toBe(true);
  });

  it('updates the internal value as the user types', () => {
    setupDOM('branch-input', 'branch-dropdown');
    const selector = initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown' });

    const input = document.getElementById('branch-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    input.value = 'my-branch';
    input.dispatchEvent(new Event('input'));

    expect(selector.getValue()).toBe('my-branch');
  });

  it('fetches and renders branch suggestions on focus', async () => {
    setupDOM('branch-input', 'branch-dropdown');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ branches: ['main', 'feature/foo'] }),
    });

    initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown' });

    const input = document.getElementById('branch-input') as HTMLInputElement;
    const dropdown = document.getElementById('branch-dropdown') as HTMLElement;
    input.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dropdown.style.display).toBe('block');
    expect(dropdown.textContent).toContain('main');
    expect(dropdown.textContent).toContain('feature/foo');
    expect(dropdown.textContent).toContain(BRANCH_AUTO_GENERATE_DISPLAY);
  });

  it('selecting a suggestion switches to manual mode with that branch and hides the dropdown', async () => {
    setupDOM('branch-input', 'branch-dropdown');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ branches: ['main'] }),
    });

    const selector = initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown' });
    const input = document.getElementById('branch-input') as HTMLInputElement;
    const dropdown = document.getElementById('branch-dropdown') as HTMLElement;

    input.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const option = Array.from(dropdown.querySelectorAll('.branch-select-option')).find(
      (el) => el.textContent === 'main'
    ) as HTMLElement;
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(selector.getValue()).toBe('main');
    expect(input.value).toBe('main');
    expect(input.readOnly).toBe(false);
    expect(dropdown.style.display).toBe('none');
  });

  it('selecting the auto-generate option resets to auto mode', async () => {
    setupDOM('branch-input', 'branch-dropdown');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ branches: ['main'] }),
    });

    const selector = initBranchSelector({
      inputId: 'branch-input',
      dropdownId: 'branch-dropdown',
      initialBranch: 'feature/existing',
    });
    const input = document.getElementById('branch-input') as HTMLInputElement;
    const dropdown = document.getElementById('branch-dropdown') as HTMLElement;

    input.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const autoOption = dropdown.querySelector('.branch-select-option-auto') as HTMLElement;
    autoOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(selector.getValue()).toBe(BRANCH_AUTO_GENERATE);
    expect(input.value).toBe(BRANCH_AUTO_GENERATE_DISPLAY);
    expect(input.readOnly).toBe(true);
    expect(dropdown.style.display).toBe('none');
  });

  it('hides the dropdown shortly after blur', () => {
    vi.useFakeTimers();
    setupDOM('branch-input', 'branch-dropdown');
    initBranchSelector({ inputId: 'branch-input', dropdownId: 'branch-dropdown' });

    const input = document.getElementById('branch-input') as HTMLInputElement;
    const dropdown = document.getElementById('branch-dropdown') as HTMLElement;
    dropdown.style.display = 'block';

    input.dispatchEvent(new Event('blur'));
    expect(dropdown.style.display).toBe('block');

    vi.advanceTimersByTime(150);
    expect(dropdown.style.display).toBe('none');
    vi.useRealTimers();
  });

  it('reset() restores auto mode and hides the dropdown', () => {
    setupDOM('branch-input', 'branch-dropdown');
    const selector = initBranchSelector({
      inputId: 'branch-input',
      dropdownId: 'branch-dropdown',
      initialBranch: 'feature/existing',
    });
    const input = document.getElementById('branch-input') as HTMLInputElement;
    const dropdown = document.getElementById('branch-dropdown') as HTMLElement;
    dropdown.style.display = 'block';

    selector.reset();

    expect(selector.getValue()).toBe(BRANCH_AUTO_GENERATE);
    expect(input.value).toBe(BRANCH_AUTO_GENERATE_DISPLAY);
    expect(input.readOnly).toBe(true);
    expect(dropdown.style.display).toBe('none');
  });

  it('does not throw when the input/dropdown elements are missing', () => {
    document.body.innerHTML = '';
    expect(() => initBranchSelector({ inputId: 'missing-input', dropdownId: 'missing-dropdown' })).not.toThrow();
  });
});
