# agkan context ローダー実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `agkan init` で初期化した Claude Code プロジェクトに対し、agkan の使い方ガイドを SessionStart hook で自動注入する仕組みを実装する。

**Architecture:** 新規 `agkan context` コマンドが最小ガイドを出力 (既存 `agent-guide --hook` 規約に整合)。`agkan init` を拡張し、`.claude/settings.local.json` に SessionStart hook をマージ (冪等・既存スタイル維持)。

**Tech Stack:** TypeScript (Node.js 18+), Commander.js, vitest, ESLint, Prettier

**Spec:** `docs/superpowers/specs/2026-05-17-agkan-context-loader-design.md`

---

## ファイル構成

| ファイル | 種別 | 役割 |
|---|---|---|
| `src/cli/commands/context.ts` | 新規 | `agkan context` コマンド定義 + 出力テキスト定数 |
| `src/cli/integrations/claudeSettings.ts` | 新規 | settings.local.json マージロジック (純粋関数として) |
| `src/cli/commands/init.ts` | 変更 | `installSessionStartHook` 呼び出しを追加 |
| `src/cli/index.ts` | 変更 | `setupContextCommand(program)` を呼び出す |
| `tests/cli/commands/context.test.ts` | 新規 | context コマンド単体テスト |
| `tests/cli/integrations/claudeSettings.test.ts` | 新規 | マージロジック単体テスト |
| `tests/cli/commands/init.test.ts` | 変更 | Claude 統合の統合テストケース追加 |
| `tests/cli/commands/agent-guide.test.ts` | 変更 | 相互参照記述の検証 (任意) |
| `test-e2e.sh` | 変更 | E2E テストケース追加 |
| `src/cli/commands/agent-guide.ts` | 変更 | `agkan context` への 1 行相互参照 |
| `README.md` / `README.ja.md` | 変更 | init の Claude 統合説明 |
| `CHANGELOG.md` / `CHANGELOG.ja.md` | 変更 | Unreleased エントリ追加 |

---

### Task 1: `agkan context` コマンドを TDD で実装

**Files:**
- Test: `tests/cli/commands/context.test.ts` (新規)
- Create: `src/cli/commands/context.ts`
- Modify: `src/cli/index.ts` (import と register)

- [ ] **Step 1.1: 失敗するテストを書く**

`tests/cli/commands/context.test.ts` を新規作成:

```typescript
/**
 * Tests for context command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupContextCommand } from '../../../src/cli/commands/context';
import { createProgram, runCommand } from '../../helpers/command-test-utils';

describe('setupContextCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = createProgram(setupContextCommand);
  });

  it('should register the context command', () => {
    const cmd = program.commands.find((c) => c.name() === 'context');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe('Output minimal agkan context for Claude Code SessionStart hook');
  });

  it('should output plain text guide without --hook flag', async () => {
    const { logs } = await runCommand(program, ['context']);
    const output = logs.join('\n');

    expect(output).toContain('agkan');
    expect(output).toContain('agkan task list');
    expect(output).toContain('agkan task add');
    expect(output).toContain('agkan agent-guide');
  });

  it('should reference the seven statuses in correct order', async () => {
    const { logs } = await runCommand(program, ['context']);
    const output = logs.join('\n');

    expect(output).toContain('icebox');
    expect(output).toContain('backlog');
    expect(output).toContain('ready');
    expect(output).toContain('in_progress');
    expect(output).toContain('review');
    expect(output).toContain('done');
    expect(output).toContain('closed');
  });

  it('should output non-JSON plain text by default', async () => {
    const { logs } = await runCommand(program, ['context']);
    const output = logs.join('\n');

    expect(output).not.toMatch(/^\{/);
  });

  it('should output single-line JSON with additionalContext when --hook is given', async () => {
    const { logs } = await runCommand(program, ['context', '--hook']);
    expect(logs).toHaveLength(1);

    const parsed = JSON.parse(logs[0]);
    expect(parsed).toHaveProperty('additionalContext');
    expect(typeof parsed.additionalContext).toBe('string');
    expect(parsed.additionalContext).toContain('agkan task list');
  });

  it('should output a short minimal guide (under ~50 lines)', async () => {
    const { logs } = await runCommand(program, ['context']);
    const lineCount = logs.join('\n').split('\n').length;

    expect(lineCount).toBeLessThan(50);
  });
});
```

- [ ] **Step 1.2: テストを走らせて失敗を確認**

```bash
pnpm vitest run tests/cli/commands/context.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/cli/commands/context'`

- [ ] **Step 1.3: `src/cli/commands/context.ts` を作成**

```typescript
/**
 * Context command handler
 *
 * Outputs a minimal agkan usage guide intended for Claude Code's
 * SessionStart hook. Plain text by default; JSON with additionalContext
 * when --hook is specified (matches the agent-guide convention).
 */

import { Command } from 'commander';

const CONTEXT_CONTENT = `This project uses agkan (Agent Kanban) for task management.

Common commands:
- agkan task list [--status <s>] [--tag <id>] [--tree]
- agkan task get <id>
- agkan task add "<title>" [--status <s>] [--parent <id>] [--file <path>]
- agkan task update <id> --status <s>
- agkan task find "<keyword>"
- agkan task block add <blocker-id> <blocked-id>
- agkan tag list / attach / detach

Statuses: icebox → backlog → ready → in_progress → review → done → closed

Use --json on most commands for machine-readable output.

For the full reference (all subcommands, JSON schemas, workflows), run:
  agkan agent-guide
`;

export function setupContextCommand(program: Command): void {
  program
    .command('context')
    .description('Output minimal agkan context for Claude Code SessionStart hook')
    .option('--hook', 'Output as JSON for use in SessionStart hooks')
    .action((options: { hook?: boolean }) => {
      if (options.hook) {
        console.log(JSON.stringify({ additionalContext: CONTEXT_CONTENT }));
      } else {
        console.log(CONTEXT_CONTENT);
      }
    });
}
```

- [ ] **Step 1.4: `src/cli/index.ts` にコマンドを登録**

`src/cli/index.ts` の以下 2 箇所を変更。

import セクション (existing init import の直下に追加):

```typescript
// Init command handler
import { setupInitCommand } from './commands/init';

// Context command handler (new)
import { setupContextCommand } from './commands/context';
```

`setupInitCommand(program);` の直下に追加:

```typescript
// Register init command
setupInitCommand(program);

// Register context command
setupContextCommand(program);
```

- [ ] **Step 1.5: テストを走らせて成功を確認**

```bash
pnpm vitest run tests/cli/commands/context.test.ts
```

Expected: PASS (全 6 件)

- [ ] **Step 1.6: コミット**

```bash
git add src/cli/commands/context.ts src/cli/index.ts tests/cli/commands/context.test.ts
git commit -m "feat(cli): add context command for Claude Code SessionStart hook"
```

---

### Task 2: settings.local.json マージロジックを TDD で実装

**Files:**
- Test: `tests/cli/integrations/claudeSettings.test.ts` (新規)
- Create: `src/cli/integrations/claudeSettings.ts`

- [ ] **Step 2.1: 失敗するテストを書く**

`tests/cli/integrations/claudeSettings.test.ts` を新規作成:

```typescript
/**
 * Tests for Claude settings.local.json integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { installSessionStartHook } from '../../../src/cli/integrations/claudeSettings';

const HOOK_COMMAND = 'agkan context --hook';
const MATCHER = 'startup|resume|clear|compact';

describe('installSessionStartHook', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'agkan-claude-settings-test-'));
    settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create .claude directory when missing', () => {
    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('created');
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(true);
  });

  it('should create settings.local.json with agkan hook when file is missing', () => {
    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('created');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart).toHaveLength(1);
    expect(config.hooks.SessionStart[0].matcher).toBe(MATCHER);
    expect(config.hooks.SessionStart[0].hooks[0]).toEqual({ type: 'command', command: HOOK_COMMAND });
  });

  it('should merge into existing settings.local.json without touching other keys', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = { permissions: { allow: ['Bash(ls:*)'] } };
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('updated');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.permissions.allow).toEqual(['Bash(ls:*)']);
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('should append agkan hook when SessionStart already has other entries', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: 'startup', hooks: [{ type: 'command', command: 'echo hi' }] },
        ],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('updated');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart).toHaveLength(2);
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe('echo hi');
    expect(config.hooks.SessionStart[1].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('should be idempotent when agkan hook already exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: MATCHER, hooks: [{ type: 'command', command: HOOK_COMMAND }] },
        ],
      },
    };
    const original = JSON.stringify(existing, null, 2);
    fs.writeFileSync(settingsPath, original);

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('skipped');
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe(original);
  });

  it('should handle empty hooks property', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('updated');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('should preserve tab indentation when existing file uses tabs', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = '{\n\t"permissions": {\n\t\t"allow": []\n\t}\n}\n';
    fs.writeFileSync(settingsPath, existing);

    installSessionStartHook(tmpDir);

    const written = fs.readFileSync(settingsPath, 'utf8');
    expect(written).toMatch(/^\{\n\t"/);
  });

  it('should preserve 4-space indentation when existing file uses 4 spaces', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = '{\n    "permissions": {\n        "allow": []\n    }\n}\n';
    fs.writeFileSync(settingsPath, existing);

    installSessionStartHook(tmpDir);

    const written = fs.readFileSync(settingsPath, 'utf8');
    expect(written).toMatch(/^\{\n {4}"/);
  });

  it('should return error result on unparseable JSON without throwing', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(settingsPath, '{ not valid json');

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/parse|JSON/i);
  });
});
```

- [ ] **Step 2.2: テストを走らせて失敗を確認**

```bash
pnpm vitest run tests/cli/integrations/claudeSettings.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/cli/integrations/claudeSettings'`

- [ ] **Step 2.3: `src/cli/integrations/claudeSettings.ts` を作成**

ディレクトリ `src/cli/integrations/` も新規作成される。

```typescript
/**
 * Claude Code .claude/settings.local.json integration.
 *
 * Idempotently installs a SessionStart hook that calls `agkan context --hook`.
 * Existing keys, other hooks, and file indentation style are preserved.
 */

import fs from 'fs';
import path from 'path';

const RELATIVE_SETTINGS_PATH = path.join('.claude', 'settings.local.json');
const HOOK_COMMAND = 'agkan context --hook';
const MATCHER = 'startup|resume|clear|compact';

export type ClaudeSettingsStatus = 'created' | 'updated' | 'skipped' | 'error';

export interface ClaudeSettingsResult {
  status: ClaudeSettingsStatus;
  message: string;
}

interface HookEntry {
  type: 'command';
  command: string;
}

interface SessionStartEntry {
  matcher: string;
  hooks: HookEntry[];
}

interface SettingsShape {
  hooks?: {
    SessionStart?: SessionStartEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Detects the indentation used by an existing JSON file.
 * Returns either a tab string, a spaces string (e.g. "    "),
 * or 2 (default) if no indented line is found.
 */
function detectIndent(text: string): string | number {
  const match = text.match(/\n([ \t]+)/);
  if (!match) return 2;
  return match[1];
}

function hasAgkanHook(config: SettingsShape): boolean {
  const entries = config.hooks?.SessionStart;
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    if (!Array.isArray(entry?.hooks)) continue;
    for (const hook of entry.hooks) {
      if (hook?.type === 'command' && hook?.command === HOOK_COMMAND) {
        return true;
      }
    }
  }
  return false;
}

export function installSessionStartHook(cwd: string): ClaudeSettingsResult {
  const claudeDir = path.join(cwd, '.claude');
  const settingsPath = path.join(cwd, RELATIVE_SETTINGS_PATH);

  try {
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const fileExisted = fs.existsSync(settingsPath);
    const rawText = fileExisted ? fs.readFileSync(settingsPath, 'utf8') : '{}';
    const indent = fileExisted ? detectIndent(rawText) : 2;

    let config: SettingsShape;
    try {
      config = JSON.parse(rawText) as SettingsShape;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        message: `Failed to parse ${RELATIVE_SETTINGS_PATH}: ${reason}`,
      };
    }

    if (hasAgkanHook(config)) {
      return {
        status: 'skipped',
        message: `Skipped: ${RELATIVE_SETTINGS_PATH} (agkan hook already present)`,
      };
    }

    if (!config.hooks) config.hooks = {};
    if (!Array.isArray(config.hooks.SessionStart)) config.hooks.SessionStart = [];
    config.hooks.SessionStart.push({
      matcher: MATCHER,
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });

    fs.writeFileSync(settingsPath, JSON.stringify(config, null, indent) + '\n', 'utf8');

    return fileExisted
      ? {
          status: 'updated',
          message: `Updated: ${RELATIVE_SETTINGS_PATH} (added agkan SessionStart hook)`,
        }
      : {
          status: 'created',
          message: `Created: ${RELATIVE_SETTINGS_PATH} (added agkan SessionStart hook)`,
        };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      message: `Failed to update ${RELATIVE_SETTINGS_PATH}: ${reason}`,
    };
  }
}
```

- [ ] **Step 2.4: テストを走らせて成功を確認**

```bash
pnpm vitest run tests/cli/integrations/claudeSettings.test.ts
```

Expected: PASS (全 9 件)

- [ ] **Step 2.5: コミット**

```bash
git add src/cli/integrations/claudeSettings.ts tests/cli/integrations/claudeSettings.test.ts
git commit -m "feat(cli): add Claude settings.local.json SessionStart hook integration"
```

---

### Task 3: `agkan init` から Claude 統合を呼び出し (TDD)

**Files:**
- Modify: `tests/cli/commands/init.test.ts` (テストケース追加)
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 3.1: 失敗するテストケースを追加**

`tests/cli/commands/init.test.ts` の `describe('setupInitCommand', () => {` ブロック末尾 (既存最終 `it(...)` の直後、closing `});` の直前) に以下を追加:

```typescript
  it('should create .claude/settings.local.json with agkan SessionStart hook', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart).toBeDefined();
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe('agkan context --hook');
    expect(config.hooks.SessionStart[0].matcher).toBe('startup|resume|clear|compact');
  });

  it('should be idempotent when init is run twice (Claude hook not duplicated)', async () => {
    await program.parseAsync(['node', 'test', 'init']);
    await program.parseAsync(['node', 'test', 'init']);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart).toHaveLength(1);
  });

  it('should preserve existing settings.local.json entries when merging', async () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    const settingsPath = path.join(claudeDir, 'settings.local.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] } }, null, 2)
    );

    await program.parseAsync(['node', 'test', 'init']);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.permissions.allow).toEqual(['Bash(ls:*)']);
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe('agkan context --hook');
  });
```

- [ ] **Step 3.2: テストを走らせて失敗を確認**

```bash
pnpm vitest run tests/cli/commands/init.test.ts
```

Expected: FAIL — 新規 3 テストが失敗 (`fs.existsSync(...).toBe(true)` が false)

- [ ] **Step 3.3: `src/cli/commands/init.ts` を変更**

import セクションに追加:

```typescript
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { getConfigFileName, getDefaultDirName } from '../../db/config';
import { TagService } from '../../services';
import { installSessionStartHook } from '../integrations/claudeSettings';
```

`createDefaultTags()` 呼び出し直後 (action 関数末尾) に Claude 統合呼び出しを追加:

```typescript
      // Create default tags
      try {
        createDefaultTags();
      } catch (error) {
        // Tags creation is non-critical, so we log but don't fail init
        if (error instanceof Error) {
          console.error(`Warning: Failed to create default tags: ${error.message}`);
        }
      }

      // Install Claude Code SessionStart hook (non-critical)
      const claudeResult = installSessionStartHook(cwd);
      if (claudeResult.status === 'error') {
        console.error(`Warning: ${claudeResult.message}`);
      } else {
        console.log(claudeResult.message);
      }
    });
}
```

- [ ] **Step 3.4: テストを走らせて成功を確認**

```bash
pnpm vitest run tests/cli/commands/init.test.ts
```

Expected: PASS (既存 + 新規 3 件すべて)

- [ ] **Step 3.5: コミット**

```bash
git add src/cli/commands/init.ts tests/cli/commands/init.test.ts
git commit -m "feat(cli): init now configures Claude Code SessionStart hook"
```

---

### Task 4: `agent-guide` 出力に `agkan context` への 1 行参照を追加 + `--hook` を deprecate

**設計判断:** `agent-guide --hook` は `context --hook` と JSON フォーマット (`{ additionalContext: string }`) が同一で、中身の分量だけが違う。SessionStart hook 用途は今後 `context --hook` に一本化するため、`agent-guide --hook` には deprecation warning を stderr に出力し、次のメジャーバージョンで削除する方針とする。`--hook` フラグ自体は後方互換のため残す。

**Files:**
- Modify: `src/cli/commands/agent-guide.ts`
- Modify: `tests/cli/commands/agent-guide.test.ts`

- [ ] **Step 4.1: 失敗するテストを追加**

`tests/cli/commands/agent-guide.test.ts` の `describe(...)` ブロック末尾 (closing `});` の直前) に追加:

```typescript
  it('should mention the lightweight agkan context command', async () => {
    const { logs } = await runCommand(program, ['agent-guide']);
    const output = logs.join('\n');

    expect(output).toContain('agkan context');
  });

  it('should emit a deprecation warning to stderr when --hook is used', async () => {
    const { logs, errors } = await runCommand(program, ['agent-guide', '--hook']);

    // stdout は従来通り JSON
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed).toHaveProperty('additionalContext');

    // stderr に deprecation warning
    const errOutput = errors.join('\n');
    expect(errOutput).toMatch(/deprecat/i);
    expect(errOutput).toContain('agkan context --hook');
  });

  it('should NOT emit a deprecation warning when --hook is not used', async () => {
    const { errors } = await runCommand(program, ['agent-guide']);
    expect(errors.join('\n')).not.toMatch(/deprecat/i);
  });
```

> **Note:** `runCommand` ヘルパが `errors` (stderr capture) を返していない場合は、`tests/helpers/command-test-utils.ts` を確認し、必要なら `console.error` キャプチャを追加する。既に対応済みなら不要。

- [ ] **Step 4.2: テストを走らせて失敗を確認**

```bash
pnpm vitest run tests/cli/commands/agent-guide.test.ts
```

Expected: FAIL — `agkan context` が見つからない、deprecation warning が出ない

- [ ] **Step 4.3: `src/cli/commands/agent-guide.ts` を変更**

(a) `AGENT_GUIDE_CONTENT` 内の Overview セクション (7 statuses の行の直下) に相互参照を追加:

変更前:

```typescript
**7 statuses:** \`icebox\` → \`backlog\` → \`ready\` → \`in_progress\` → \`review\` → \`done\` → \`closed\`

---
```

変更後:

```typescript
**7 statuses:** \`icebox\` → \`backlog\` → \`ready\` → \`in_progress\` → \`review\` → \`done\` → \`closed\`

For a one-line session brief (used by Claude Code's SessionStart hook), run \`agkan context\`.

---
```

(b) action 関数を変更し、`--hook` 指定時に stderr へ deprecation warning を出力:

変更前:

```typescript
    .action((options: { hook?: boolean }) => {
      if (options.hook) {
        console.log(JSON.stringify({ additionalContext: AGENT_GUIDE_CONTENT }));
      } else {
        console.log(AGENT_GUIDE_CONTENT);
      }
    });
```

変更後:

```typescript
    .action((options: { hook?: boolean }) => {
      if (options.hook) {
        console.error(
          'Warning: `agkan agent-guide --hook` is deprecated and will be removed in the next major version. ' +
            'Use `agkan context --hook` for SessionStart hooks instead.'
        );
        console.log(JSON.stringify({ additionalContext: AGENT_GUIDE_CONTENT }));
      } else {
        console.log(AGENT_GUIDE_CONTENT);
      }
    });
```

また Commander の option 説明も更新:

```typescript
    .option('--hook', '[DEPRECATED] Output as JSON for SessionStart hooks. Use `agkan context --hook` instead.')
```

- [ ] **Step 4.4: テストを走らせて成功を確認**

```bash
pnpm vitest run tests/cli/commands/agent-guide.test.ts
```

Expected: PASS (既存 + 新規 3 件すべて)

- [ ] **Step 4.5: CHANGELOG に deprecation を記載**

Task 6 で追記する `CHANGELOG.md` / `CHANGELOG.ja.md` の Unreleased セクションに `### Deprecated` / `### 非推奨` を追加 (Task 6 でまとめて実施)。

- [ ] **Step 4.6: コミット**

```bash
git add src/cli/commands/agent-guide.ts tests/cli/commands/agent-guide.test.ts
git commit -m "feat(cli): cross-reference context in agent-guide, deprecate --hook flag"
```

---

### Task 5: E2E テスト追加

**Files:**
- Modify: `test-e2e.sh`

- [ ] **Step 5.1: 既存 E2E スクリプトを確認**

```bash
head -50 test-e2e.sh
```

Expected: `agkan init` を含む既存ステップが見える。出力フォーマットを既存のテスト関数 (例えば `assert_*` ヘルパ) に合わせる。

- [ ] **Step 5.2: `test-e2e.sh` にケース追加**

既存の `agkan init` を実行している箇所の直後に以下のチェックを追加 (既存スクリプトの assertion ヘルパに合わせて文言調整):

```bash
# Claude SessionStart hook is installed
if [ ! -f .claude/settings.local.json ]; then
  echo "FAIL: .claude/settings.local.json was not created by agkan init"
  exit 1
fi
if ! grep -q "agkan context --hook" .claude/settings.local.json; then
  echo "FAIL: agkan SessionStart hook missing from settings.local.json"
  exit 1
fi
echo "PASS: Claude SessionStart hook installed"

# agkan context command works
context_output=$(agkan context)
if ! echo "$context_output" | grep -q "agkan task list"; then
  echo "FAIL: agkan context plain output missing expected content"
  exit 1
fi
context_hook_output=$(agkan context --hook)
if ! echo "$context_hook_output" | grep -q '"additionalContext"'; then
  echo "FAIL: agkan context --hook output missing additionalContext"
  exit 1
fi
echo "PASS: agkan context command works"
```

スクリプトの規約 (関数化されたヘルパや trap によるクリーンアップ) があれば、既存パターンに合わせて書き直す。

- [ ] **Step 5.3: E2E を走らせる**

```bash
./test-e2e.sh
```

Expected: 新規 2 つの PASS メッセージと、既存テストが全て通る

- [ ] **Step 5.4: コミット**

```bash
git add test-e2e.sh
git commit -m "test(e2e): cover Claude SessionStart hook install and agkan context"
```

---

### Task 6: ドキュメント更新

**Files:**
- Modify: `README.md`, `README.ja.md`
- Modify: `CHANGELOG.md`, `CHANGELOG.ja.md`

- [ ] **Step 6.1: `README.md` の `agkan init` 説明を更新**

`README.md` 内で `agkan init` を説明している箇所を特定:

```bash
grep -n "agkan init" README.md | head -5
```

該当セクションに、`init` 実行時のアウトプット例として以下の説明を 1 段落追記 (既存スタイルに合わせて):

```markdown
`agkan init` also installs a SessionStart hook into `.claude/settings.local.json`
so that Claude Code automatically loads a minimal agkan usage brief at the
start of every session. The hook calls `agkan context --hook`. This step is
idempotent and merges into existing settings without touching unrelated keys.
If you are not using Claude Code, you can safely ignore the generated file.
```

- [ ] **Step 6.2: `README.ja.md` の対応セクションを更新**

```bash
grep -n "agkan init" README.ja.md | head -5
```

該当セクションに以下の段落を追記:

```markdown
`agkan init` は `.claude/settings.local.json` に SessionStart hook も登録し、
Claude Code のセッション開始時に最小限の agkan 使用ガイドを自動でロードします。
hook は `agkan context --hook` を呼び出します。既存設定との競合を避けるため
冪等にマージし、関係のないキーには触れません。Claude Code を使わない場合は
生成されたファイルを無視しても問題ありません。
```

- [ ] **Step 6.3: `CHANGELOG.md` の Unreleased セクションを更新**

`CHANGELOG.md` の `## [Unreleased]` 配下に追加 (該当 `### Added` / `### Changed` が無ければ新設):

```markdown
### Added
- `agkan context` command outputting a minimal session brief for Claude Code's SessionStart hook (use `--hook` for single-line JSON with `additionalContext`).

### Changed
- `agkan init` now also configures `.claude/settings.local.json` with a SessionStart hook calling `agkan context --hook`. Merge is idempotent and preserves existing entries and indentation.

### Deprecated
- `agkan agent-guide --hook` is deprecated and will be removed in the next major version. Use `agkan context --hook` for SessionStart hooks instead. The `agent-guide` command itself (without `--hook`) remains the canonical full reference.
```

- [ ] **Step 6.4: `CHANGELOG.ja.md` の Unreleased セクションを更新**

`CHANGELOG.ja.md` の `## [Unreleased]` 配下に追加 (日本語見出しを使う):

```markdown
### 追加
- `agkan context` コマンドを追加。Claude Code の SessionStart hook 用に最小限のセッションブリーフを出力します (`--hook` で `additionalContext` を含む単一行 JSON)。

### 変更
- `agkan init` が `.claude/settings.local.json` に SessionStart hook (`agkan context --hook` を呼び出す) を追加するようになりました。マージは冪等で、既存エントリとインデントを保持します。

### 非推奨
- `agkan agent-guide --hook` を非推奨にしました。次のメジャーバージョンで削除予定です。SessionStart hook 用途では `agkan context --hook` を使用してください。`agent-guide` コマンド本体 (`--hook` なし) は引き続き完全リファレンスとして利用できます。
```

- [ ] **Step 6.5: コミット**

```bash
git add README.md README.ja.md CHANGELOG.md CHANGELOG.ja.md
git commit -m "docs: document agkan context command and init Claude integration"
```

---

### Task 7: 最終検証

**Files:** なし (verification only)

- [ ] **Step 7.1: フルテスト**

```bash
pnpm test
```

Expected: 全テストが PASS

- [ ] **Step 7.2: Lint**

```bash
pnpm lint
```

Expected: エラー 0、警告 0

- [ ] **Step 7.3: Prettier 整形チェック**

```bash
pnpm exec prettier --check "src/**/*.ts" "tests/**/*.ts"
```

Expected: フォーマットエラーなし。エラーがあれば `pnpm exec prettier --write ...` で修正してコミット追加。

- [ ] **Step 7.4: ビルド**

```bash
pnpm run build
```

Expected: TypeScript コンパイル成功、`dist/` 生成

- [ ] **Step 7.5: 手動動作確認**

`/tmp/agkan-manual-test` ディレクトリで実行:

```bash
mkdir -p /tmp/agkan-manual-test && cd /tmp/agkan-manual-test
node /workspace/dist/cli/index.js init
cat .claude/settings.local.json
node /workspace/dist/cli/index.js context
node /workspace/dist/cli/index.js context --hook | jq .
# 2回目で冪等性確認
node /workspace/dist/cli/index.js init
cat .claude/settings.local.json   # SessionStart の長さが 1 のままであること
cd /workspace && rm -rf /tmp/agkan-manual-test
```

Expected:
- 初回: `Created: .claude/settings.local.json (added agkan SessionStart hook)` メッセージ
- `context` 出力にプレーンテキストガイド
- `context --hook` 出力に `{"additionalContext": "..."}`
- 2 回目: `Skipped: .claude/settings.local.json (agkan hook already present)` メッセージ
- `SessionStart` 配列は 1 件のまま

- [ ] **Step 7.6: ブランチプッシュ準備 (リリースは別タスク)**

```bash
git log --oneline main..HEAD
```

Expected: タスク 1–6 の 6 件のコミットが見える。
リリース (バージョンバンプ、タグ、PR) は本計画のスコープ外。`.claude/skills/release-branch` などのリリーススキルを別途実行する。
