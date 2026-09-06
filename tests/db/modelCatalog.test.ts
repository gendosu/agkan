import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL_CATALOG,
  resolveModelCatalog,
  findCatalogEntry,
  effortsForDefaultCli,
  validateOverridePair,
  type ModelCatalogEntry,
} from '../../src/db/modelCatalog';

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

// The built-in default already carries codex rows, so a plain copy is a mixed-cli catalog.
const CATALOG_WITH_CODEX: ModelCatalogEntry[] = DEFAULT_MODEL_CATALOG.map((e) => ({ ...e, efforts: [...e.efforts] }));

describe('DEFAULT_MODEL_CATALOG', () => {
  it('lists the four claude models followed by the four codex models', () => {
    expect(DEFAULT_MODEL_CATALOG.map((e) => `${e.cli}[${e.model}]`)).toEqual([
      'claude[fable]',
      'claude[opus]',
      'claude[sonnet]',
      'claude[haiku]',
      'codex[gpt-6-astra]',
      'codex[gpt-5.6-sol]',
      'codex[gpt-5.6-terra]',
      'codex[gpt-5.6-luna]',
    ]);
  });

  it('gives every claude row the documented effort list', () => {
    for (const entry of DEFAULT_MODEL_CATALOG.filter((e) => e.cli === 'claude')) {
      expect(entry.efforts).toEqual(CLAUDE_EFFORTS);
    }
  });

  it('gives each codex row the efforts its model accepts', () => {
    const codexEfforts = Object.fromEntries(
      DEFAULT_MODEL_CATALOG.filter((e) => e.cli === 'codex').map((e) => [e.model, e.efforts])
    );
    expect(codexEfforts).toEqual({
      'gpt-6-astra': CODEX_EFFORTS,
      'gpt-5.6-sol': CODEX_EFFORTS,
      'gpt-5.6-terra': CODEX_EFFORTS,
      'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
    });
  });
});

describe('resolveModelCatalog', () => {
  it('returns the built-in default when the config has no modelCatalog', () => {
    expect(resolveModelCatalog({})).toEqual([...DEFAULT_MODEL_CATALOG]);
  });

  it('returns a copy so callers cannot mutate the built-in default', () => {
    const resolved = resolveModelCatalog({});
    resolved[0].efforts.push('bogus');
    expect(DEFAULT_MODEL_CATALOG[0].efforts).toEqual(CLAUDE_EFFORTS);
  });

  it('replaces the whole catalog (no per-row merge) when modelCatalog is set', () => {
    const catalog = resolveModelCatalog({
      modelCatalog: [{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }],
    });
    expect(catalog).toEqual([{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }]);
  });

  it('accepts an empty catalog', () => {
    expect(resolveModelCatalog({ modelCatalog: [] })).toEqual([]);
  });

  it('trims model and effort values', () => {
    const catalog = resolveModelCatalog({
      modelCatalog: [{ cli: 'claude', model: '  opus  ', efforts: ['  high  '] }],
    });
    expect(catalog).toEqual([{ cli: 'claude', model: 'opus', efforts: ['high'] }]);
  });

  it('rejects a non-array modelCatalog', () => {
    expect(() => resolveModelCatalog({ modelCatalog: 'claude' as unknown as ModelCatalogEntry[] })).toThrow(
      'Invalid modelCatalog: must be an array of { cli, model, efforts } entries'
    );
  });

  it('rejects an unsupported cli', () => {
    expect(() =>
      resolveModelCatalog({ modelCatalog: [{ cli: 'gemini' as 'claude', model: 'x', efforts: [] }] })
    ).toThrow('Invalid modelCatalog[0].cli "gemini". Must be one of: claude, codex');
  });

  it('rejects an empty model name', () => {
    expect(() => resolveModelCatalog({ modelCatalog: [{ cli: 'claude', model: '  ', efforts: [] }] })).toThrow(
      'Invalid modelCatalog[0].model: must be a non-empty string'
    );
  });

  it('rejects a non-array efforts field', () => {
    expect(() =>
      resolveModelCatalog({ modelCatalog: [{ cli: 'claude', model: 'opus', efforts: 'high' as unknown as string[] }] })
    ).toThrow('Invalid modelCatalog[0].efforts: must be an array of non-empty strings');
  });

  it('rejects an empty effort value', () => {
    expect(() => resolveModelCatalog({ modelCatalog: [{ cli: 'claude', model: 'opus', efforts: [''] }] })).toThrow(
      'Invalid modelCatalog[0].efforts[0]: must be a non-empty string'
    );
  });

  it('rejects a duplicate model name across cli values', () => {
    expect(() =>
      resolveModelCatalog({
        modelCatalog: [
          { cli: 'claude', model: 'shared', efforts: [] },
          { cli: 'codex', model: 'shared', efforts: [] },
        ],
      })
    ).toThrow('Duplicate modelCatalog model "shared". Each model may appear only once, even across cli values');
  });
});

describe('findCatalogEntry', () => {
  const catalog = CATALOG_WITH_CODEX;

  it('finds a row by model name alone', () => {
    expect(findCatalogEntry(catalog, 'gpt-5.6-sol')?.cli).toBe('codex');
  });

  it('requires the cli to match when one is given', () => {
    expect(findCatalogEntry(catalog, 'gpt-5.6-sol', 'claude')).toBeUndefined();
    expect(findCatalogEntry(catalog, 'gpt-5.6-sol', 'codex')?.model).toBe('gpt-5.6-sol');
  });

  it('returns undefined for an unknown model', () => {
    expect(findCatalogEntry(catalog, 'gpt-5')).toBeUndefined();
  });
});

describe('effortsForDefaultCli', () => {
  it('unions the efforts of every row for the cli, in order, without duplicates', () => {
    expect(effortsForDefaultCli([...DEFAULT_MODEL_CATALOG], 'claude')).toEqual(CLAUDE_EFFORTS);
    expect(effortsForDefaultCli(CATALOG_WITH_CODEX, 'codex')).toEqual(CODEX_EFFORTS);
  });

  it('returns an empty list when no row belongs to the cli', () => {
    expect(effortsForDefaultCli([{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }], 'claude')).toEqual([]);
  });
});

describe('validateOverridePair', () => {
  const catalog = CATALOG_WITH_CODEX;

  it('accepts empty / null values as a clear instruction', () => {
    expect(validateOverridePair(catalog, 'claude', '', '')).toBeUndefined();
    expect(validateOverridePair(catalog, 'claude', null, null)).toBeUndefined();
    expect(validateOverridePair(catalog, 'claude', undefined, undefined)).toBeUndefined();
  });

  it('accepts a model from any cli row', () => {
    expect(validateOverridePair(catalog, 'claude', 'gpt-5.6-sol', undefined)).toBeUndefined();
  });

  it('rejects a model that is not in the catalog', () => {
    expect(validateOverridePair(catalog, 'claude', 'gpt-5', undefined)).toBe(
      'Invalid model "gpt-5". Must be one of: fable, opus, sonnet, haiku, gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna'
    );
  });

  it('validates the effort against the selected model row', () => {
    expect(validateOverridePair(catalog, 'claude', 'gpt-5.6-sol', 'ultra')).toBeUndefined();
    expect(validateOverridePair(catalog, 'claude', 'gpt-5.6-luna', 'ultra')).toBe(
      'Invalid effort "ultra" for model "gpt-5.6-luna". Must be one of: low, medium, high, xhigh, max'
    );
    expect(validateOverridePair(catalog, 'claude', 'opus', 'ultra')).toBe(
      'Invalid effort "ultra" for model "opus". Must be one of: low, medium, high, xhigh, max'
    );
  });

  it('validates the effort against the default cli union when no model is given', () => {
    expect(validateOverridePair(catalog, 'claude', '', 'max')).toBeUndefined();
    expect(validateOverridePair(catalog, 'claude', '', 'ultra')).toBe(
      'Invalid effort "ultra" for default cli "claude". Must be one of: low, medium, high, xhigh, max'
    );
    expect(validateOverridePair(catalog, 'codex', '', 'ultra')).toBeUndefined();
  });

  it('reports that a row accepts no effort override when its efforts list is empty', () => {
    const noEffort: ModelCatalogEntry[] = [{ cli: 'claude', model: 'fixed', efforts: [] }];
    expect(validateOverridePair(noEffort, 'claude', 'fixed', 'low')).toBe(
      'Invalid effort "low" for model "fixed". This model does not accept an effort override'
    );
  });
});
