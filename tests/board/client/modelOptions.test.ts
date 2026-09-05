/**
 * @vitest-environment jsdom
 *
 * Tests for the client-side model catalog helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getModelCatalog,
  effortsForModel,
  rebuildEffortOptions,
  wireModelEffortSync,
} from '../../../src/board/client/modelOptions';

function setCatalog(): void {
  (window as unknown as Record<string, unknown>).modelCatalog = [
    { cli: 'claude', model: 'fable', efforts: ['low', 'medium', 'high'] },
    { cli: 'claude', model: 'opus', efforts: ['low', 'max'] },
    { cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low'] },
  ];
  (window as unknown as Record<string, unknown>).defaultAgent = 'claude';
}

function setupSelects(modelValue: string, effortValue: string): void {
  document.body.innerHTML = `
    <select id="m"><option value=""></option><option value="fable">claude[fable]</option><option value="opus">claude[opus]</option><option value="gpt-5.6-sol">codex[gpt-5.6-sol]</option></select>
    <select id="e"><option value=""></option><option value="max">max</option></select>
  `;
  (document.getElementById('m') as HTMLSelectElement).value = modelValue;
  (document.getElementById('e') as HTMLSelectElement).value = effortValue;
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete (window as unknown as Record<string, unknown>).modelCatalog;
  delete (window as unknown as Record<string, unknown>).defaultAgent;
});

describe('getModelCatalog', () => {
  it('returns an empty list when the page embedded no catalog', () => {
    expect(getModelCatalog()).toEqual([]);
  });

  it('returns the embedded catalog', () => {
    setCatalog();
    expect(getModelCatalog().map((e) => e.model)).toEqual(['fable', 'opus', 'gpt-5.6-sol']);
  });
});

describe('effortsForModel', () => {
  beforeEach(setCatalog);

  it('returns the efforts of the selected model row', () => {
    expect(effortsForModel('gpt-5.6-sol')).toEqual(['none', 'low']);
  });

  it('unions the default cli rows when no model is selected', () => {
    expect(effortsForModel('')).toEqual(['low', 'medium', 'high', 'max']);
  });

  it('follows defaultAgent when it is codex', () => {
    (window as unknown as Record<string, unknown>).defaultAgent = 'codex';
    expect(effortsForModel('')).toEqual(['none', 'low']);
  });

  it('returns an empty list for a model that is not in the catalog', () => {
    expect(effortsForModel('gpt-5')).toEqual([]);
  });
});

describe('rebuildEffortOptions', () => {
  beforeEach(setCatalog);

  it('replaces the options with the selected model row efforts, keeping the default entry first', () => {
    setupSelects('gpt-5.6-sol', '');
    const modelSelect = document.getElementById('m') as HTMLSelectElement;
    const effortSelect = document.getElementById('e') as HTMLSelectElement;

    rebuildEffortOptions(modelSelect, effortSelect);

    expect([...effortSelect.options].map((o) => o.value)).toEqual(['', 'none', 'low']);
    expect(effortSelect.options[0].textContent).toBe('Effort: default');
  });

  it('keeps the current effort when the new candidates still contain it', () => {
    setupSelects('fable', 'low');
    const modelSelect = document.getElementById('m') as HTMLSelectElement;
    const effortSelect = document.getElementById('e') as HTMLSelectElement;
    effortSelect.innerHTML = '<option value=""></option><option value="low">low</option>';
    effortSelect.value = 'low';

    rebuildEffortOptions(modelSelect, effortSelect);

    expect(effortSelect.value).toBe('low');
  });

  it('falls back to the default entry when the current effort is not a candidate', () => {
    setupSelects('gpt-5.6-sol', 'max');
    const modelSelect = document.getElementById('m') as HTMLSelectElement;
    const effortSelect = document.getElementById('e') as HTMLSelectElement;

    rebuildEffortOptions(modelSelect, effortSelect);

    expect(effortSelect.value).toBe('');
  });
});

describe('wireModelEffortSync', () => {
  beforeEach(setCatalog);

  it('rebuilds the effort options when the model select changes', () => {
    setupSelects('', '');
    wireModelEffortSync('m', 'e');

    const modelSelect = document.getElementById('m') as HTMLSelectElement;
    modelSelect.value = 'gpt-5.6-sol';
    modelSelect.dispatchEvent(new Event('change'));

    const effortSelect = document.getElementById('e') as HTMLSelectElement;
    expect([...effortSelect.options].map((o) => o.value)).toEqual(['', 'none', 'low']);
  });

  it('does nothing when either select is missing', () => {
    document.body.innerHTML = '<select id="m"></select>';
    expect(() => wireModelEffortSync('m', 'e')).not.toThrow();
  });
});
