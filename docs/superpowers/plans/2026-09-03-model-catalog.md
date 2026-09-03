# modelCatalog によるタスク単位 cli/model/effort 選択 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `modelCatalog`（`cli` + `model` + `efforts` の行）を唯一の正とし、タスクで model を選ぶとその行の cli でそのタスクだけを起動できるようにする。CLI・Board API・Board UI の 3 箇所に散っていた Claude 固定の有効値表を廃止する。

**Architecture:** 新規 `src/db/modelCatalog.ts` に組込既定カタログと解決・検証関数を置き、`.agkan.yml` の `modelCatalog` で丸ごと上書きできるようにする。実行経路は `resolveModelAndEffort` を `resolveLaunchSettings`（`{ agent, model, effort }` を返し、不正時は `LaunchSettingsError` を throw）へ置き換え、`PtySessionService.startProcess` に末尾引数 `agent` を追加してタスク単位の cli 切替を通す。書き込み側（CLI / Board API）と UI 側は同じカタログを参照する。

**Tech Stack:** TypeScript / better-sqlite3 / Hono / commander / vitest / esbuild（client bundle）/ pnpm

**Spec:** `docs/superpowers/specs/2026-09-03-model-catalog-design.md`

**Base branch:** `beta`（コミット `d1c7e34` 時点。Task 0 でここから作業ブランチを作成する）

## Global Constraints

- 組込既定カタログは 5 行。claude: `fable` / `opus` / `sonnet` / `haiku`（efforts はいずれも `low, medium, high, xhigh, max`）、codex: `gpt-5.6-sol`（efforts は `none, low, medium, high, xhigh`）
- `.agkan.yml` の `modelCatalog` は**丸ごと上書き**（行単位のマージはしない）。空配列も有効
- カタログの検証: 配列であること / 各行の `cli` が `claude` または `codex` / `model` が空でない文字列 / `efforts` が文字列配列（各要素は空でない）/ **同じ `model` 名が 2 行以上に現れない（cli をまたいでも禁止）**
- 表示形式は `cli[model]` をそのまま（`claude[fable]`, `codex[gpt-5.6-sol]`）。現行の先頭大文字化（`claude[Fable]`）は廃止
- タスク側の保存形式は現行どおり `tasks.model_planning` / `model_run` / `effort_planning` / `effort_run` に model 名 / effort 名のみ。マイグレーションなし
- 実行時に行が見つからない → 400 で停止（既定 cli で黙って起動しない）。書き込み時 → そもそも受け付けない
- config 由来の値: model は検証しない（素通し）。effort は「行が特定できるときだけ」その行で検証し、特定できなければ素通し
- effort の検証単位は行ごと。model 未指定のときは既定 cli に属する全行の efforts の和集合
- `src/board/client/detailPanelHtml.ts` の `MODEL_PLANNING_METADATA_KEY` などの 4 定数は削除しない（旧 metadata 行を詳細パネルから隠すために `src/board/client/detailPanelHtml.ts:270-276` でまだ使われている）
- `DEFAULT_CODEX_MODEL`（`src/terminal/PtySessionService.ts:42`）は変更しない
- テストコマンド: 単体ファイル `pnpm exec vitest run <path>`、全体 `pnpm exec vitest run`（約15分）。型チェック `pnpm run type-check`（server / `src/board/client/tsconfig.json` / `tsconfig.config.json` の 3 プロジェクト）。lint `pnpm run lint`。format `pnpm run format:check` / `pnpm run format`
- client バンドル（`src/board/client/`）は別 TS プロジェクトで `verbatimModuleSyntax: true`。型のみの import は必ず `import type` を使う（`src/board/client/tsconfig.json:10`）
- コミットメッセージは英語・Conventional Commits。全コミットの末尾に以下 2 行を入れる:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw
  ```

---

### Task 0: 作業ブランチの作成

**Files:** なし（git 操作のみ）

- [ ] **Step 1: beta から作業ブランチを作成する**

```bash
git checkout -b feat/model-catalog beta
```

- [ ] **Step 2: 基点を確認する**

Run: `git log --oneline -1`
Expected: `d1c7e34 docs: add design spec for modelCatalog task-level cli/model/effort selection`

---

### Task 1: `src/db/modelCatalog.ts`（カタログ定義・解決・検証）

**Files:**
- Create: `src/db/modelCatalog.ts`
- Modify: `src/db/config.ts:15-27`（`Config` に `modelCatalog?: ModelCatalogEntry[]` を追加）
- Test: `tests/db/modelCatalog.test.ts`（新規）

**Interfaces:**
- Consumes: `AgentTool = 'claude' | 'codex'`（`src/db/config.ts:5`）、`Config`（`src/db/config.ts:15-27`）
- Produces:
  - `interface ModelCatalogEntry { cli: AgentTool; model: string; efforts: string[] }`
  - `const DEFAULT_MODEL_CATALOG: readonly ModelCatalogEntry[]`
  - `resolveModelCatalog(config: Config): ModelCatalogEntry[]` — 不正なら `Error` を throw
  - `findCatalogEntry(catalog: readonly ModelCatalogEntry[], model: string, cli?: AgentTool): ModelCatalogEntry | undefined`
  - `effortsForDefaultCli(catalog: readonly ModelCatalogEntry[], cli: AgentTool): string[]`
  - `validateOverridePair(catalog: readonly ModelCatalogEntry[], defaultCli: AgentTool, model: string | null | undefined, effort: string | null | undefined): string | undefined`
  - `Config.modelCatalog?: ModelCatalogEntry[]`

現状の `Config`（`src/db/config.ts:15-27`）はこうなっている。ここに 1 行足す。

```typescript
export interface Config {
  agent?: AgentTool;
  path?: string;
  board?: {
    port?: number;
    title?: string;
  };
  models?: AgentModelSettings & {
    claude?: AgentModelSettings;
    codex?: AgentModelSettings;
  };
  permissionMode?: string;
}
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/modelCatalog.test.ts` を新規作成する。

```typescript
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
const CODEX_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];

describe('DEFAULT_MODEL_CATALOG', () => {
  it('lists the four claude models and the codex model', () => {
    expect(DEFAULT_MODEL_CATALOG.map((e) => `${e.cli}[${e.model}]`)).toEqual([
      'claude[fable]',
      'claude[opus]',
      'claude[sonnet]',
      'claude[haiku]',
      'codex[gpt-5.6-sol]',
    ]);
  });

  it('gives every claude row the documented effort list', () => {
    for (const entry of DEFAULT_MODEL_CATALOG.filter((e) => e.cli === 'claude')) {
      expect(entry.efforts).toEqual(CLAUDE_EFFORTS);
    }
  });

  it('gives the codex row its own effort list', () => {
    expect(DEFAULT_MODEL_CATALOG.find((e) => e.cli === 'codex')!.efforts).toEqual(CODEX_EFFORTS);
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
  const catalog = [...DEFAULT_MODEL_CATALOG];

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
    expect(effortsForDefaultCli([...DEFAULT_MODEL_CATALOG], 'codex')).toEqual(CODEX_EFFORTS);
  });

  it('returns an empty list when no row belongs to the cli', () => {
    expect(effortsForDefaultCli([{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }], 'claude')).toEqual([]);
  });
});

describe('validateOverridePair', () => {
  const catalog = [...DEFAULT_MODEL_CATALOG];

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
      'Invalid model "gpt-5". Must be one of: fable, opus, sonnet, haiku, gpt-5.6-sol'
    );
  });

  it('validates the effort against the selected model row', () => {
    expect(validateOverridePair(catalog, 'claude', 'gpt-5.6-sol', 'none')).toBeUndefined();
    expect(validateOverridePair(catalog, 'claude', 'opus', 'none')).toBe(
      'Invalid effort "none" for model "opus". Must be one of: low, medium, high, xhigh, max'
    );
  });

  it('validates the effort against the default cli union when no model is given', () => {
    expect(validateOverridePair(catalog, 'claude', '', 'max')).toBeUndefined();
    expect(validateOverridePair(catalog, 'claude', '', 'none')).toBe(
      'Invalid effort "none" for default cli "claude". Must be one of: low, medium, high, xhigh, max'
    );
    expect(validateOverridePair(catalog, 'codex', '', 'none')).toBeUndefined();
  });

  it('reports that a row accepts no effort override when its efforts list is empty', () => {
    const noEffort: ModelCatalogEntry[] = [{ cli: 'claude', model: 'fixed', efforts: [] }];
    expect(validateOverridePair(noEffort, 'claude', 'fixed', 'low')).toBe(
      'Invalid effort "low" for model "fixed". This model does not accept an effort override'
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/db/modelCatalog.test.ts`
Expected: FAIL（`Failed to resolve import "../../src/db/modelCatalog"`）

- [ ] **Step 3: `src/db/modelCatalog.ts` を実装する**

```typescript
// Model catalog: the single source of truth for which (cli, model, effort)
// combinations a task-level override may select. The built-in default can be
// replaced wholesale by the `modelCatalog` key in .agkan.yml.

import type { AgentTool, Config } from './config';

export interface ModelCatalogEntry {
  /** CLI that runs this model. A task that selects the model runs on this cli. */
  cli: AgentTool;
  /** Value passed through to the CLI's --model flag */
  model: string;
  /** Effort values selectable for this model. An empty list means "no effort override". */
  efforts: string[];
}

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];

export const DEFAULT_MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  { cli: 'claude', model: 'fable', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'opus', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'sonnet', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'haiku', efforts: CLAUDE_EFFORTS },
  { cli: 'codex', model: 'gpt-5.6-sol', efforts: CODEX_EFFORTS },
];

function cloneCatalog(catalog: readonly ModelCatalogEntry[]): ModelCatalogEntry[] {
  return catalog.map((entry) => ({ ...entry, efforts: [...entry.efforts] }));
}

function parseEntry(raw: unknown, index: number): ModelCatalogEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid modelCatalog[${index}]: each entry must be an object with cli, model, and efforts`);
  }
  const entry = raw as Record<string, unknown>;

  const cli = entry.cli;
  if (cli !== 'claude' && cli !== 'codex') {
    throw new Error(`Invalid modelCatalog[${index}].cli "${String(cli)}". Must be one of: claude, codex`);
  }

  const model = entry.model;
  if (typeof model !== 'string' || !model.trim()) {
    throw new Error(`Invalid modelCatalog[${index}].model: must be a non-empty string`);
  }

  const efforts = entry.efforts;
  if (!Array.isArray(efforts)) {
    throw new Error(`Invalid modelCatalog[${index}].efforts: must be an array of non-empty strings`);
  }
  const parsedEfforts = efforts.map((effort, effortIndex) => {
    if (typeof effort !== 'string' || !effort.trim()) {
      throw new Error(`Invalid modelCatalog[${index}].efforts[${effortIndex}]: must be a non-empty string`);
    }
    return effort.trim();
  });

  return { cli, model: model.trim(), efforts: parsedEfforts };
}

/**
 * Resolve the model catalog for the given config.
 * Returns a fresh copy of the built-in default when `modelCatalog` is absent;
 * otherwise validates and returns the configured catalog (whole replacement).
 */
export function resolveModelCatalog(config: Config): ModelCatalogEntry[] {
  const raw = config.modelCatalog;
  if (raw === undefined) return cloneCatalog(DEFAULT_MODEL_CATALOG);
  if (!Array.isArray(raw)) {
    throw new Error('Invalid modelCatalog: must be an array of { cli, model, efforts } entries');
  }

  const entries = raw.map((entry, index) => parseEntry(entry, index));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.model)) {
      throw new Error(
        `Duplicate modelCatalog model "${entry.model}". Each model may appear only once, even across cli values`
      );
    }
    seen.add(entry.model);
  }
  return entries;
}

/** Find the catalog row for a model name. When `cli` is given, the row's cli must match too. */
export function findCatalogEntry(
  catalog: readonly ModelCatalogEntry[],
  model: string,
  cli?: AgentTool
): ModelCatalogEntry | undefined {
  return catalog.find((entry) => entry.model === model && (cli === undefined || entry.cli === cli));
}

/** Union (first-seen order, deduplicated) of the efforts of every row belonging to `cli`. */
export function effortsForDefaultCli(catalog: readonly ModelCatalogEntry[], cli: AgentTool): string[] {
  const result: string[] = [];
  for (const entry of catalog) {
    if (entry.cli !== cli) continue;
    for (const effort of entry.efforts) {
      if (!result.includes(effort)) result.push(effort);
    }
  }
  return result;
}

/**
 * Validate a model/effort pair that is about to be written to a task.
 * Returns an error message, or undefined when the pair is acceptable.
 * Empty / null values are the "clear this override" instruction and always pass.
 */
export function validateOverridePair(
  catalog: readonly ModelCatalogEntry[],
  defaultCli: AgentTool,
  model: string | null | undefined,
  effort: string | null | undefined
): string | undefined {
  const trimmedModel = typeof model === 'string' ? model.trim() : '';
  const trimmedEffort = typeof effort === 'string' ? effort.trim() : '';

  const entry = trimmedModel ? findCatalogEntry(catalog, trimmedModel) : undefined;
  if (trimmedModel && !entry) {
    return `Invalid model "${trimmedModel}". Must be one of: ${catalog.map((e) => e.model).join(', ')}`;
  }

  if (!trimmedEffort) return undefined;

  const allowed = entry ? entry.efforts : effortsForDefaultCli(catalog, defaultCli);
  if (allowed.includes(trimmedEffort)) return undefined;

  const target = entry ? `model "${entry.model}"` : `default cli "${defaultCli}"`;
  if (allowed.length === 0) {
    return `Invalid effort "${trimmedEffort}" for ${target}. This model does not accept an effort override`;
  }
  return `Invalid effort "${trimmedEffort}" for ${target}. Must be one of: ${allowed.join(', ')}`;
}
```

- [ ] **Step 4: `Config` に `modelCatalog` を追加する**

`src/db/config.ts` の先頭 import 群（現状は `fs` / `path` / `js-yaml` の 3 行、`src/db/config.ts:1-3`）の直後に型 import を追加する。`import type` を使うこと（`modelCatalog.ts` は `config.ts` から型を import しているため、値 import にすると循環参照になる）。

```typescript
import type { ModelCatalogEntry } from './modelCatalog';
```

`Config`（`src/db/config.ts:15-27`）の `permissionMode?: string;` の直前に 1 行足す。

```typescript
  modelCatalog?: ModelCatalogEntry[];
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/db/modelCatalog.test.ts`
Expected: PASS（28 tests）

- [ ] **Step 6: 型チェック・lint・format を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし（format:check が落ちたら `pnpm run format` を実行して再実行）

- [ ] **Step 7: コミット**

```bash
git add src/db/modelCatalog.ts src/db/config.ts tests/db/modelCatalog.test.ts
git commit -m "feat(db): add modelCatalog with built-in default and validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 2: `resolveModelSettings` に `agent` 引数を追加

**Files:**
- Modify: `src/db/config.ts:41-48`
- Test: `tests/db/config.test.ts:32-64`（`Agent tool resolution` describe に追記）

**Interfaces:**
- Consumes: `resolveAgentTool(config: Config): AgentTool`（`src/db/config.ts:33-39`）
- Produces: `resolveModelSettings(config: Config, command: 'planning' | 'run', agent?: AgentTool): ModelSettings | undefined` — `agent` を渡すとその cli の設定を引く。省略時は従来どおり `resolveAgentTool(config)`。fallback 順（`models.<agent>.<kind>` → `models.<kind>`）は変えない

現状（`src/db/config.ts:45-48`）:

```typescript
export function resolveModelSettings(config: Config, command: 'planning' | 'run'): ModelSettings | undefined {
  const agent = resolveAgentTool(config);
  return config.models?.[agent]?.[command] ?? config.models?.[command];
}
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/config.test.ts` の `describe('Agent tool resolution', ...)`（`tests/db/config.test.ts:32-64`）の中、`falls back to legacy flat model settings` の it（`tests/db/config.test.ts:53-57`）の直後に以下を追加する。

```typescript
  it('uses the explicitly passed agent instead of the configured one', () => {
    const config = {
      agent: 'codex' as const,
      models: {
        claude: { run: { model: 'claude-sonnet', effort: 'low' } },
        codex: { run: { model: 'gpt-codex', effort: 'high' } },
      },
    };

    expect(resolveModelSettings(config, 'run', 'claude')).toEqual({ model: 'claude-sonnet', effort: 'low' });
  });

  it('falls back to the legacy flat settings for the explicitly passed agent', () => {
    const config = {
      agent: 'claude' as const,
      models: { run: { model: 'legacy-model' } },
    };

    expect(resolveModelSettings(config, 'run', 'codex')).toEqual({ model: 'legacy-model' });
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/db/config.test.ts -t 'uses the explicitly passed agent'`
Expected: FAIL（`expected { model: 'gpt-codex', effort: 'high' } to deeply equal { model: 'claude-sonnet', effort: 'low' }`）

- [ ] **Step 3: `resolveModelSettings` に引数を足す**

`src/db/config.ts:45-48` を次に置き換える。

```typescript
export function resolveModelSettings(
  config: Config,
  command: 'planning' | 'run',
  agent: AgentTool = resolveAgentTool(config)
): ModelSettings | undefined {
  return config.models?.[agent]?.[command] ?? config.models?.[command];
}
```

同時に、直上の JSDoc（`src/db/config.ts:41-44`）の末尾に 1 行足す。

```typescript
/**
 * Resolve model settings for the selected agent. Agent-specific settings take
 * precedence over the legacy flat planning/run settings.
 * Pass `agent` to resolve for a cli other than the configured default (a task
 * whose model override selects a different cli).
 */
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/db/config.test.ts`
Expected: PASS

- [ ] **Step 5: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/db/config.ts tests/db/config.test.ts
git commit -m "feat(db): let resolveModelSettings resolve for an explicit agent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 3: `resolveLaunchSettings` の追加（旧 `resolveModelAndEffort` は残す）

**Files:**
- Modify: `src/board/claudePromptBuilder.ts:1-9`（import 追加）, 末尾に追記
- Test: `tests/board/claudePromptBuilder.test.ts`（`resolveLaunchSettings` の describe を追加）

**Interfaces:**
- Consumes: `resolveModelCatalog` / `findCatalogEntry` / `ModelCatalogEntry`（Task 1）、`resolveModelSettings(config, kind, agent)`（Task 2）、`resolveAgentTool`（`src/db/config.ts:33-39`）、`getTaskModelOverride` / `getTaskEffortOverride` / `ModelOverrideKind`（`src/board/taskModelOverride.ts:11,36-54`）
- Produces:
  - `class LaunchSettingsError extends Error`
  - `interface LaunchSettings { agent: AgentTool; model?: string; effort?: string }`
  - `resolveLaunchSettings(taskService: TaskService | undefined, taskId: number, command: ClaudeCommand): LaunchSettings`

この Task では旧 `resolveModelAndEffort`（`src/board/claudePromptBuilder.ts:64-81`）と旧定数はそのまま残す。呼び出し側の差し替えは Task 5 / Task 6 で行う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/board/claudePromptBuilder.test.ts` の import 文（`tests/board/claudePromptBuilder.test.ts:15-23`）に `resolveLaunchSettings` と `LaunchSettingsError` を足す。

```typescript
import {
  parseClaudeCommand,
  buildClaudePrompt,
  isValidEffortLevel,
  VALID_EFFORT_LEVELS,
  isValidModelAlias,
  MODEL_ALIASES,
  resolveModelAndEffort,
  resolveLaunchSettings,
  LaunchSettingsError,
} from '../../src/board/claudePromptBuilder';
```

ファイル末尾（`resolveModelAndEffort` の describe が閉じたあと、`tests/board/claudePromptBuilder.test.ts:177` の直後）に以下を追加する。`writeConfig` / `tmpCwd` は describe ごとにローカルなので、同じ tmp-cwd パターンをこの describe にも書く。

```typescript
describe('resolveLaunchSettings', () => {
  // loadConfig() reads '<cwd>/.agkan-test.yml'; isolate by mocking process.cwd()
  // to a private tmp dir, matching the resolveModelAndEffort describe above.
  let tmpCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-launch-settings-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  function writeConfig(config: unknown): void {
    fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump(config));
  }

  it('defaults to the claude agent with no model or effort', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'claude',
      model: undefined,
      effort: undefined,
    });
  });

  it('takes the agent from the catalog row of the task-level model override', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5.6-sol' });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'codex',
      model: 'gpt-5.6-sol',
      effort: undefined,
    });
  });

  it('throws when the task-level model is not in the catalog', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5' });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(LaunchSettingsError);
    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Task model "gpt-5" is not in modelCatalog. Must be one of: fable, opus, sonnet, haiku, gpt-5.6-sol'
    );
  });

  it('uses the configured agent and its models block when the task has no model override', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({
      agent: 'codex',
      models: { claude: { run: { model: 'sonnet' } }, codex: { run: { model: 'gpt-5.6-sol', effort: 'none' } } },
    });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'none',
    });
  });

  it('validates the effort against the catalog row of the task-level model', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'opus', effort_run: 'none' });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Effort "none" is not allowed for model "opus". Must be one of: low, medium, high, xhigh, max'
    );
  });

  it('validates a config effort when the config model resolves to a catalog row', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { model: 'opus', effort: 'none' } } });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Effort "none" is not allowed for model "opus". Must be one of: low, medium, high, xhigh, max'
    );
  });

  it('passes a config effort through unvalidated when the config model is not in the catalog', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { model: 'claude-sonnet-4-6', effort: 'ultra' } } });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'claude',
      model: 'claude-sonnet-4-6',
      effort: 'ultra',
    });
  });

  it('ignores a catalog row that belongs to another cli when resolving the config model', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    // gpt-5.6-sol is a codex row; with agent: claude it must not be used to
    // validate the effort, so the unknown effort passes through.
    writeConfig({ models: { claude: { run: { model: 'gpt-5.6-sol', effort: 'ultra' } } } });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'claude',
      model: 'gpt-5.6-sol',
      effort: 'ultra',
    });
  });

  it('uses the planning config only for the planning command', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { planning: { effort: 'low' }, run: { effort: 'high' } } });

    expect(resolveLaunchSettings(ts, task.id, 'planning').effort).toBe('low');
    expect(resolveLaunchSettings(ts, task.id, 'run').effort).toBe('high');
    expect(resolveLaunchSettings(ts, task.id, 'pr').effort).toBe('high');
  });

  it('skips task-level overrides when no task service is supplied', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5.6-sol' });

    expect(resolveLaunchSettings(undefined, task.id, 'run')).toEqual({
      agent: 'claude',
      model: undefined,
      effort: undefined,
    });
  });

  it('throws a plain Error (not LaunchSettingsError) when the configured catalog is invalid', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ modelCatalog: 'claude' });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Invalid modelCatalog: must be an array of { cli, model, efforts } entries'
    );
    expect(() => resolveLaunchSettings(ts, task.id, 'run')).not.toThrow(LaunchSettingsError);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/board/claudePromptBuilder.test.ts`
Expected: FAIL（`"resolveLaunchSettings" is not exported by "src/board/claudePromptBuilder.ts"`）

- [ ] **Step 3: `resolveLaunchSettings` を実装する**

`src/board/claudePromptBuilder.ts` の import 群（`src/board/claudePromptBuilder.ts:6-9`）を次に置き換える。

```typescript
import { TaskService } from '../services/TaskService';
import { loadConfig, resolveAgentTool, resolveModelSettings, type AgentTool } from '../db/config';
import { resolveModelCatalog, findCatalogEntry, type ModelCatalogEntry } from '../db/modelCatalog';
import { BRANCH_AUTO_GENERATE } from '../models/Task';
import { getTaskModelOverride, getTaskEffortOverride, ModelOverrideKind } from './taskModelOverride';
```

ファイル末尾（`resolveModelAndEffort` の閉じ括弧、`src/board/claudePromptBuilder.ts:81` の直後）に以下を追記する。

```typescript

/** Thrown when a task's model/effort cannot be resolved against the model catalog. */
export class LaunchSettingsError extends Error {}

export interface LaunchSettings {
  agent: AgentTool;
  model?: string;
  effort?: string;
}

/**
 * Resolve which cli, model and effort a run of this task should use.
 * A task-level model override picks its catalog row's cli; without one the
 * configured `agent:` is the default cli and its `models.<agent>` block applies.
 * Effort is validated only when a catalog row can be identified.
 */
export function resolveLaunchSettings(
  taskService: TaskService | undefined,
  taskId: number,
  command: ClaudeCommand
): LaunchSettings {
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultCli = resolveAgentTool(config);
  const kind: ModelOverrideKind = command === 'planning' ? 'planning' : 'run';

  const taskModel = taskService ? getTaskModelOverride(taskService, taskId, kind) : undefined;
  const taskEffort = taskService ? getTaskEffortOverride(taskService, taskId, kind) : undefined;

  let agent: AgentTool;
  let model: string | undefined;
  let entry: ModelCatalogEntry | undefined;

  if (taskModel) {
    entry = findCatalogEntry(catalog, taskModel);
    if (!entry) {
      throw new LaunchSettingsError(
        `Task model "${taskModel}" is not in modelCatalog. Must be one of: ${catalog.map((e) => e.model).join(', ')}`
      );
    }
    agent = entry.cli;
    model = entry.model;
  } else {
    agent = defaultCli;
    model = resolveModelSettings(config, kind, agent)?.model?.trim() || undefined;
    // Match the cli too: `agent:` wins over a same-named row of the other cli.
    entry = model ? findCatalogEntry(catalog, model, agent) : undefined;
  }

  const effort = taskEffort ?? resolveModelSettings(config, kind, agent)?.effort?.trim() ?? undefined;

  if (effort && entry && !entry.efforts.includes(effort)) {
    const allowed =
      entry.efforts.length === 0
        ? 'This model does not accept an effort override'
        : `Must be one of: ${entry.efforts.join(', ')}`;
    throw new LaunchSettingsError(`Effort "${effort}" is not allowed for model "${entry.model}". ${allowed}`);
  }

  return { agent, model, effort };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/claudePromptBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/board/claudePromptBuilder.ts tests/board/claudePromptBuilder.test.ts
git commit -m "feat(board): add resolveLaunchSettings resolving cli from the model catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 4: `PtySessionService.startProcess` に末尾引数 `agent` を追加

**Files:**
- Modify: `src/terminal/PtySessionService.ts:448-454`
- Test: `tests/terminal/PtySessionService.test.ts:655-681` の describe に追記

**Interfaces:**
- Consumes: `AgentTool`（`src/db/config.ts:5`。`src/terminal/PtySessionService.ts:10-16` で既に import 済み）
- Produces: `startProcess(taskId: number, prompt: string, command?: string, model?: string, effort?: string, agent?: AgentTool): Promise<void>` — `agent` 省略時は従来どおり `resolveAgentTool(loadConfig())`

現状（`src/terminal/PtySessionService.ts:448-454`）:

```typescript
  async startProcess(taskId: number, prompt: string, command = 'run', model?: string, effort?: string): Promise<void> {
    if (this.sessions.has(taskId)) {
      throw new ConflictError(`Process for taskId ${taskId} is already running`);
    }

    const config = loadConfig();
    const agent = resolveAgentTool(config);
```

`agent` 変数を作ったあとの分岐（hooks 注入の claude 限定 `:457`、`buildAgentArgs` `:461`、bin 選択 `:465`、prompt 注入方式 `:515`）は変更不要。

- [ ] **Step 1: 失敗するテストを書く**

`tests/terminal/PtySessionService.test.ts` の `describe('PtySessionService - model/effort/boardApiUrl args', ...)` 内、`passes --model and --effort to spawn when provided` の it（`tests/terminal/PtySessionService.test.ts:673-681`）の直後に追加する。

```typescript
  it('spawns the agent passed as the trailing argument instead of the configured one', async () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({});
    const svc = new PtySessionService();
    await svc.startProcess(1, 'Task ID: 1', 'run', 'gpt-5.6-sol', 'high', 'codex');

    expect(spawnMock.mock.calls[0][0]).toBe('codex');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toEqual([
      '--model',
      'gpt-5.6-sol',
      '--config',
      'model_reasoning_effort="high"',
      '--ask-for-approval',
      'on-request',
      '--sandbox',
      'workspace-write',
      '--',
      'Task ID: 1',
    ]);
  });

  it('falls back to the configured agent when the trailing argument is omitted', async () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({ agent: 'codex' });
    const svc = new PtySessionService();
    await svc.startProcess(1, 'prompt', 'run', 'gpt-5.6-sol', 'high');

    expect(spawnMock.mock.calls[0][0]).toBe('codex');
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/terminal/PtySessionService.test.ts -t 'trailing argument'`
Expected: FAIL（`Expected 5 arguments, but got 6` の型エラー、または `expected 'claude' to be 'codex'`）

- [ ] **Step 3: 引数を追加する**

`src/terminal/PtySessionService.ts:448-454` を次に置き換える。

```typescript
  async startProcess(
    taskId: number,
    prompt: string,
    command = 'run',
    model?: string,
    effort?: string,
    agentOverride?: AgentTool
  ): Promise<void> {
    if (this.sessions.has(taskId)) {
      throw new ConflictError(`Process for taskId ${taskId} is already running`);
    }

    const config = loadConfig();
    // A task whose model override selects another cli passes it explicitly;
    // without one the project-wide `agent:` setting applies.
    const agent = agentOverride ?? resolveAgentTool(config);
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/terminal/PtySessionService.test.ts`
Expected: PASS

- [ ] **Step 5: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/terminal/PtySessionService.ts tests/terminal/PtySessionService.test.ts
git commit -m "feat(terminal): let startProcess take an explicit agent override

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 5: `claudeRoutes` を `resolveLaunchSettings` に切り替える

**Files:**
- Modify: `src/board/routes/claudeRoutes.ts:8-14`（import）, `:42-51`
- Test: `tests/board/claudeRoutes.test.ts`

**Interfaces:**
- Consumes: `resolveLaunchSettings` / `LaunchSettingsError`（Task 3）、`startProcess(..., agent?)`（Task 4）
- Produces: なし（ルートの挙動変更のみ）。`POST /api/claude/tasks/:taskId/run` は `LaunchSettingsError` を 400、その他の解決エラーを 500 で返す

現状（`src/board/routes/claudeRoutes.ts:42-51`）:

```typescript
    const { model, effort } = resolveModelAndEffort(ts, taskId, command);
    if (effort && !isValidEffortLevel(effort)) {
      return c.json(
        { error: `Invalid effort level "${effort}". Must be one of: ${VALID_EFFORT_LEVELS.join(', ')}` },
        400
      );
    }

    try {
      await claudeProcess.startProcess(taskId, prompt, command, model, effort);
```

- [ ] **Step 1: 既存の startProcess 呼び出しアサーションに `agent` を足す（codemod）**

`tests/board/claudeRoutes.test.ts` の `startProcess` 呼び出しアサーションは複数行 7 箇所（`:111`, `:135`, `:159`, `:240`, `:292`, `:322`, `:348`）と 1 行 1 箇所（`:273`）。以下の 2 コマンドで機械的に 6 番目の引数を足す。

```bash
perl -0pi -e "s/(startProcess\)(?:\.not)?\.toHaveBeenCalledWith\(\n(?:.*\n)*?)([^\n]*)\n(\s*)\);/\$1\$2,\n\$3  'claude'\n\$3);/g" tests/board/claudeRoutes.test.ts
sed -i "s/'run', 'gpt-codex', 'high');/'run', 'gpt-codex', 'high', 'codex');/" tests/board/claudeRoutes.test.ts
```

Run: `git diff --stat tests/board/claudeRoutes.test.ts`
Expected: 8 箇所が変更されている（`8 insertions` 相当。`grep -c "'claude'$" tests/board/claudeRoutes.test.ts` が `7` を返す）

- [ ] **Step 2: 400 系の 2 テストを新しい仕様に書き換える**

`tests/board/claudeRoutes.test.ts:357-395`（Step 1 の codemod で行番号は +7 ずれる。it 名で特定すること）の 2 つの it（`returns 400 when the task-level effort override is invalid` と `returns 400 when effort is an invalid value`）は、新仕様では 400 にならない（どちらもカタログ行を特定できない effort なので素通しになる）。この 2 つを次の 4 つに差し替える。

```typescript
  it('returns 400 when the task-level model is not in the catalog', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Unknown Model Task', status: 'backlog' });
    services.ts.updateTask(task.id, { model_run: 'gpt-5' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/is not in modelCatalog/);
    expect(mock.startProcess).not.toHaveBeenCalled();
  });

  it('returns 400 when the task-level effort is not allowed for the task-level model', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Bad Effort Pair Task', status: 'backlog' });
    services.ts.updateTask(task.id, { model_run: 'opus', effort_run: 'none' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/is not allowed for model "opus"/);
  });

  it('passes a config effort through unvalidated when the config model is not in the catalog', async () => {
    fs.writeFileSync(TEST_AGKAN_CONFIG, yaml.dump({ models: { run: { model: 'claude-sonnet-4-6', effort: 'ultra' } } }));
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Passthrough Effort Task', status: 'backlog' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(res.status).toBe(201);
    expect(mock.startProcess).toHaveBeenCalledWith(
      task.id,
      expect.any(String),
      'run',
      'claude-sonnet-4-6',
      'ultra',
      'claude'
    );
  });

  it('passes the cli of the task-level model row to startProcess', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Codex Model Task', status: 'backlog' });
    services.ts.updateTask(task.id, { model_run: 'gpt-5.6-sol', effort_run: 'none' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(res.status).toBe(201);
    expect(mock.startProcess).toHaveBeenCalledWith(
      task.id,
      expect.any(String),
      'run',
      'gpt-5.6-sol',
      'none',
      'codex'
    );
  });

  it('returns 500 when the configured modelCatalog is invalid', async () => {
    fs.writeFileSync(TEST_AGKAN_CONFIG, yaml.dump({ modelCatalog: 'claude' }));
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Broken Catalog Task', status: 'backlog' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Invalid modelCatalog/);
  });
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/board/claudeRoutes.test.ts`
Expected: FAIL（新旧どちらの経路もまだ 5 引数で `startProcess` を呼ぶため、`toHaveBeenCalledWith` が全滅する）

- [ ] **Step 4: ルートを書き換える**

`src/board/routes/claudeRoutes.ts:8-14` の import を次に置き換える。

```typescript
import {
  parseClaudeCommand,
  buildClaudePrompt,
  resolveLaunchSettings,
  LaunchSettingsError,
  type LaunchSettings,
} from '../claudePromptBuilder';
```

`src/board/routes/claudeRoutes.ts:42-51` を次に置き換える（`:50` の `try {` から始まる startProcess ブロックの 1 行目も含む）。

```typescript
    let agent: LaunchSettings['agent'];
    let model: string | undefined;
    let effort: string | undefined;
    try {
      ({ agent, model, effort } = resolveLaunchSettings(ts, taskId, command));
    } catch (e) {
      if (e instanceof LaunchSettingsError) {
        return c.json({ error: e.message }, 400);
      }
      console.error(`[boardRoutes] failed to resolve launch settings for taskId=${taskId}:`, e);
      return c.json({ error: e instanceof Error ? e.message : 'Failed to resolve launch settings' }, 500);
    }

    try {
      await claudeProcess.startProcess(taskId, prompt, command, model, effort, agent);
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/claudeRoutes.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/board/routes/claudeRoutes.ts tests/board/claudeRoutes.test.ts
git commit -m "feat(board): resolve the run route's cli/model/effort from the model catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 6: `BulkRunService` の切り替えと `resolveModelAndEffort` の削除

**Files:**
- Modify: `src/board/BulkRunService.ts:1-5`, `:19-32`, `:48-58`, `:75-104`, `:138-178`
- Modify: `src/board/claudePromptBuilder.ts:52-81`（`ResolvedModelEffort` / `resolveModelAndEffort` を削除）
- Test: `tests/board/bulkRunService.test.ts`, `tests/board/claudePromptBuilder.test.ts:112-177`（`resolveModelAndEffort` の describe を削除）

**Interfaces:**
- Consumes: `resolveLaunchSettings` / `LaunchSettingsError`（Task 3）、`startProcess(..., agent?)`（Task 4）
- Produces: なし（`resolveModelAndEffort` と `ResolvedModelEffort` は以後存在しない）

現状の `buildLaunchParams` / `launchTask`（`src/board/BulkRunService.ts:138-178`）は resolve 結果を 4 値で返し、`startProcess` に 5 引数で渡している。resolve が throw するようになるため、**そのタスクをスキップして次へ進む**必要がある。`selectNextTask`（`src/board/BulkRunService.ts:75-104`）は `status: 'ready'` のタスクを毎回選び直すので、スキップ済み ID を覚えないと同じタスクを無限に選び続ける（`advance()` → `runNext()` → 同じタスク）。スキップ集合を持たせる。

- [ ] **Step 1: 失敗するテストを書く**

まず既存の 18 箇所のアサーションに 6 番目の引数を足す（複数行 2 箇所 `:71`, `:234` と 1 行 16 箇所）。

```bash
perl -0pi -e "s/(startProcess\)(?:\.not)?\.toHaveBeenCalledWith\(\n(?:.*\n)*?)([^\n]*)\n(\s*)\);/\$1\$2,\n\$3  'claude'\n\$3);/g" tests/board/bulkRunService.test.ts
sed -i "s/'run', undefined, undefined);/'run', undefined, undefined, 'claude');/g; s/'run', undefined, 'xhigh');/'run', undefined, 'xhigh', 'claude');/g; s/'run', 'opus', undefined);/'run', 'opus', undefined, 'claude');/g" tests/board/bulkRunService.test.ts
```

Run: `grep -c "'claude'" tests/board/bulkRunService.test.ts`
Expected: `18`

次に `describe('BulkRunService model/effort override resolution', ...)`（codemod 前の `tests/board/bulkRunService.test.ts:559-634`。codemod で行番号は +2 ずれる）の末尾、`ignores task-level overrides when constructed without a task service` の it の直後に以下を追加する。

```typescript
  it('passes the cli of the task-level model row to startProcess', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'Codex Task', status: 'ready', priority: 'high' });
    ts.updateTask(task.id, { model_run: 'gpt-5.6-sol', effort_run: 'none' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty, ts);

    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(task.id, expect.any(String), 'run', 'gpt-5.6-sol', 'none', 'codex');

    service.stop();
  });

  it('skips a task whose model is not in the catalog and moves on to the next one', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const broken = ts.createTask({ title: 'Broken Model Task', status: 'ready', priority: 'critical' });
    ts.updateTask(broken.id, { model_run: 'gpt-5' });
    const healthy = ts.createTask({ title: 'Healthy Task', status: 'ready', priority: 'high' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty, ts);

    await service.start('direct');

    expect(startProcess).toHaveBeenCalledTimes(1);
    expect(startProcess).toHaveBeenCalledWith(healthy.id, expect.any(String), 'run', undefined, undefined, 'claude');

    service.stop();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/board/bulkRunService.test.ts`
Expected: FAIL（`startProcess` がまだ 5 引数で呼ばれる。`skips a task whose model is not in the catalog` はタイムアウトまたは 0 回呼び出しで失敗）

- [ ] **Step 3: `BulkRunService` を書き換える**

`src/board/BulkRunService.ts:5` の import を置き換える。

```typescript
import { resolveLaunchSettings } from './claudePromptBuilder';
import type { AgentTool } from '../db/config';
```

`src/board/BulkRunService.ts:17` の `const POLL_INTERVAL_MS = 3000;` の直後に型を足す。

```typescript
interface LaunchParams {
  prompt: string;
  ptyCommand: 'pr' | 'run';
  model: string | undefined;
  effort: string | undefined;
  agent: AgentTool;
}
```

`src/board/BulkRunService.ts:25` の `private pollTimer` 宣言の直後にフィールドを足す。

```typescript
  // Tasks whose launch settings could not be resolved. Without this the loop
  // would re-select the same still-'ready' task forever.
  private skippedTaskIds = new Set<number>();
```

`start()`（`src/board/BulkRunService.ts:48-58`）の `this.stopRequested = false;`（`:54`）の直後に 1 行足す。

```typescript
    this.skippedTaskIds.clear();
```

`selectNextTask()` の `const available = tasks.filter((task) => {`（`src/board/BulkRunService.ts:88`）の直後に 1 行足す。

```typescript
      if (this.skippedTaskIds.has(task.id)) return false;
```

`buildLaunchParams` / `launchTask`（`src/board/BulkRunService.ts:138-194`）を次に置き換える。

```typescript
  private buildLaunchParams(taskId: number): LaunchParams {
    const command = this.command!;
    const ptyCommand: 'pr' | 'run' = command === 'pr' ? 'pr' : 'run';
    const exitInstruction =
      "\n\nWhen you have completed this task, send 'exit' as a prompt (not as a bash command) to end this session.";
    const prompt =
      command === 'pr'
        ? `Task ID: ${taskId}\n/agkan-subtask${exitInstruction}`
        : `Task ID: ${taskId}\n/agkan-subtask-direct${exitInstruction}`;
    const { agent, model, effort } = resolveLaunchSettings(this.taskService, taskId, 'run');
    return { prompt, ptyCommand, model, effort, agent };
  }

  private async launchTask(taskId: number): Promise<void> {
    // Track whether runNext has already been called to prevent duplicate invocations.
    let advanced = false;
    const advance = (): void => {
      if (!advanced) {
        advanced = true;
        void this.runNext();
      }
    };

    let params: LaunchParams;
    try {
      params = this.buildLaunchParams(taskId);
    } catch (e) {
      console.error(
        `[BulkRunService] skipping taskId=${taskId}: ${e instanceof Error ? e.message : String(e)}`
      );
      this.skippedTaskIds.add(taskId);
      advance();
      return;
    }
    const { prompt, ptyCommand, model, effort, agent } = params;

    try {
      await this.claudeProcess.startProcess(taskId, prompt, ptyCommand, model, effort, agent);
    } catch {
      advance();
      return;
    }

    // subscribeOutput always fires the callback (done or error) even when the session
    // has already exited (fixed in PtySessionService), so the loop is guaranteed to proceed.
    // Use let so the callback can safely reference unsubscribe even when the callback fires
    // synchronously before the assignment completes (fast-exit / no-session path).
    let unsubscribe: (() => void) | undefined;
    unsubscribe = this.claudeProcess.subscribeOutput(taskId, (evt) => {
      if (evt.kind === 'done' || evt.kind === 'error') {
        if (evt.kind === 'done' && evt.exitCode === 0 && !this.claudeProcess.isExplicitUserStop(taskId)) {
          this.ts.updateTask(taskId, { status: 'done' });
        }
        unsubscribe?.();
        advance();
      }
    });
  }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/bulkRunService.test.ts`
Expected: PASS

- [ ] **Step 5: `resolveModelAndEffort` を削除する**

`src/board/claudePromptBuilder.ts:52-81`（`ResolvedModelEffort` インターフェースから `resolveModelAndEffort` の閉じ括弧まで）を削除する。削除後、`TaskService` の import（`src/board/claudePromptBuilder.ts:6`）は `resolveLaunchSettings` がまだ使うので残す。

`tests/board/claudePromptBuilder.test.ts:112-177` の `describe('resolveModelAndEffort', ...)` 全体を削除し、import 文からも `resolveModelAndEffort` を外す。削除後の import は次になる（`persistTaskModelOverrides` / `persistTaskEffortOverrides` は使われなくなるので、その import 行 `tests/board/claudePromptBuilder.test.ts:14` も削除する）。

```typescript
import {
  parseClaudeCommand,
  buildClaudePrompt,
  isValidEffortLevel,
  VALID_EFFORT_LEVELS,
  isValidModelAlias,
  MODEL_ALIASES,
  resolveLaunchSettings,
  LaunchSettingsError,
} from '../../src/board/claudePromptBuilder';
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/claudePromptBuilder.test.ts tests/board/bulkRunService.test.ts tests/board/claudeRoutes.test.ts`
Expected: PASS

- [ ] **Step 7: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/board/BulkRunService.ts src/board/claudePromptBuilder.ts tests/board/bulkRunService.test.ts tests/board/claudePromptBuilder.test.ts
git commit -m "feat(board): resolve bulk run launches from the model catalog and drop resolveModelAndEffort

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 7: Board API の書き込み時バリデーションをカタログ基準にする

**Files:**
- Modify: `src/board/routes/taskRoutes.ts:1-10`(import), `:85-111`, `:130-131`, `:188-199`
- Test: `tests/board/boardRoutes.test.ts:349-378`, `:610-641` と追加

**Interfaces:**
- Consumes: `resolveModelCatalog` / `validateOverridePair`（Task 1）、`resolveAgentTool` / `loadConfig`（`src/db/config.ts:33-39,87-101`）、`Task`（`src/models/Task.ts:36-42` の 4 カラム）
- Produces: なし（`POST /api/tasks` / `PATCH /api/tasks/:id` の検証仕様の変更のみ）。PATCH は body にない側を保存済みの値で補って検証する

現状（`src/board/routes/taskRoutes.ts:85-111`）は `validateOverrideValues` が model/effort をそれぞれ独立に検証しており、ペアの概念がない。これを丸ごと置き換える。

- [ ] **Step 1: 失敗するテストを書く**

`tests/board/boardRoutes.test.ts:349-363` の `returns 400 for an invalid model alias and does not create the task` はメッセージが `/Invalid model/` のままで通る（変更不要）。`:365-378` の `returns 400 for an invalid effort level` はメッセージが変わるので `expect(data.error).toMatch(/Invalid effort level/);` を次に変更する。

```typescript
    expect(data.error).toMatch(/Invalid effort "ultra"/);
```

同様に `:627-641` の PATCH 版 `returns 400 for an invalid effort level on PATCH` の `toMatch(/Invalid effort level/)` も同じ文字列に変更する。

そのうえで、POST の describe（`accepts an empty string override as a clear instruction` の it、`tests/board/boardRoutes.test.ts:380-395` の直後）に以下を追加する。

```typescript
  it('accepts a codex model from the catalog together with a codex-only effort', async () => {
    const services = buildServices();
    const app = buildApp(services);
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Codex Task', models: { run: 'gpt-5.6-sol' }, efforts: { run: 'none' } }),
      })
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as { model_run: string | null; effort_run: string | null };
    expect(created.model_run).toBe('gpt-5.6-sol');
    expect(created.effort_run).toBe('none');
  });

  it('returns 400 when the effort does not belong to the selected model row', async () => {
    const services = buildServices();
    const app = buildApp(services);
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Mismatched', models: { run: 'opus' }, efforts: { run: 'none' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Invalid effort "none" for model "opus"/);
    expect(services.ts.listTasks()).toHaveLength(0);
  });
```

PATCH の describe（`returns 400 for an invalid effort level on PATCH` の it、`tests/board/boardRoutes.test.ts:627-641` の直後、`});` で describe が閉じる直前）に以下を追加する。

```typescript
  it('validates a new model against the stored effort', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Stored Effort', status: 'backlog', effort_run: 'max' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: { run: 'gpt-5.6-sol' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Invalid effort "max" for model "gpt-5.6-sol"/);
    expect(services.ts.getTask(task.id)!.model_run).toBeNull();
  });

  it('validates a new effort against the stored model', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Stored Model', status: 'backlog', model_run: 'opus' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efforts: { run: 'none' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Invalid effort "none" for model "opus"/);
  });

  it('accepts a new model/effort pair that clears the stored effort in the same request', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Swap', status: 'backlog', model_run: 'opus', effort_run: 'max' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: { run: 'gpt-5.6-sol' }, efforts: { run: '' } }),
      })
    );
    expect(res.status).toBe(200);
    const updated = services.ts.getTask(task.id)!;
    expect(updated.model_run).toBe('gpt-5.6-sol');
    expect(updated.effort_run).toBeNull();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/board/boardRoutes.test.ts`
Expected: FAIL（`Invalid effort "ultra"` を期待する 2 件、`validates a new model against the stored effort` など 4 件）

- [ ] **Step 3: `taskRoutes.ts` を書き換える**

`src/board/routes/taskRoutes.ts:10` の import 行を次の 2 行に置き換える。

```typescript
import { loadConfig, resolveAgentTool } from '../../db/config';
import { resolveModelCatalog, validateOverridePair } from '../../db/modelCatalog';
```

`src/board/routes/taskRoutes.ts:85-111`（`validateOverrideValues` と `validateOverrideBody`）を次に置き換える。

```typescript
type StoredOverrides = {
  model_planning?: string | null;
  model_run?: string | null;
  effort_planning?: string | null;
  effort_run?: string | null;
};

/**
 * Read one override value out of a request body's `models` / `efforts` object.
 * Returns undefined when the key is absent (fall back to the stored value);
 * an empty string when present but empty or non-string (the "clear" instruction).
 */
function readOverride(rawValues: unknown, kind: 'planning' | 'run'): string | undefined {
  if (!rawValues || typeof rawValues !== 'object') return undefined;
  const values = rawValues as Record<string, unknown>;
  if (!(kind in values)) return undefined;
  const raw = values[kind];
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Validate the effective model/effort pair for each kind after the write.
 * `stored` supplies the current values for PATCH; omit it for POST.
 */
function validateOverrideBody(body: { models?: unknown; efforts?: unknown }, stored?: StoredOverrides): string | undefined {
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultCli = resolveAgentTool(config);
  const pairs = [
    {
      model: readOverride(body.models, 'planning') ?? stored?.model_planning ?? null,
      effort: readOverride(body.efforts, 'planning') ?? stored?.effort_planning ?? null,
    },
    {
      model: readOverride(body.models, 'run') ?? stored?.model_run ?? null,
      effort: readOverride(body.efforts, 'run') ?? stored?.effort_run ?? null,
    },
  ];
  for (const pair of pairs) {
    const error = validateOverridePair(catalog, defaultCli, pair.model, pair.effort);
    if (error) return error;
  }
  return undefined;
}
```

POST 側（`src/board/routes/taskRoutes.ts:130-131`）はそのままで動く（`stored` を渡さない）。

PATCH 側（`src/board/routes/taskRoutes.ts:191-196`）を次に置き換える。

```typescript
    const body = await c.req.json<TaskPatchBody>();
    const { input, error } = buildTaskUpdateInput(body);
    if (error) return c.json({ error }, 400);
    const stored = ts.getTask(id);
    if (!stored) return c.json({ error: 'Task not found' }, 404);
    const overrideError = validateOverrideBody(body, stored);
    if (overrideError) return c.json({ error: overrideError }, 400);
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/boardRoutes.test.ts`
Expected: PASS

- [ ] **Step 5: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/board/routes/taskRoutes.ts tests/board/boardRoutes.test.ts
git commit -m "feat(board): validate task model/effort writes against the model catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 8: CLI の検証・ヘルプをカタログ基準にし、旧定数を削除する

**Files:**
- Modify: `src/cli/commands/task/add-helpers.ts:13-18`, `:101-126`
- Modify: `src/cli/commands/task/add.ts:24-26`, `:52-55`
- Modify: `src/cli/commands/task/update-helpers.ts:10-15`, `:80-107`, `:156-166`, `:249-253`
- Modify: `src/cli/commands/task/update.ts:14-22`, `:67-73`, `:111-120`
- Modify: `src/board/claudePromptBuilder.ts:35-50`（旧定数と判定関数を削除）
- Test: `tests/cli/commands/task/add.test.ts:691-713`, `tests/cli/commands/task/update.test.ts:996-1051`, `tests/board/claudePromptBuilder.test.ts:81-110`（旧定数の describe を削除）

**Interfaces:**
- Consumes: `resolveModelCatalog` / `effortsForDefaultCli` / `validateOverridePair` / `DEFAULT_MODEL_CATALOG`（Task 1）
- Produces:
  - `modelEffortHelpText(): { models: string; efforts: string }`（`src/cli/commands/task/add-helpers.ts` から export。`--model-*` / `--effort-*` のヘルプ文言用）
  - `validateModelEffortOptions(options: ModelEffortOptions): string | null`（シグネチャは据え置き、中身をカタログ基準に）
  - `validateModelEffortUpdate(updateInput: Record<string, string>, stored: Task): string | null`（`src/cli/commands/task/update-helpers.ts` から export）
  - `MODEL_ALIASES` / `isValidModelAlias` / `VALID_EFFORT_LEVELS` / `isValidEffortLevel` は以後存在しない

- [ ] **Step 1: 失敗するテストを書く**

`tests/cli/commands/task/add.test.ts:691-713` の 2 つの it のアサーションを、共有バリデータのメッセージに合わせて書き換える。

```typescript
    it('should reject an invalid model alias and not create the task', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Bad Model', '--model-run', 'gpt-5']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid model "gpt-5"');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject an invalid effort level and not create the task', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Bad Effort',
        '--effort-planning',
        'ultra',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort "ultra"');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should accept a codex model from the catalog with a codex-only effort', async () => {
      const { exitCode } = await runCommand(program, [
        'task',
        'add',
        'Codex Task',
        '--model-run',
        'gpt-5.6-sol',
        '--effort-run',
        'none',
      ]);
      expect(exitCode).toBeUndefined();

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks[0].model_run).toBe('gpt-5.6-sol');
      expect(tasks[0].effort_run).toBe('none');
    });

    it('should reject an effort that does not belong to the selected model row', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Mismatched',
        '--model-run',
        'opus',
        '--effort-run',
        'none',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort "none" for model "opus"');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });
```

`tests/cli/commands/task/update.test.ts:996-1051` の 3 つの it（`should reject an invalid model alias` / `should reject an invalid effort level` / `should reject an invalid value with positional syntax`）のメッセージ期待値を書き換え、保存済み値とのマージを検証する it を 2 つ足す。

```typescript
    it('should reject an invalid model alias', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Invalid model test' });

      const { exitCode, errors } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--model-run',
        'gpt-5',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid model "gpt-5"');
      expect(taskService.getTask(task.id)?.model_run).toBeNull();
    });

    it('should reject an invalid effort level', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Invalid effort test' });

      const { exitCode, errors } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--effort-run',
        'ultra',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort "ultra"');
      expect(taskService.getTask(task.id)?.effort_run).toBeNull();
    });

    it('should validate a new model against the stored effort', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Stored effort test', effort_run: 'max' });

      const { exitCode, errors } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--model-run',
        'gpt-5.6-sol',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort "max" for model "gpt-5.6-sol"');
      expect(taskService.getTask(task.id)?.model_run).toBeNull();
    });

    it('should accept a model/effort swap sent in one command', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Swap test', model_run: 'opus', effort_run: 'max' });

      const { exitCode } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--model-run',
        'gpt-5.6-sol',
        '--effort-run',
        'none',
      ]);
      expect(exitCode).toBeUndefined();

      const updated = taskService.getTask(task.id);
      expect(updated?.model_run).toBe('gpt-5.6-sol');
      expect(updated?.effort_run).toBe('none');
    });

    it('should update an override with positional syntax', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Positional test' });

      const { exitCode } = await runCommand(program, ['task', 'update', String(task.id), 'model_run', 'haiku']);
      expect(exitCode).toBeUndefined();

      expect(taskService.getTask(task.id)?.model_run).toBe('haiku');
    });

    it('should reject an invalid value with positional syntax', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Positional invalid test' });

      const { exitCode, errors } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'effort_planning',
        'ultra',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort "ultra"');
    });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/add.test.ts tests/cli/commands/task/update.test.ts`
Expected: FAIL（`Invalid model "gpt-5"` 等を含まない、`should validate a new model against the stored effort` が exitCode undefined）

- [ ] **Step 3: `add-helpers.ts` を書き換える**

`src/cli/commands/task/add-helpers.ts:13-18` の import を次に置き換える。

```typescript
import { loadConfig, resolveAgentTool } from '../../../db/config';
import {
  DEFAULT_MODEL_CATALOG,
  resolveModelCatalog,
  effortsForDefaultCli,
  validateOverridePair,
} from '../../../db/modelCatalog';
```

`src/cli/commands/task/add-helpers.ts:108-126`（`validateModelEffortOptions` の JSDoc と本体）を次に置き換える。`ModelEffortOptions`（`:101-106`）はそのまま残す。

```typescript
/**
 * Values used in the --model-* / --effort-* help strings.
 * Falls back to the built-in catalog when .agkan.yml cannot be resolved, so a
 * broken config never stops the whole CLI from registering its commands.
 */
export function modelEffortHelpText(): { models: string; efforts: string } {
  try {
    const config = loadConfig();
    const catalog = resolveModelCatalog(config);
    return {
      models: catalog.map((entry) => entry.model).join(', '),
      efforts: effortsForDefaultCli(catalog, resolveAgentTool(config)).join(', '),
    };
  } catch {
    return {
      models: DEFAULT_MODEL_CATALOG.map((entry) => entry.model).join(', '),
      efforts: effortsForDefaultCli(DEFAULT_MODEL_CATALOG, 'claude').join(', '),
    };
  }
}

/**
 * Validate the four task-level model/effort override flags against the model catalog.
 * planning and run are checked as pairs: the effort must belong to the row the
 * model selects, or to the default cli's union when no model was given.
 * @returns Error message for the first invalid pair, or null when all are valid
 */
export function validateModelEffortOptions(options: ModelEffortOptions): string | null {
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultCli = resolveAgentTool(config);
  return (
    validateOverridePair(catalog, defaultCli, options.modelPlanning, options.effortPlanning) ??
    validateOverridePair(catalog, defaultCli, options.modelRun, options.effortRun) ??
    null
  );
}
```

- [ ] **Step 4: `add.ts` のヘルプ文言を差し替える**

`src/cli/commands/task/add.ts:16-26` の import ブロックを次に置き換える（`MODEL_ALIASES` / `VALID_EFFORT_LEVELS` の import 行 `:26` を削除し、`modelEffortHelpText` を足す）。

```typescript
import {
  readBodyFromFile,
  parseBlockIds,
  resolveTagIds,
  addBlockRelationships,
  fetchRelatedTasks,
  buildTaskJsonData,
  printTaskCreated,
  validateModelEffortOptions,
  modelEffortHelpText,
} from './add-helpers';
```

`setupTaskAddCommand` の本体先頭（`src/cli/commands/task/add.ts:32-35` の `if (!taskCommand) { ... }` の直後）に 1 行足す。

```typescript
  const help = modelEffortHelpText();
```

`src/cli/commands/task/add.ts:52-55` の 4 つの `.option(...)` を次に置き換える。

```typescript
    .option('--model-planning <model>', `Model for planning runs (${help.models})`)
    .option('--model-run <model>', `Model for implementation runs (${help.models})`)
    .option('--effort-planning <level>', `Reasoning effort for planning runs (${help.efforts})`)
    .option('--effort-run <level>', `Reasoning effort for implementation runs (${help.efforts})`)
```

- [ ] **Step 5: `update-helpers.ts` を書き換える**

`src/cli/commands/task/update-helpers.ts:10-15` の import を次に置き換える。

```typescript
import type { Task } from '../../../models';
import { loadConfig, resolveAgentTool } from '../../../db/config';
import { resolveModelCatalog, validateOverridePair } from '../../../db/modelCatalog';
```

`src/cli/commands/task/update-helpers.ts:80-107`（`validateModelAlias` / `validateEffortLevel` の JSDoc と本体、および `MODEL_FIELDS` / `EFFORT_FIELDS`）を次に置き換える。この 4 つは `update-helpers.ts` の外から参照されていない（`grep -rn "validateModelAlias\|validateEffortLevel\|MODEL_FIELDS\|EFFORT_FIELDS" src/ tests/` が同ファイル以外を返さない）。

```typescript
/**
 * Validate the effective model/effort pairs after this update is applied.
 * Values absent from `updateInput` fall back to what is already stored on the task.
 * @returns Error message for the first invalid pair, or null when all are valid
 */
export function validateModelEffortUpdate(updateInput: Record<string, string>, stored: Task): string | null {
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultCli = resolveAgentTool(config);
  const pairs = [
    {
      model: updateInput.model_planning ?? stored.model_planning,
      effort: updateInput.effort_planning ?? stored.effort_planning,
    },
    { model: updateInput.model_run ?? stored.model_run, effort: updateInput.effort_run ?? stored.effort_run },
  ];
  for (const pair of pairs) {
    const error = validateOverridePair(catalog, defaultCli, pair.model, pair.effort);
    if (error) return error;
  }
  return null;
}
```

`buildFlagModeInput` のループ（`src/cli/commands/task/update-helpers.ts:156-164`）から model/effort の行 2 本を削除する。

```typescript
  const updateInput: Record<string, string> = {};
  for (const [key, val] of Object.entries(flagFields)) {
    if (val === undefined) continue;
    if (key === 'status' && !validateStatus(val, formatter)) return null;
    if (key === 'priority' && !validatePriority(val, formatter)) return null;
    updateInput[key] = val;
  }
  return updateInput;
```

`buildPositionalModeInput`（`src/cli/commands/task/update-helpers.ts:246-253`）からも同じ 2 行を削除する。

```typescript
  if (!validateFieldName(field, formatter)) return null;
  const resolvedValue = resolvePositionalValue(field, value, options, formatter);
  if (resolvedValue === null) return null;
  if (field === 'status' && !validateStatus(resolvedValue, formatter)) return null;
  if (field === 'priority' && !validatePriority(resolvedValue, formatter)) return null;
  return { [field]: resolvedValue };
```

- [ ] **Step 6: `update.ts` に保存済み値とのマージ検証を挿す**

`src/cli/commands/task/update.ts:14-22` の import を次に置き換える。

```typescript
import {
  isFlagMode,
  buildFlagModeInput,
  buildPositionalModeInput,
  validateModelEffortUpdate,
  UpdateOptions,
  SUPPORTED_FIELDS,
} from './update-helpers';
import { notifyBoard } from '../../utils/boardNotify';
import { modelEffortHelpText } from './add-helpers';
```

`handleUpdateAction` の `if (updateInput === null) { process.exit(1); }`（`src/cli/commands/task/update.ts:70-72`）の直後に以下を挿入する。

```typescript
    const stored = taskService.getTask(taskId);
    if (stored) {
      const overrideError = validateModelEffortUpdate(updateInput, stored);
      if (overrideError) {
        formatter.error(overrideError, () => {
          console.error(chalk.red(`\n${overrideError}\n`));
        });
        process.exit(1);
        return;
      }
    }
```

`setupTaskUpdateCommand` の本体先頭（`src/cli/commands/task/update.ts:96-98` の `if (!taskCommand) { ... }` の直後）に 1 行足す。

```typescript
  const help = modelEffortHelpText();
```

`src/cli/commands/task/update.ts:111-120` の 4 つの `.option(...)` を次に置き換える。

```typescript
    .option('--model-planning <model>', `Update planning model (${help.models}, or empty to clear)`)
    .option('--model-run <model>', `Update run model (${help.models}, or empty to clear)`)
    .option('--effort-planning <level>', `Update planning reasoning effort (${help.efforts}, or empty to clear)`)
    .option('--effort-run <level>', `Update run reasoning effort (${help.efforts}, or empty to clear)`)
```

- [ ] **Step 7: 旧定数と旧テストを削除する**

`src/board/claudePromptBuilder.ts:35-50`（`VALID_EFFORT_LEVELS` / `isValidEffortLevel` / `MODEL_ALIASES` / `isValidModelAlias` とその JSDoc）を削除する。

`tests/board/claudePromptBuilder.test.ts:81-110` の 2 つの describe（`isValidEffortLevel / VALID_EFFORT_LEVELS` と `isValidModelAlias / MODEL_ALIASES`）を削除し、import からも 4 つの名前を外す。削除後の import は次になる。

```typescript
import {
  parseClaudeCommand,
  buildClaudePrompt,
  resolveLaunchSettings,
  LaunchSettingsError,
} from '../../src/board/claudePromptBuilder';
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/cli/commands/task/add.test.ts tests/cli/commands/task/update.test.ts tests/board/claudePromptBuilder.test.ts`
Expected: PASS

- [ ] **Step 9: 旧定数の参照が残っていないことを確認する**

Run: `grep -rn "MODEL_ALIASES\|VALID_EFFORT_LEVELS\|isValidModelAlias\|isValidEffortLevel\|resolveModelAndEffort" src/ tests/`
Expected: 出力なし

- [ ] **Step 10: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 11: コミット**

```bash
git add src/cli/commands/task/add-helpers.ts src/cli/commands/task/add.ts src/cli/commands/task/update-helpers.ts src/cli/commands/task/update.ts src/board/claudePromptBuilder.ts tests/cli/commands/task/add.test.ts tests/cli/commands/task/update.test.ts tests/board/claudePromptBuilder.test.ts
git commit -m "feat(cli): validate task model/effort flags against the model catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 9: Board のサーバー描画（`boardRenderer` の Add モーダルと configScript）

**Files:**
- Modify: `src/board/boardRenderer.ts:1-5`(import), `:104-120`, `:122-181`, `:258-269`, `:301-331`
- Modify: `src/board/routes/boardPageRoutes.ts:54-59`
- Test: `tests/board/boardRenderer.test.ts`

**Interfaces:**
- Consumes: `resolveModelCatalog` / `effortsForDefaultCli` / `ModelCatalogEntry`（Task 1）、`loadConfig` / `resolveAgentTool`（`src/db/config.ts:33-39,87-101`）
- Produces: 描画された HTML に `var modelCatalog = [...]` と `var defaultAgent = "..."` が含まれる（クライアントは `window.modelCatalog` / `window.defaultAgent` として読む）。Add モーダルの model / effort `<option>` はカタログ由来

現状の重複配列（`src/board/boardRenderer.ts:108-120`）は削除する。

```typescript
// Keep in sync with MODEL_ALIAS_OPTIONS in src/board/client/detailPanelHtml.ts
// (duplicated because the client bundle is compiled as a separate TS project).
const MODEL_ALIAS_OPTIONS = ['fable', 'opus', 'sonnet', 'haiku'];
const BOARD_MODEL_OPTIONS = MODEL_ALIAS_OPTIONS.map(
  (m) => `<option value="${m}">claude[${m.charAt(0).toUpperCase() + m.slice(1)}]</option>`
).join('\n          ');

// Keep in sync with EFFORT_OPTIONS in src/board/client/detailPanelHtml.ts
// (duplicated because the client bundle is compiled as a separate TS project).
const EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max'];
const BOARD_EFFORT_OPTIONS = EFFORT_OPTIONS.map(
  (e) => `<option value="${e}">${e.charAt(0).toUpperCase() + e.slice(1)}</option>`
).join('\n          ');
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/board/boardRenderer.test.ts` の import 群（`tests/board/boardRenderer.test.ts:5-18`）の直後に config モックを追加し、`renderBoard` を import する。モックは `tests/terminal/PtySessionService.test.ts:173-179` と同じ形にする。

```typescript
vi.mock('../../src/db/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/config')>();
  return { ...actual, loadConfig: vi.fn(() => ({})) };
});

import * as configModule from '../../src/db/config';
import { renderBoard } from '../../src/board/boardRenderer';
```

ファイル末尾に describe を追加する。

```typescript
describe('renderBoard model catalog wiring', () => {
  beforeEach(() => {
    vi.mocked(configModule.loadConfig).mockReturnValue({});
  });

  function render(): string {
    return renderBoard(buildTasksByStatus([]), new Map());
  }

  it('embeds the resolved catalog and default agent for the client bundle', () => {
    const html = render();
    expect(html).toContain('var defaultAgent = "claude";');
    expect(html).toContain('{"cli":"codex","model":"gpt-5.6-sol"');
  });

  it('renders one add-modal model option per catalog row, labelled cli[model]', () => {
    const html = render();
    expect(html).toContain('<option value="fable">claude[fable]</option>');
    expect(html).toContain('<option value="gpt-5.6-sol">codex[gpt-5.6-sol]</option>');
    expect(html).not.toContain('claude[Fable]');
  });

  it('seeds the add-modal effort options from the default cli union', () => {
    const html = render();
    expect(html).toContain('<option value="max">max</option>');
    expect(html).not.toContain('<option value="none">none</option>');
  });

  it('follows the configured agent when seeding the effort options', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({ agent: 'codex' });
    const html = render();
    expect(html).toContain('var defaultAgent = "codex";');
    expect(html).toContain('<option value="none">none</option>');
    expect(html).not.toContain('<option value="max">max</option>');
  });

  it('uses the configured catalog when one is set', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      modelCatalog: [{ cli: 'claude', model: 'only-one', efforts: ['high'] }],
    });
    const html = render();
    expect(html).toContain('<option value="only-one">claude[only-one]</option>');
    expect(html).not.toContain('claude[fable]');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/board/boardRenderer.test.ts`
Expected: FAIL（`var defaultAgent` を含まない、`claude[Fable]` が残っている）

- [ ] **Step 3: `boardRenderer.ts` を書き換える**

import（`src/board/boardRenderer.ts:1-5`）の末尾に 2 行足す。

```typescript
import { loadConfig, resolveAgentTool, type AgentTool } from '../db/config';
import { resolveModelCatalog, effortsForDefaultCli, type ModelCatalogEntry } from '../db/modelCatalog';
```

`src/board/boardRenderer.ts:108-120`（上に引用した 4 定数）を次に置き換える。

```typescript
function buildModelOptions(catalog: ModelCatalogEntry[]): string {
  return catalog
    .map((entry) => `<option value="${escapeHtml(entry.model)}">${escapeHtml(`${entry.cli}[${entry.model}]`)}</option>`)
    .join('\n          ');
}

function buildEffortOptions(efforts: string[]): string {
  return efforts.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('\n          ');
}
```

`getAddTaskModal()`（`src/board/boardRenderer.ts:122`）を引数付きにし、モーダル内の 4 箇所（`:148`, `:152`, `:159`, `:163`）で使うローカル変数を先頭で組む。

```typescript
function getAddTaskModal(catalog: ModelCatalogEntry[], defaultAgent: AgentTool): string {
  const modelOptions = buildModelOptions(catalog);
  // The model select starts on "Default (config)", so the initial effort list is
  // the union for the default cli. rebuildEffortOptions narrows it client-side.
  const effortOptions = buildEffortOptions(effortsForDefaultCli(catalog, defaultAgent));
  return `
```

そのうえで `${BOARD_MODEL_OPTIONS}`（`:148`, `:159`）を `${modelOptions}` に、`${BOARD_EFFORT_OPTIONS}`（`:152`, `:163`）を `${effortOptions}` に置き換える。

`getBoardBodyStatic()`（`src/board/boardRenderer.ts:258-269`）を次に置き換える。

```typescript
function getBoardBodyStatic(catalog: ModelCatalogEntry[], defaultAgent: AgentTool): string {
  const configScript = `var statusColors = ${JSON.stringify(STATUS_COLORS)};
    var allStatuses = ${JSON.stringify(STATUSES)};
    var statusLabels = ${JSON.stringify(STATUS_LABELS)};
    var allPriorities = ${JSON.stringify(PRIORITIES)};
    var modelCatalog = ${JSON.stringify(catalog)};
    var defaultAgent = ${JSON.stringify(defaultAgent)};`;

  return `${getAddTaskModal(catalog, defaultAgent)}${getContextMenuAndToast()}${getPurgeAndVersionModals()}
  <script>${configScript}
  </script>
  <link rel="stylesheet" href="/static/main.css">
  <script src="/static/main.js"></script>`;
}
```

`renderBoard`（`src/board/boardRenderer.ts:301-331`）の本体先頭、`const columns = ...`（`:308-310`）の直前に 3 行足し、`${getBoardBodyStatic()}`（`:327`）を `${getBoardBodyStatic(catalog, defaultAgent)}` に変える。

```typescript
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultAgent = resolveAgentTool(config);
```

- [ ] **Step 4: 描画時のカタログ不正を 500 にする**

`src/board/routes/boardPageRoutes.ts:54-59` の `/` ルートを次に置き換える。

```typescript
  app.get('/', (c) => {
    const tasksByStatus = buildTasksByStatus(ts.listTasks({ status: NON_ARCHIVE_STATUSES }, 'id', 'asc'));
    const boardConfig = readBoardConfig(configDir);
    const blockMap = buildBlockMap(tbs.getAllBlocks());
    try {
      return c.html(renderBoard(tasksByStatus, tts.getAllTaskTags(), boardTitle, boardConfig.theme, blockMap));
    } catch (e) {
      console.error('[boardPageRoutes] failed to render the board:', e);
      return c.text(e instanceof Error ? e.message : 'Failed to render the board', 500);
    }
  });
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/boardRenderer.test.ts tests/board/boardRoutes.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/board/boardRenderer.ts src/board/routes/boardPageRoutes.ts tests/board/boardRenderer.test.ts
git commit -m "feat(board): render the add-task modal options from the model catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 10: Board クライアント（`rebuildEffortOptions` と各セレクトのカタログ化）

**Files:**
- Create: `src/board/client/modelOptions.ts`
- Modify: `src/board/client/types.ts:3-10`
- Modify: `src/board/client/detailPanelHtml.ts:1-8`(import), `:94-100`, `:107-150`
- Modify: `src/board/client/detailPanel.ts:20-32`(import), `:435-447`
- Modify: `src/board/client/addTaskModal.ts:1-7`(import), `:241-262`, `:314-328`
- Test: `tests/board/client/modelOptions.test.ts`（新規）, `tests/board/client/detailPanelHtml.test.ts:26-35,575-625`, `tests/board/client/addTaskModal.test.ts`

**Interfaces:**
- Consumes: `window.modelCatalog` / `window.defaultAgent`（Task 9 が configScript で埋め込む）
- Produces（`src/board/client/modelOptions.ts`）:
  - `getModelCatalog(): ModelCatalogEntry[]`
  - `getDefaultAgent(): string`
  - `effortsForModel(model: string): string[]`
  - `rebuildEffortOptions(modelSelect: HTMLSelectElement, effortSelect: HTMLSelectElement): void`
  - `wireModelEffortSync(modelId: string, effortId: string): void`
- Produces（`src/board/client/types.ts`）: `export interface ModelCatalogEntry { cli: string; model: string; efforts: string[] }` と `Window.modelCatalog` / `Window.defaultAgent`

現状の重複配列（`src/board/client/detailPanelHtml.ts:94-100`）は削除する。`MODEL_PLANNING_METADATA_KEY` などの 4 定数（`:102-105`）は `:270-276` でまだ使われているので**残す**。

- [ ] **Step 1: 失敗するテストを書く（`modelOptions`）**

`tests/board/client/modelOptions.test.ts` を新規作成する。

```typescript
/**
 * @vitest-environment jsdom
 *
 * Tests for the client-side model catalog helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getModelCatalog, effortsForModel, rebuildEffortOptions, wireModelEffortSync } from '../../../src/board/client/modelOptions';

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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/board/client/modelOptions.test.ts`
Expected: FAIL（`Failed to resolve import "../../../src/board/client/modelOptions"`）

- [ ] **Step 3: `types.ts` にカタログの型と window 宣言を足す**

`src/board/client/types.ts:1-10` を次に置き換える。

```typescript
// Shared types for client-side board code

export interface ModelCatalogEntry {
  cli: string;
  model: string;
  efforts: string[];
}

declare global {
  interface Window {
    statusColors: Record<string, string>;
    allStatuses: string[];
    statusLabels: Record<string, string>;
    allPriorities: string[];
    modelCatalog: ModelCatalogEntry[];
    defaultAgent: string;
  }
}
```

- [ ] **Step 4: `src/board/client/modelOptions.ts` を実装する**

```typescript
// Client-side access to the model catalog embedded by boardRenderer's
// configScript (window.modelCatalog / window.defaultAgent), plus the
// model -> effort dropdown linkage shared by the add modal and detail panel.

import type { ModelCatalogEntry } from './types';

export function getModelCatalog(): ModelCatalogEntry[] {
  return window.modelCatalog ?? [];
}

export function getDefaultAgent(): string {
  return window.defaultAgent ?? 'claude';
}

/**
 * Effort values selectable for a model. An empty model means "Default (config)",
 * whose candidates are the union of every row belonging to the default cli.
 */
export function effortsForModel(model: string): string[] {
  const catalog = getModelCatalog();
  if (model) {
    const entry = catalog.find((e) => e.model === model);
    return entry ? [...entry.efforts] : [];
  }
  const agent = getDefaultAgent();
  const result: string[] = [];
  for (const entry of catalog) {
    if (entry.cli !== agent) continue;
    for (const effort of entry.efforts) {
      if (result.indexOf(effort) === -1) result.push(effort);
    }
  }
  return result;
}

/**
 * Rebuild an effort select's options for the currently selected model.
 * The current selection survives only when it is still a candidate.
 */
export function rebuildEffortOptions(modelSelect: HTMLSelectElement, effortSelect: HTMLSelectElement): void {
  const current = effortSelect.value;
  const efforts = effortsForModel(modelSelect.value);

  effortSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Effort: default';
  effortSelect.appendChild(defaultOption);
  efforts.forEach((effort) => {
    const option = document.createElement('option');
    option.value = effort;
    option.textContent = effort;
    effortSelect.appendChild(option);
  });

  effortSelect.value = efforts.indexOf(current) === -1 ? '' : current;
}

/** Wire a model select so changing it rebuilds its paired effort select. */
export function wireModelEffortSync(modelId: string, effortId: string): void {
  const modelSelect = document.getElementById(modelId) as HTMLSelectElement | null;
  const effortSelect = document.getElementById(effortId) as HTMLSelectElement | null;
  if (!modelSelect || !effortSelect) return;
  modelSelect.addEventListener('change', () => rebuildEffortOptions(modelSelect, effortSelect));
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/client/modelOptions.test.ts`
Expected: PASS（12 tests）

- [ ] **Step 6: 詳細パネルのセレクトの失敗するテストを書く**

`tests/board/client/detailPanelHtml.test.ts:26-35` の `setupWindowGlobals` に 2 行足す。

```typescript
  (window as unknown as Record<string, unknown>).modelCatalog = [
    { cli: 'claude', model: 'opus', efforts: ['low', 'high', 'max'] },
    { cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low'] },
  ];
  (window as unknown as Record<string, unknown>).defaultAgent = 'claude';
```

`describe('renderModelFields', ...)`（`tests/board/client/detailPanelHtml.test.ts:577`）の先頭に `beforeEach(setupWindowGlobals);` を追加し、既存 3 件のうち 1 件目（`pre-selects the model/effort dropdowns from the task columns when overrides are set`、`:578-594`）の `model_run: 'sonnet'` / `effort_run: 'low'` はカタログにない値になるので、そのまま「(not in catalog)」として選択済みになることを確認する形にする。describe 全体を次に置き換える。

```typescript
describe('renderModelFields', () => {
  beforeEach(setupWindowGlobals);

  it('pre-selects the model/effort dropdowns from the task columns when overrides are set', () => {
    const task = {
      ...makeTaskDetail().task,
      model_planning: 'opus',
      model_run: 'gpt-5.6-sol',
      effort_planning: 'high',
      effort_run: 'none',
    };
    const html = renderModelFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect((div.querySelector('#detail-edit-model-planning') as HTMLSelectElement).value).toBe('opus');
    expect((div.querySelector('#detail-edit-model-run') as HTMLSelectElement).value).toBe('gpt-5.6-sol');
    expect((div.querySelector('#detail-edit-effort-planning') as HTMLSelectElement).value).toBe('high');
    expect((div.querySelector('#detail-edit-effort-run') as HTMLSelectElement).value).toBe('none');
  });

  it('labels every model option as cli[model]', () => {
    const html = renderModelFields({ ...makeTaskDetail().task });
    const div = document.createElement('div');
    div.innerHTML = html;

    const labels = [...div.querySelectorAll('#detail-edit-model-run option')].map((o) => o.textContent);
    expect(labels).toEqual(['Default (config)', 'claude[opus]', 'codex[gpt-5.6-sol]']);
  });

  it('scopes the effort options to the selected model row', () => {
    const task = { ...makeTaskDetail().task, model_run: 'gpt-5.6-sol' };
    const html = renderModelFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    const values = [...div.querySelectorAll('#detail-edit-effort-run option')].map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'none', 'low']);
  });

  it('keeps a stored model that is not in the catalog visible and selected', () => {
    const task = { ...makeTaskDetail().task, model_run: 'sonnet', effort_run: 'ultra' };
    const html = renderModelFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    const modelSelect = div.querySelector('#detail-edit-model-run') as HTMLSelectElement;
    const effortSelect = div.querySelector('#detail-edit-effort-run') as HTMLSelectElement;
    expect(modelSelect.value).toBe('sonnet');
    expect(modelSelect.selectedOptions[0].textContent).toBe('(not in catalog) sonnet');
    expect(effortSelect.value).toBe('ultra');
    expect(effortSelect.selectedOptions[0].textContent).toBe('(not in catalog) ultra');
  });

  it('renders the default/empty option when the task has no overrides (null columns)', () => {
    const task = {
      ...makeTaskDetail().task,
      model_planning: null,
      model_run: null,
      effort_planning: null,
      effort_run: null,
    };
    const html = renderModelFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect((div.querySelector('#detail-edit-model-planning') as HTMLSelectElement).value).toBe('');
    expect((div.querySelector('#detail-edit-model-run') as HTMLSelectElement).value).toBe('');
    expect((div.querySelector('#detail-edit-effort-planning') as HTMLSelectElement).value).toBe('');
    expect((div.querySelector('#detail-edit-effort-run') as HTMLSelectElement).value).toBe('');
  });

  it('renders the default/empty option when the task has no overrides (undefined columns)', () => {
    const task = { ...makeTaskDetail().task };
    const html = renderModelFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect((div.querySelector('#detail-edit-model-planning') as HTMLSelectElement).value).toBe('');
    expect((div.querySelector('#detail-edit-model-run') as HTMLSelectElement).value).toBe('');
    expect((div.querySelector('#detail-edit-effort-planning') as HTMLSelectElement).value).toBe('');
    expect((div.querySelector('#detail-edit-effort-run') as HTMLSelectElement).value).toBe('');
  });
});
```

- [ ] **Step 7: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/board/client/detailPanelHtml.test.ts`
Expected: FAIL（`labels every model option as cli[model]` が `claude[Opus]` を返す、`(not in catalog)` が無い）

- [ ] **Step 8: `detailPanelHtml.ts` のセレクトをカタログ由来にする**

`src/board/client/detailPanelHtml.ts:4` の import 行の直後に 1 行足す。

```typescript
import { getModelCatalog, effortsForModel } from './modelOptions';
```

`src/board/client/detailPanelHtml.ts:94-100`（`MODEL_ALIAS_OPTIONS` と `EFFORT_OPTIONS` の 2 定数とコメント）を削除する。

`renderModelSelect` / `renderEffortSelect`（`src/board/client/detailPanelHtml.ts:107-127`）を次に置き換える。

```typescript
function renderStaleOption(value: string): string {
  return (
    '<option value="' +
    escapeHtmlClient(value) +
    '" selected>(not in catalog) ' +
    escapeHtmlClient(value) +
    '</option>'
  );
}

function renderModelSelect(id: string, currentValue: string): string {
  const catalog = getModelCatalog();
  let html = '<select id="' + id + '" class="detail-edit-select">';
  html += '<option value="">Default (config)</option>';
  catalog.forEach((entry) => {
    const selected = entry.model === currentValue ? ' selected' : '';
    html +=
      '<option value="' +
      escapeHtmlClient(entry.model) +
      '"' +
      selected +
      '>' +
      escapeHtmlClient(entry.cli + '[' + entry.model + ']') +
      '</option>';
  });
  // A value stored before a catalog change must stay visible and editable
  // rather than silently reading as "Default (config)".
  if (currentValue && !catalog.some((entry) => entry.model === currentValue)) {
    html += renderStaleOption(currentValue);
  }
  html += '</select>';
  return html;
}

function renderEffortSelect(id: string, currentValue: string, modelValue: string): string {
  const efforts = effortsForModel(modelValue);
  let html = '<select id="' + id + '" class="detail-edit-select">';
  html += '<option value="">Effort: default</option>';
  efforts.forEach((effort) => {
    const selected = effort === currentValue ? ' selected' : '';
    html += '<option value="' + escapeHtmlClient(effort) + '"' + selected + '>' + escapeHtmlClient(effort) + '</option>';
  });
  if (currentValue && efforts.indexOf(currentValue) === -1) {
    html += renderStaleOption(currentValue);
  }
  html += '</select>';
  return html;
}
```

`renderModelFields`（`src/board/client/detailPanelHtml.ts:129-150`）の effort 呼び出し 2 箇所（`:139`, `:146`）に model の値を渡す。

```typescript
  html += renderEffortSelect('detail-edit-effort-planning', planningEffort, planningValue);
```

```typescript
  html += renderEffortSelect('detail-edit-effort-run', runEffort, runValue);
```

- [ ] **Step 9: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/client/detailPanelHtml.test.ts`
Expected: PASS

- [ ] **Step 10: Add モーダルと詳細パネルの連動を配線する（失敗するテストから）**

`tests/board/client/addTaskModal.test.ts` の `setupAddModalDOM`（`tests/board/client/addTaskModal.test.ts:11-56`）はそのまま使い、ファイル末尾に describe を追加する。

```typescript
describe('add modal model/effort linkage', () => {
  beforeEach(() => {
    setupAddModalDOM();
    (window as unknown as Record<string, unknown>).modelCatalog = [
      { cli: 'claude', model: 'opus', efforts: ['low', 'max'] },
      { cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low'] },
    ];
    (window as unknown as Record<string, unknown>).defaultAgent = 'claude';
    vi.spyOn(tagsModule, 'loadAllTags').mockResolvedValue(undefined);
    initAddTaskModal();
  });

  it('rebuilds the run effort options when the run model changes', () => {
    const modelSelect = document.getElementById('add-model-run') as HTMLSelectElement;
    modelSelect.innerHTML = '<option value=""></option><option value="gpt-5.6-sol">codex[gpt-5.6-sol]</option>';
    modelSelect.value = 'gpt-5.6-sol';
    modelSelect.dispatchEvent(new Event('change'));

    const effortSelect = document.getElementById('add-effort-run') as HTMLSelectElement;
    expect([...effortSelect.options].map((o) => o.value)).toEqual(['', 'none', 'low']);
  });

  it('restores the default cli effort union when the modal is reopened', () => {
    const modelSelect = document.getElementById('add-model-run') as HTMLSelectElement;
    modelSelect.innerHTML = '<option value=""></option><option value="gpt-5.6-sol">codex[gpt-5.6-sol]</option>';
    modelSelect.value = 'gpt-5.6-sol';
    modelSelect.dispatchEvent(new Event('change'));

    (document.querySelector('.add-btn') as HTMLButtonElement).click();

    const effortSelect = document.getElementById('add-effort-run') as HTMLSelectElement;
    expect([...effortSelect.options].map((o) => o.value)).toEqual(['', 'low', 'max']);
    expect(effortSelect.value).toBe('');
  });
});
```

Run: `pnpm exec vitest run tests/board/client/addTaskModal.test.ts`
Expected: FAIL（effort の options が変わらない）

- [ ] **Step 11: `addTaskModal.ts` と `detailPanel.ts` を配線する**

`src/board/client/addTaskModal.ts:7` の import 行の直後に 1 行足す。

```typescript
import { rebuildEffortOptions, wireModelEffortSync } from './modelOptions';
```

`resetAddModal`（`src/board/client/addTaskModal.ts:241-262`）の `elements.addEffortRun.value = '';`（`:248`）の直後に 2 行足す。

```typescript
  // Model is back on "Default (config)", so the effort lists go back to the
  // default cli union (and lose any effort left over from the previous model).
  rebuildEffortOptions(elements.addModelPlanning, elements.addEffortPlanning);
  rebuildEffortOptions(elements.addModelRun, elements.addEffortRun);
```

`initAddTaskModal` の `initAddTagSelector();`（`src/board/client/addTaskModal.ts:330`）の直前に 2 行足す。

```typescript
  wireModelEffortSync('add-model-planning', 'add-effort-planning');
  wireModelEffortSync('add-model-run', 'add-effort-run');
```

`src/board/client/detailPanel.ts:32` の import 行の直後に 1 行足す。

```typescript
import { wireModelEffortSync } from './modelOptions';
```

`renderDetailPanel` の `detailsPane` ブロック（`src/board/client/detailPanel.ts:436-447`）の閉じ括弧の直後、`// Wire branch field interactions`（`:449`）の直前に 3 行足す。

```typescript
  // Elements are rebuilt on every render, so re-wire the model -> effort linkage.
  wireModelEffortSync('detail-edit-model-planning', 'detail-edit-effort-planning');
  wireModelEffortSync('detail-edit-model-run', 'detail-edit-effort-run');
```

- [ ] **Step 12: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/board/client/`
Expected: PASS

- [ ] **Step 13: 重複配列が消えたことを確認する**

Run: `grep -rn "MODEL_ALIAS_OPTIONS\|EFFORT_OPTIONS\|BOARD_MODEL_OPTIONS\|BOARD_EFFORT_OPTIONS" src/`
Expected: 出力なし

- [ ] **Step 14: 型チェック・lint・クライアントビルドを通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check && pnpm run build:client`
Expected: エラーなし

- [ ] **Step 15: コミット**

```bash
git add src/board/client/modelOptions.ts src/board/client/types.ts src/board/client/detailPanelHtml.ts src/board/client/detailPanel.ts src/board/client/addTaskModal.ts tests/board/client/modelOptions.test.ts tests/board/client/detailPanelHtml.test.ts tests/board/client/addTaskModal.test.ts
git commit -m "feat(board): drive the client model/effort selects from the model catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 11: `agkan config get` の出力と `agkan init` テンプレート

**Files:**
- Modify: `src/cli/commands/config/get.ts:1-46`, `:101-111`
- Modify: `src/cli/commands/init.ts:17-20`, `:39-59`
- Test: `tests/cli/commands/config/get.test.ts`, `tests/cli/commands/init.test.ts:79-89`

**Interfaces:**
- Consumes: `resolveModelCatalog` / `ModelCatalogEntry`（Task 1）
- Produces: `ResolvedConfig` に `modelCatalog: ModelCatalogEntry[]` が入る（`agkan config get modelCatalog` の dot 記法にも乗る）

- [ ] **Step 1: 失敗するテストを書く**

`tests/cli/commands/config/get.test.ts` の `should output full config as JSON` の it（`tests/cli/commands/config/get.test.ts:40-51`）の直後に追加する。

```typescript
  it('includes the resolved model catalog in the JSON output', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({});
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.config.modelCatalog).toEqual([
      { cli: 'claude', model: 'fable', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'haiku', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low', 'medium', 'high', 'xhigh'] },
    ]);
  });

  it('resolves the configured model catalog by dot notation', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      modelCatalog: [{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }],
    });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', 'modelCatalog', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    expect(JSON.parse(output).value).toEqual([{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }]);
  });

  it('prints one text line per catalog row', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      modelCatalog: [{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low'] }],
    });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('modelCatalog: codex gpt-5.6-sol (none, low)');
  });
```

`tests/cli/commands/init.test.ts:79-89` の `should write default config content to .agkan.yml` に 1 行足す。

```typescript
    expect(content).toContain('# modelCatalog:');
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run tests/cli/commands/config/get.test.ts tests/cli/commands/init.test.ts`
Expected: FAIL（`parsed.config.modelCatalog` が undefined、`# modelCatalog:` が無い）

- [ ] **Step 3: `config get` に `modelCatalog` を足す**

`src/cli/commands/config/get.ts:3-9` の import ブロックの直後に 1 行足す。

```typescript
import { resolveModelCatalog, type ModelCatalogEntry } from '../../../db/modelCatalog';
```

`ResolvedConfig`（`src/cli/commands/config/get.ts:15-28`）の `models` の直後に 1 行足す。

```typescript
  modelCatalog: ModelCatalogEntry[];
```

`buildResolvedConfig`（`src/cli/commands/config/get.ts:30-46`）の `models: { ... }` ブロックの直後に 1 行足す。

```typescript
    modelCatalog: resolveModelCatalog(config),
```

テキスト出力（`src/cli/commands/config/get.ts:107-111`）の `models.run` ブロックの直後、`console.log('');` の直前に 3 行足す。

```typescript
              resolved.modelCatalog.forEach((entry) => {
                console.log(`modelCatalog: ${entry.cli} ${entry.model} (${entry.efforts.join(', ')})`);
              });
```

- [ ] **Step 4: `init` テンプレートを更新する**

`src/cli/commands/init.ts:17-20` を次に置き換える。

```
# Default AI coding agent used by the board
# Applies to tasks with no model override. A task that selects a model from
# modelCatalog runs on that row's cli instead.
# Valid values: claude | codex
# Default: claude
agent: claude
```

`src/cli/commands/init.ts:42`（`# Valid effort values: low | medium | high | xhigh | max`）を次に置き換える。

```
# Valid effort values come from the model's modelCatalog row (see below).
```

`src/cli/commands/init.ts:59`（`models:` ブロック末尾の `      effort: high`）と `src/cli/commands/init.ts:61`（`# Permission mode configuration`）のあいだに、空行を挟んで次のブロックを挿入する。

```
# Model catalog
# Rows of cli + model + selectable efforts. Selecting a model on a task also
# selects the cli that runs it. Setting this key replaces the built-in catalog
# entirely (no per-row merge), and each model name may appear only once, even
# across cli values. The block below is the built-in default.
# modelCatalog:
#   - cli: claude
#     model: fable
#     efforts: [low, medium, high, xhigh, max]
#   - cli: claude
#     model: opus
#     efforts: [low, medium, high, xhigh, max]
#   - cli: claude
#     model: sonnet
#     efforts: [low, medium, high, xhigh, max]
#   - cli: claude
#     model: haiku
#     efforts: [low, medium, high, xhigh, max]
#   - cli: codex
#     model: gpt-5.6-sol
#     efforts: [none, low, medium, high, xhigh]
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run tests/cli/commands/config/get.test.ts tests/cli/commands/init.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェック・lint を通す**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/cli/commands/config/get.ts src/cli/commands/init.ts tests/cli/commands/config/get.test.ts tests/cli/commands/init.test.ts
git commit -m "feat(cli): expose the model catalog in config get and the init template

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

### Task 12: ドキュメントと CHANGELOG

**Files:**
- Modify: `documentation/configuration.md:13-16`, `:189-232`
- Modify: `documentation/configuration.ja.md:13-16`, `:176-219`
- Modify: `documentation/cli-reference.md:78-86`, `:599-605`
- Modify: `documentation/cli-reference.ja.md`（`### タスクの作成` / `### 設定確認` の対応箇所）
- Modify: `CHANGELOG.md:8-19`, `CHANGELOG.ja.md:8-19`

**Interfaces:**
- Consumes: Task 1〜11 で確定した挙動
- Produces: なし（ドキュメントのみ）

- [ ] **Step 1: `documentation/configuration.md` に Model Catalog 節を足す**

TOC（`documentation/configuration.md:14-16`）の `- [Agent Settings](#agent-settings)` の直後に 1 行足す。

```markdown
- [Model Catalog](#model-catalog)
```

`documentation/configuration.md:191`（Agent Settings の導入文）を次に置き換える。

```markdown
The `agent` field in `.agkan.yml` selects the default AI coding agent the board launches to execute tasks. It applies to tasks with no model override; a task that selects a model from the [Model Catalog](#model-catalog) runs on that row's cli instead.
```

`documentation/configuration.md:209`（Agent Settings の末尾行）と `:211`（`## Models Settings`）のあいだに、新しい節を挿入する。

````markdown
## Model Catalog

The `modelCatalog` list in `.agkan.yml` defines which model a task may select, which cli runs it, and which effort values that model accepts. It is the single source of truth for the `agkan task add` / `agkan task update` flags, the `POST` / `PATCH /api/tasks` validation, and the Board's model/effort dropdowns.

### Format

```yaml
modelCatalog:
  - cli: claude
    model: fable
    efforts: [low, medium, high, xhigh, max]
  - cli: codex
    model: gpt-5.6-sol
    efforts: [none, low, medium, high, xhigh]
```

| Field | Type | Description |
|-------|------|-------------|
| `cli` | string | `claude` or `codex`. The cli that runs a task which selects this model |
| `model` | string | Value passed through to the cli's `--model` flag. Displayed as `cli[model]` |
| `efforts` | string[] | Effort values selectable for this model. May be empty (no effort override for that row) |

### Built-in Default

Omitting `modelCatalog` uses this catalog:

| cli | model | efforts |
|-----|-------|---------|
| claude | `fable` | `low`, `medium`, `high`, `xhigh`, `max` |
| claude | `opus` | `low`, `medium`, `high`, `xhigh`, `max` |
| claude | `sonnet` | `low`, `medium`, `high`, `xhigh`, `max` |
| claude | `haiku` | `low`, `medium`, `high`, `xhigh`, `max` |
| codex | `gpt-5.6-sol` | `none`, `low`, `medium`, `high`, `xhigh` |

### Validation

Setting `modelCatalog` **replaces the built-in catalog entirely** — rows are not merged. An empty list is valid and means no task-level override can be selected. agkan raises an error when:

- `modelCatalog` is not a list
- a row's `cli` is neither `claude` nor `codex`
- a row's `model` is empty, or `efforts` is not a list of non-empty strings
- the same `model` name appears in more than one row, even across different `cli` values (a model name must identify its cli unambiguously)

### How a task uses the catalog

- Selecting a model on a task also selects the cli that runs it, overriding `agent:` for that task only.
- An effort is valid only if it appears in the `efforts` of the selected model's row. With no model selected, the candidates are the union of every row belonging to the default `agent:`.
- Running a task whose stored model is no longer in the catalog fails with a 400 rather than falling back to the default cli. The Board's detail panel shows such a value as `(not in catalog) <model>` so it can be corrected.
- Model names coming from `models.<agent>.<kind>.model` are not validated against the catalog; their effort is validated only when the model matches a catalog row for that cli.
````

`documentation/configuration.md:220,222`（Models Settings のフィールド表の effort 行 2 本）の `(`low`, `medium`, `high`, `xhigh`, `max`)` を `(see [Model Catalog](#model-catalog))` に置き換える。

- [ ] **Step 2: `documentation/configuration.ja.md` に同じ内容を足す**

TOC（`documentation/configuration.ja.md:14-16`）の `- [エージェント設定](#エージェント設定)` の直後に 1 行足す。

```markdown
- [モデルカタログ](#モデルカタログ)
```

`documentation/configuration.ja.md:178`（エージェント設定の導入文）を次に置き換える。

```markdown
`.agkan.yml` の `agent` フィールドで、ボードがタスク実行に使用する既定のAIコーディングエージェントを選択します。これはタスク側にモデル指定がない場合に使われます。[モデルカタログ](#モデルカタログ)の行からモデルを選んだタスクは、その行の cli で実行されます。
```

`documentation/configuration.ja.md:196`（エージェント設定の末尾行）と `:198`（`## モデル設定`）のあいだに、新しい節を挿入する。

````markdown
## モデルカタログ

`.agkan.yml` の `modelCatalog` は、タスクが選択できるモデル・そのモデルを実行する cli・そのモデルで選べる effort を定義します。`agkan task add` / `agkan task update` のフラグ検証、`POST` / `PATCH /api/tasks` の検証、Board のモデル/effortドロップダウンは、すべてこのカタログを唯一の正として参照します。

### 形式

```yaml
modelCatalog:
  - cli: claude
    model: fable
    efforts: [low, medium, high, xhigh, max]
  - cli: codex
    model: gpt-5.6-sol
    efforts: [none, low, medium, high, xhigh]
```

| フィールド | 型 | 説明 |
|----------|-----|------|
| `cli` | string | `claude` または `codex`。このモデルを選んだタスクを実行する cli |
| `model` | string | cli の `--model` にそのまま渡す値。表示は `cli[model]` |
| `efforts` | string[] | このモデルで選べる effort。空配列可（その行では effort を指定できない） |

### 組み込みの既定

`modelCatalog` を省略した場合は次のカタログが使われます。

| cli | model | efforts |
|-----|-------|---------|
| claude | `fable` | `low`, `medium`, `high`, `xhigh`, `max` |
| claude | `opus` | `low`, `medium`, `high`, `xhigh`, `max` |
| claude | `sonnet` | `low`, `medium`, `high`, `xhigh`, `max` |
| claude | `haiku` | `low`, `medium`, `high`, `xhigh`, `max` |
| codex | `gpt-5.6-sol` | `none`, `low`, `medium`, `high`, `xhigh` |

### 検証

`modelCatalog` を設定すると、組み込みの既定は**丸ごと置き換わります**（行単位のマージはしません）。空配列も有効で、その場合タスク単位のオーバーライドは一切選べません。次の場合はエラーになります。

- `modelCatalog` が配列でない
- 行の `cli` が `claude` / `codex` のいずれでもない
- 行の `model` が空、または `efforts` が「空でない文字列の配列」でない
- 同じ `model` 名が 2 行以上に現れる（cli が異なっていても不可。モデル名だけで cli を一意に引くため）

### タスクからの使われ方

- タスクでモデルを選ぶと、そのタスクを実行する cli も決まります（そのタスクに限り `agent:` を上書きします）。
- effort は、選択したモデルの行の `efforts` に含まれる場合のみ有効です。モデル未選択のときは、既定の `agent:` に属する全行の efforts の和集合が候補になります。
- 保存済みのモデルがカタログから消えている場合、実行は既定 cli にフォールバックせず 400 で失敗します。Board の詳細パネルはその値を `(not in catalog) <model>` として表示し、修正できるようにします。
- `models.<agent>.<kind>.model` の値はカタログで検証しません。その effort は、モデルが同じ cli のカタログ行に一致するときだけ検証されます。
````

`documentation/configuration.ja.md:207,209`（モデル設定のフィールド表の effort 行 2 本）の `（`low`, `medium`, `high`, `xhigh`, `max`）` を `（[モデルカタログ](#モデルカタログ)を参照）` に置き換える。

- [ ] **Step 3: `documentation/cli-reference.md` にフラグの説明を足す**

`documentation/cli-reference.md:78-81`（`Create with tags` のブロック）の直前に次を挿入する。

````markdown
Create with a per-task model and reasoning effort:
```bash
agkan task add "Refactor the parser" --model-run sonnet --effort-run high
```

Valid `--model-planning` / `--model-run` values are the `model` names in the
[model catalog](configuration.md#model-catalog); selecting one also selects the cli
that runs the task. Valid `--effort-planning` / `--effort-run` values are that
model's `efforts` (or, with no model given, the union for the default `agent:`).
Run `agkan config get modelCatalog --json` to see the resolved catalog.

````

`documentation/cli-reference.md:255-258`（`Change author` のブロック）の直後に次を挿入する。

````markdown
Change the model and effort (empty string clears an override):
```bash
agkan task update 1 --model-run gpt-5.6-sol --effort-run none
agkan task update 1 --model-run "" --effort-run ""
```

The values are validated as a pair against the [model catalog](configuration.md#model-catalog):
a flag you omit is checked against the value already stored on the task.

````

`documentation/cli-reference.md:599-605`（`config get` の Example output）を次に置き換える。

````markdown
Example output:
```
✓ Resolved config

path: /workspace/.agkan/data.db
board.port: 8080
modelCatalog: claude fable (low, medium, high, xhigh, max)
modelCatalog: claude opus (low, medium, high, xhigh, max)
modelCatalog: claude sonnet (low, medium, high, xhigh, max)
modelCatalog: claude haiku (low, medium, high, xhigh, max)
modelCatalog: codex gpt-5.6-sol (none, low, medium, high, xhigh)
```
````

- [ ] **Step 4: `documentation/cli-reference.ja.md` に同じ 3 箇所を足す**

`### タスクの作成`（`documentation/cli-reference.ja.md:54`）の中、タグ付きで作成する例の直前に次を挿入する。

````markdown
タスク単位でモデルと reasoning effort を指定して作成:
```bash
agkan task add "パーサーのリファクタ" --model-run sonnet --effort-run high
```

`--model-planning` / `--model-run` に指定できるのは[モデルカタログ](configuration.ja.md#モデルカタログ)の `model` 名です。モデルを選ぶと、そのタスクを実行する cli も決まります。`--effort-planning` / `--effort-run` に指定できるのはそのモデルの `efforts`（モデル未指定なら既定の `agent:` に属する行の和集合）です。解決後のカタログは `agkan config get modelCatalog --json` で確認できます。

````

`### タスクの更新`（`documentation/cli-reference.ja.md:238`）の `作成者を変更:` のブロック（`:255-258`）の直後に次を挿入する。

````markdown
モデルと effort を変更（空文字でクリア）:
```bash
agkan task update 1 --model-run gpt-5.6-sol --effort-run none
agkan task update 1 --model-run "" --effort-run ""
```

値は[モデルカタログ](configuration.ja.md#モデルカタログ)に対してペアで検証されます。指定しなかった側は、タスクに保存済みの値が使われます。

````

`### 設定確認` の出力例（`documentation/cli-reference.ja.md` の `config get` の Example output）にも、英語版と同じ `modelCatalog:` の 5 行を足す。

Run: `grep -n "board.port: 8080" documentation/cli-reference.ja.md`
Expected: 該当行が 1 つ見つかる（その直後に 5 行を挿入する）

- [ ] **Step 5: CHANGELOG を更新する**

`CHANGELOG.md:8-19` の `## [Unreleased]` の `### Added` の末尾（`:12` の行の直後）に 1 項目、`### Changed` の末尾（`:18` の行の直後）に 3 項目を足す。

```markdown
- Add a `modelCatalog` setting to `.agkan.yml` listing which model a task may select, which cli (`claude` / `codex`) runs it, and which reasoning efforts that model accepts. Selecting a model on a task now also selects the cli that runs it, so `agent:` becomes the default for tasks with no model override. The catalog is also reported by `agkan config get` and commented into the `agkan init` template
```

```markdown
- Validate task-level model and effort values against `modelCatalog` instead of the fixed Claude alias list (`fable`, `opus`, `sonnet`, `haiku`) and effort list (`low`, `medium`, `high`, `xhigh`, `max`). The model and effort of each of planning/run are now checked as a pair: an effort must belong to the selected model's row, or to the default cli's union when no model is selected. `agkan task update` and `PATCH /api/tasks/:id` validate a flag you omit against the value already stored on the task
- Change the Board's model labels from `claude[Fable]` to `claude[fable]`: the label is now `cli[model]` verbatim, with no capitalization. A stored model or effort that is no longer in the catalog is shown in the detail panel as `(not in catalog) <value>` instead of silently reading as the default
- Fail a run whose task-level model is not in `modelCatalog` (`POST /api/claude/tasks/:id/run` returns 400; Bulk Run skips the task and continues) instead of launching it on the default cli
```

`CHANGELOG.ja.md:8-19` の `### 追加` / `### 変更` にも同じ内容を日本語で足す。

```markdown
- `.agkan.yml` に `modelCatalog` 設定を追加。タスクが選択できるモデル・そのモデルを実行する cli（`claude` / `codex`）・そのモデルで選べる reasoning effort を定義する。タスクでモデルを選ぶと、そのタスクを実行する cli も決まるようになり、`agent:` は「タスクにモデル指定がないときの既定 cli」になった。カタログは `agkan config get` にも出力され、`agkan init` のテンプレートにコメントとして書き出される
```

```markdown
- タスク単位の model / effort の検証を、固定の Claude エイリアス表（`fable`, `opus`, `sonnet`, `haiku`）と effort 表（`low`, `medium`, `high`, `xhigh`, `max`）から `modelCatalog` 基準に変更。planning / run それぞれについて model と effort をペアで検証し、effort は選択したモデルの行に含まれること（モデル未選択なら既定 cli の和集合に含まれること）を要求する。`agkan task update` と `PATCH /api/tasks/:id` では、指定しなかった側にタスクの保存済みの値を使って検証する
- Board のモデル表示を `claude[Fable]` から `claude[fable]` に変更（`cli[model]` をそのまま表示し、先頭大文字化をやめた）。カタログから消えたモデル / effort が保存されている場合は、詳細パネルで `(not in catalog) <値>` と表示し、既定と区別できるようにした
- タスクの model が `modelCatalog` にない状態での実行を、既定 cli での起動ではなく失敗にした（`POST /api/claude/tasks/:id/run` は 400、Bulk Run はそのタスクをスキップして続行）
```

- [ ] **Step 6: 全体検証を実行する**

Run: `pnpm run type-check && pnpm run lint && pnpm run format:check`
Expected: エラーなし

Run: `pnpm exec vitest run`
Expected: PASS（全テスト。約15分かかる）

- [ ] **Step 7: コミット**

```bash
git add documentation/configuration.md documentation/configuration.ja.md documentation/cli-reference.md documentation/cli-reference.ja.md CHANGELOG.md CHANGELOG.ja.md
git commit -m "docs: document the model catalog in configuration, cli reference, and changelog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JKWJx8ViUEL28dVc4TtJPw"
```

---

## 検討した代替案

- **cli をプロジェクト全体で固定したまま、カタログを「選択中 cli の有効値表」としてだけ使う** — 採らなかった。ユーザー方針が「model を選べば cli が決まる」（タスク単位の切替）だったため（spec の決定事項）。
- **カタログをソース固定にする（`.agkan.yml` で上書きできない）** — 採らなかった。model 名の変更・追加のたびにリリースが必要になるため。
- **カタログを `.agkan.yml` 必須にする（組込既定なし）** — 採らなかった。既存プロジェクトが yml 追記なしで動かなくなるため。
- **`tasks` に `cli:model` 形式で保存する** — 採らなかった。既存行の書き換えマイグレーションと CLI/JSON の値形式変更が必要で、model 名で行を引けるなら不要なため。
- **`agent_planning` / `agent_run` カラムを追加する** — 採らなかった。カラム・フラグ・API・UI が増え、「model を選べば cli が決まる」方針と合わないため。
- **行が見つからないとき既定 cli で起動する** — 採らなかった。codex の model 名を claude に渡すなど誤った起動になり、明示的に失敗させる方が安全なため。
- **effort を全行の和集合で検証する** — 採らなかった。既定 cli が claude のとき codex 専用の `none` が選べてしまい、CLI 側で失敗するため。
- **`resolveLaunchSettings` を新設せず `resolveModelAndEffort` に第3の戻り値 `agent` を足す** — 採らなかった。戻り値だけでなく「不正時に throw する」という失敗の扱いが変わるため、名前を変えて呼び出し側を 1 つずつ移す方が各コミットを green に保てる（Task 3 → 5 → 6 の分割）。
- **`BulkRunService` で resolve に失敗したタスクを単に `advance()` するだけにする（spec の記述どおり）** — 採らなかった。`selectNextTask`（`src/board/BulkRunService.ts:75-104`）は `status: 'ready'` のタスクを毎回選び直すため、恒久的に失敗するタスクを無限に選び続ける。Task 6 で `skippedTaskIds` を持たせ、`start()` でクリアする形にした。
- **`rebuildEffortOptions` を `detailPanelHtml.ts` に置く** — 採らなかった。`detailPanelHtml.ts` は HTML 文字列を組み立てるだけのモジュールで DOM 操作を持たず、Add モーダル（`addTaskModal.ts`）からも使うため、`modelOptions.ts` を新設した。
- **クライアントへカタログを `/api/config` 経由で配る** — 採らなかった。Add モーダルの `<option>` はサーバー描画の HTML に含める必要があり、どのみち `boardRenderer` がカタログを持つため、configScript に載せる方が往復が減る。
