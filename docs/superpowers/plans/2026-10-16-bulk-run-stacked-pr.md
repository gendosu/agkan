# 一括 run（pr）依存タスクの stacked PR 化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一括 run（pr）で、依存のある後続タスクを先行タスクの PR の上に積み、単純なケースでマージ待ちの停止をなくす。

**Architecture:** board（agkan-private）は、一括 run 終了時の status 上書きだけを直す。積むか待つかの判断と git 操作は agkan-subtask スキルが行う。鎖の形は agkan-planning-subtask が依存関係の登録で担保する。stack の付け替えとマージは GitHub に任せる。

**Tech Stack:** TypeScript + vitest（agkan-private）、Markdown スキル（agkan-skills）、`gh` 2.101.0、GitHub stacked pull requests

**Spec:** /home/app/agkan-private/docs/superpowers/specs/2026-10-16-bulk-run-stacked-pr-design.md

## Global Constraints

- 先行の自動並べ替え（既存 PR の rebase・付け替え）はしない
- 例外は理由を記録して `in_progress` のまま待機する。例外を網羅的に拾う仕組みは作らない
- board のタスク選択（`src/board/taskSelection.ts:42`）は変えない
- 単体 run の起動プロンプト（`src/board/claudePromptBuilder.ts:40-44`）は変えない
- agkan-private は `origin/main` から `feat/bulk-run-stacked-pr` を、agkan-skills は `origin/main` から `feat/stacked-pr-dependent-tasks` を切って作業し、両方とも最後に PR を作る
- `git add -A` / `git add .` は使わず、ファイルを明示して stage する
- GitHub 上の捨て用リポジトリの作成・削除は外部への操作のため、実行前にユーザーの承認を得る

## Review Focus

1. 先行の PR が draft のまま `review` になっている場合: `state` は `OPEN` なので積み先として扱われる。agkan-subtask は review 時に `gh pr ready` を実行するので、通常は起きない。積んでも問題ないことを Task 6 で確認する
2. 先行が 1 つだけで、その PR 自体が別の stack の上にある場合: 鎖の一番下の base が既定ブランチでなくても積める（spec 設計 2-4）。Task 3 の判定手順に明記してある
3. 一括 run が pr で exit 0 になったが、スキルが `in_progress` のまま終えた場合（ユーザーが端末で exit した等）: `review` に進めてしまう。spec の完了条件の範囲外。挙動として許容し、Task 2 のテストで固定する
4. 再開時（Case A）に `stack_base` の PR がマージ済み: 衝突チェックは既定ブランチに対して行う。Task 3 の手順に含める
5. `done` のタスクを `review` に戻さない: Task 2 のテストで固定する

---

### Task 1: 事前検証 S1〜S3（捨て用リポジトリ）

**Files:**
- Modify: `/home/app/agkan-private/docs/superpowers/specs/2026-10-16-bulk-run-stacked-pr-design.md`（末尾に「事前検証の結果」節を追加）

**Interfaces:**
- Produces: 「事前検証の結果」節に次の 3 つを記録する。Task 3 と Task 5 はこれを読む
  - `STEP6_VARIANT`: `A`（`--base` 指定だけで足りる）または `B`（native stack 登録が必要。その場合は実行した正確なコマンド列）
  - `S3_LOWER_STATE`: 一番上をマージしたときの下の PR の `state` / `mergedAt`
  - `S3_AUTOMERGE`: stack の PR で `gh pr merge --auto` が使えたか

- [ ] **Step 1: ユーザーに承認を得る**

捨て用 private リポジトリ `gendosu/agkan-stack-spike` の作成と、検証後の削除について承認を得る。

- [ ] **Step 2: リポジトリと gh-stack 拡張を準備する**

```bash
gh_() { GITHUB_TOKEN="lsec://global/GITHUB_TOKEN" lsec run -- gh "$@"; }
SPIKE=/tmp/claude-1000/-app/82f15431-6b89-47e7-8ae7-313d2f08b3ad/scratchpad/agkan-stack-spike
gh_ extension install github/gh-stack
gh_ repo create gendosu/agkan-stack-spike --private --add-readme --clone "$SPIKE"
cd "$SPIKE" && git checkout -b develop && git push -u origin develop
gh_ repo edit gendosu/agkan-stack-spike --default-branch develop --delete-branch-on-merge=false
```

Expected: `git ls-remote --heads origin develop` が 1 行出る

> `gh_` はシェル関数なので、Bash の呼び出しをまたいで残らない。以降の各ステップで `gh_ ...` と `SPIKE=...` を使う前に、毎回この 2 行を先頭で定義し直す。

- [ ] **Step 3: S2 — `--base` 指定だけの積み方を試す（自動削除なし）**

```bash
cd "$SPIKE"
git checkout -b feat/a develop && echo a > a.txt && git add a.txt && git commit -m a && git push -u origin feat/a
gh_ pr create --base develop --head feat/a --title A --body A
git checkout -b feat/c feat/a && echo c > c.txt && git add c.txt && git commit -m c && git push -u origin feat/c
gh_ pr create --base feat/a --head feat/c --title C --body C
gh_ pr merge feat/a --merge
sleep 10; gh_ pr view feat/c --json state,baseRefName
```

Expected（記録する）: C の `baseRefName` が `develop` に変わったか、`feat/a` のままか

- [ ] **Step 4: S2 — 自動削除ありで同じことを試す**

```bash
gh_ repo edit gendosu/agkan-stack-spike --delete-branch-on-merge=true
# Step 3 と同じ手順を feat/a2, feat/c2 で繰り返す
git checkout -b feat/a2 develop && echo a2 > a2.txt && git add a2.txt && git commit -m a2 && git push -u origin feat/a2
gh_ pr create --base develop --head feat/a2 --title A2 --body A2
git checkout -b feat/c2 feat/a2 && echo c2 > c2.txt && git add c2.txt && git commit -m c2 && git push -u origin feat/c2
gh_ pr create --base feat/a2 --head feat/c2 --title C2 --body C2
gh_ pr merge feat/a2 --merge
sleep 10; gh_ pr view feat/c2 --json state,baseRefName
```

Expected（記録する）: C2 の `baseRefName` が `develop` になり `state` が `OPEN` か

- [ ] **Step 5: S1 — native stack を非対話で積めるか試す**

```bash
git checkout develop && git pull
git checkout -b feat/a3 develop && echo a3 > a3.txt && git add a3.txt && git commit -m a3 && git push -u origin feat/a3
gh_ pr create --base develop --head feat/a3 --title A3 --body A3
gh_ stack --help
gh_ stack init --help
gh_ stack submit --help
```

ヘルプから「既存ブランチ `feat/a3` を一番下の層として取り込み、新ブランチ `feat/c3` を積んで submit する」非対話の手順を組み、実行する。TTY がない状態を再現するため、各コマンドは `< /dev/null` を付けて実行する。

Expected（記録する）: 成功したコマンド列。`gh_ pr view feat/c3 --json baseRefName` が `feat/a3` になり、PR 画面に stack map が出ること

- [ ] **Step 6: S3 — 一番上をマージしたときの下の PR の状態と auto-merge**

Step 5 の stack（A3 → C3）で次を実行する。

```bash
gh_ pr merge feat/c3 --auto --merge; echo "auto=$?"
gh_ pr merge feat/c3 --merge
sleep 10
gh_ pr view feat/a3 --json state,mergedAt
gh_ pr view feat/c3 --json state,mergedAt
```

Expected（記録する）: `auto=` の値。A3 と C3 の `state` / `mergedAt`

- [ ] **Step 7: 結果を spec に追記してコミットする**

spec の末尾に次の節を足す（値は Step 3〜6 の実測値で埋める）。

```markdown
---

## 事前検証の結果（2026-10-16 実施）

| ID | 結果 |
|---|---|
| S1 | <成功したコマンド列、または不可とその理由> |
| S2（自動削除なし） | <C の baseRefName> |
| S2（自動削除あり） | <C2 の baseRefName と state> |
| S3 | 下の PR: <state / mergedAt>。auto-merge: <可否> |

- STEP6_VARIANT: <A または B>
- S3_LOWER_STATE: <値>
- S3_AUTOMERGE: <値>
```

STEP6_VARIANT の決め方: skillth（ /app ）の「マージ後にブランチを自動削除」設定を `gh_ repo view gendosu/skillth --json deleteBranchOnMerge` で確認する。その設定での S2 の結果で、後続の base が `develop` に付け替わるなら `A`、付け替わらないなら `B` とする。

```bash
cd /home/app/agkan-private
git add docs/superpowers/specs/2026-10-16-bulk-run-stacked-pr-design.md
git commit -m "docs(spec): record stacked PR spike results"
```

- [ ] **Step 8: 捨て用リポジトリを削除する（承認済みの場合のみ）**

```bash
gh_ repo delete gendosu/agkan-stack-spike --yes
```

Task 6 で同じリポジトリを使う場合は、Task 6 の後に削除する。

---

### Task 2: board — 一括 run 終了時の status 上書きを修正する

**Files:**
- Modify: `/home/app/agkan-private/src/board/BulkRunService.ts:1-7`（import）、`:186-190`（終了時の status 更新）
- Test: `/home/app/agkan-private/tests/board/bulkRunService.test.ts`（`describe('BulkRunService - auto status update on completion'`、513 行付近に追加）

**Interfaces:**
- Consumes: `runTargetStatus(command: string): TaskStatus | null`（`src/utils/runTargetStatus.ts:9`）、`TaskService.getTask(id: number)`
- Produces: なし（スキル側からは「pr の一括 run は終了時に `done` を書かない」挙動として観測される）

- [ ] **Step 1: 失敗するテストを書く**

`tests/board/bulkRunService.test.ts` の `describe('BulkRunService - auto status update on completion', () => {` ブロック内、最初の `it` の直後に追加する。

```ts
  it('updates task status to review (not done) when a pr bulk run exits with exitCode 0', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let outputCallback: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      outputCallback = cb;
      return () => {};
    });
    const pty = buildMockPty({ subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('pr');
    outputCallback?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();

    expect(ts.getTask(task.id)?.status).toBe('review');

    service.stop();
  });

  it('keeps review when a pr bulk run exits after the skill already moved the task to review', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let outputCallback: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      outputCallback = cb;
      return () => {};
    });
    const pty = buildMockPty({ subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('pr');
    ts.updateTask(task.id, { status: 'review' });
    outputCallback?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();

    expect(ts.getTask(task.id)?.status).toBe('review');

    service.stop();
  });

  it('does not move a done task back to review when a pr bulk run exits with exitCode 0', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let outputCallback: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      outputCallback = cb;
      return () => {};
    });
    const pty = buildMockPty({ subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('pr');
    ts.updateTask(task.id, { status: 'done' });
    outputCallback?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();

    expect(ts.getTask(task.id)?.status).toBe('done');

    service.stop();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/app/agkan-private && pnpm vitest run tests/board/bulkRunService.test.ts -t "pr bulk run"`
Expected: 1 件目と 2 件目が FAIL（`expected 'done' to be 'review'`）。3 件目は現状でも PASS になり得る（`done` を `done` で上書きするため）

- [ ] **Step 3: 最小限の実装を書く**

`src/board/BulkRunService.ts` の import に追加する。

```ts
import { runTargetStatus } from '../utils/runTargetStatus';
import type { TaskStatus } from '../models';
```

クラスの外（`POLL_INTERVAL_MS` の下）に追加する。

```ts
// The agent's own skill already moved these forward; a bulk-run exit must not rewind them.
const SETTLED_STATUSES: ReadonlySet<TaskStatus> = new Set(['review', 'done', 'closed']);
```

`launchTask` 内の次の箇所を置き換える。

```ts
        if (evt.kind === 'done' && evt.exitCode === 0 && !this.claudeProcess.isExplicitUserStop(taskId)) {
          this.ts.updateTask(taskId, { status: 'done' });
        }
```

置き換え後:

```ts
        if (evt.kind === 'done' && evt.exitCode === 0 && !this.claudeProcess.isExplicitUserStop(taskId)) {
          const current = this.ts.getTask(taskId);
          if (current && !SETTLED_STATUSES.has(current.status)) {
            this.ts.updateTask(taskId, { status: runTargetStatus(ptyCommand) ?? 'done' });
          }
        }
```

`ptyCommand` は同じ関数内の `const { prompt, ptyCommand, model, effort, agent } = params;` で取り出し済み。

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/app/agkan-private && pnpm vitest run tests/board/bulkRunService.test.ts`
Expected: 全件 PASS。既存の `updates task status to done when the task exits with exitCode 0`（`start('direct')`）と `still updates task status to done when the completion follows a hook-driven stop` も PASS のまま

既存テストのうち `toHaveBeenCalledWith(task.id, { status: 'done' })` を spy で検証しているものが、`getTask` の追加で落ちた場合は、タスクの初期 status が `ready` であることを確認する（`ready` なら更新される）。

- [ ] **Step 5: lint と型チェック**

Run: `cd /home/app/agkan-private && pnpm run lint && pnpm run type-check`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
cd /home/app/agkan-private
git add src/board/BulkRunService.ts tests/board/bulkRunService.test.ts
git commit -m "fix(board): keep pr bulk-run tasks at review instead of forcing done on exit"
```

コミット本文に Why を書く: 「pr の一括 run が exit 0 で status を done に上書きしていたため、PR 未マージのタスクが done になり、それに依存する後続タスクが既定ブランチから起動されていた（skillth #1506 / #1504、2026-10-15）」

---

### Task 3: agkan-subtask — 先行 PR の上に積む

**Files:**
- Modify: `/home/app/agkan-skills/skills/agkan-subtask/SKILL.md`（Step 2 Case A / Case B、Step 6、Step 9）
- Modify: `/home/app/agkan-skills/CHANGELOG.md`（`## [Unreleased]`）

**Interfaces:**
- Consumes: Task 1 の `STEP6_VARIANT`
- Produces: タスク metadata `stack_base`（積み先ブランチ名）。Task 5 と、以後の Case A 再開がこれを読む

- [ ] **Step 1: ブランチを切る**

```bash
cd /home/app/agkan-skills && git fetch origin && git checkout -b feat/stacked-pr-dependent-tasks origin/main
```

- [ ] **Step 2: Case B を置き換える**

`**Case B — Branch is null:**` から `Then continue to Step 3.` までを次に置き換える。

````markdown
**Case B — Branch is null:**

First decide the branch to start from (the *stack base*).

1. Collect the unresolved blockers — blockers whose status is not `done`:

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
agkan task block list <id> --json | jq -r '.blockedBy[] | select(.status != "done") | "\(.id) \(.status)"'
```

2. If there are no unresolved blockers, the stack base is `$DEFAULT_BRANCH`. Go to "Create the branch".

3. Every unresolved blocker must satisfy all of the following:
   - its status is `review`
   - it has a PR URL: the `PR: <URL>` label in its body, or else its `pr` metadata (`agkan task meta get <blocker-id> pr --json | jq -r '.data.value // empty'`)
   - `gh pr view <URL> --json state,headRefName,baseRefName` returns `state` = `OPEN`

4. The unresolved blockers' PRs must form one chain: every PR except the bottom one has a `baseRefName` equal to the `headRefName` of another PR in the set, and walking down from the top PR visits every PR in the set. The top PR is the one whose `headRefName` is not the `baseRefName` of any other PR in the set. The bottom PR's base may be any branch.

5. If step 3 or step 4 fails, this is a stacking exception. Record in the task body which blocker failed which condition, leave the task as `in_progress`, do not create a branch, and stop. The task waits for a human.

6. Otherwise the stack base is the top PR's `headRefName`. Record it:

```bash
agkan task meta set <id> stack_base <stack-base>
```

**Create the branch.** Generate a branch name from the task ID and title:

- If the task has a `bug` or `security` tag → prefix `fix/`
- Otherwise → prefix `feat/`
- Format: `<prefix>/<id>-<title-slug>` (e.g., `feat/42-add-login-page`)

```bash
git fetch origin
git checkout -b <branch-name> origin/<stack-base>
```

Then continue to Step 3.
````

- [ ] **Step 3: Case A の衝突チェックを置き換える**

Case A の次のブロックを置き換える。

````markdown
```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
git merge-base --is-ancestor origin/$DEFAULT_BRANCH HEAD
```
````

置き換え後:

````markdown
```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
STACK_BASE=$(agkan task meta get <id> stack_base --json 2>/dev/null | jq -r '.data.value // empty')
# A stacked branch is checked against its stack base until that base's PR has merged.
CHECK_BASE=$DEFAULT_BRANCH
if [ -n "$STACK_BASE" ] && git ls-remote --exit-code --heads origin "$STACK_BASE" >/dev/null \
  && [ "$(gh pr view "$STACK_BASE" --json state -q .state 2>/dev/null)" = "OPEN" ]; then
  CHECK_BASE=$STACK_BASE
fi
git merge-base --is-ancestor origin/$CHECK_BASE HEAD
```
````

同じ Case A 内のエラーメッセージの `'$DEFAULT_BRANCH'` を `'$CHECK_BASE'` に変える。

- [ ] **Step 4: Step 6（PR 作成）を変える**

`gh pr create --draft --title "<title>" --body "<body>"` のコードブロックを、Task 1 の `STEP6_VARIANT` に応じて置き換える。

STEP6_VARIANT = A の場合:

````markdown
```bash
STACK_BASE=$(agkan task meta get <id> stack_base --json 2>/dev/null | jq -r '.data.value // empty')
gh pr create --draft --base "${STACK_BASE:-$DEFAULT_BRANCH}" --title "<title>" --body "<body>"
```

When `stack_base` is set, the PR is stacked on the blocker's PR. GitHub retargets it to the default branch when the blocker's PR merges.
````

STEP6_VARIANT = B の場合: 上のブロックの `gh pr create` 行の後に、spec の「事前検証の結果」の S1 欄に記録したコマンド列を、`STACK_BASE` が空でないときだけ実行する `if [ -n "$STACK_BASE" ]; then ... fi` で囲んで追記する。

- [ ] **Step 5: Step 9（セルフレビュー）の差分範囲を変える**

プロンプト内の次の行を置き換える。

```
Review the git changes (run `git diff origin/<default-branch>...HEAD` to see them) against the original plan and coding standards. Check for correctness, security issues, and code quality.
```

置き換え後:

```
Review the git changes (run `git diff origin/<stack-base-or-default-branch>...HEAD` to see them) against the original plan and coding standards. Check for correctness, security issues, and code quality.
```

Step 9 の冒頭（`Delegate(` の前）に 1 文足す。

```markdown
Use the task's `stack_base` metadata as the diff base when it is set, so the blocker's changes are not reviewed again.
```

- [ ] **Step 6: CHANGELOG に追記する**

`/home/app/agkan-skills/CHANGELOG.md` の `## [Unreleased]` の下に追加する。

```markdown
### Added

- **agkan-subtask**: 先行タスクが `review`（PR OPEN）で 1 本の鎖に並んでいる場合、後続タスクのブランチを先行 PR のブランチから切り、PR をその上に積むように変更。一括 run で先行 PR のマージを待って後続タスクが止まる状態をなくすため。鎖にならない場合は理由を記録して `in_progress` のまま待機する
```

- [ ] **Step 7: 文面を検証する**

Run: `cd /home/app/agkan-skills && rg -n "stack_base|stack-base|CHECK_BASE" skills/agkan-subtask/SKILL.md`
Expected: Case B（記録）、Case A（衝突チェック）、Step 6（PR 作成）、Step 9（差分範囲）の 4 箇所すべてに出る

Run: `cd /home/app/agkan-skills && rg -n "origin/<default-branch>" skills/agkan-subtask/SKILL.md`
Expected: 0 件

- [ ] **Step 8: コミット**

```bash
cd /home/app/agkan-skills
git add skills/agkan-subtask/SKILL.md CHANGELOG.md
git commit -m "feat(agkan-subtask): stack dependent tasks on their blocker's open PR"
```

---

### Task 4: agkan-planning-subtask — 依存の 1 本化と確認タスクの禁止

**Files:**
- Modify: `/home/app/agkan-skills/skills/agkan-planning-subtask/SKILL.md`（Step 2 Blocking Relationship Setup、109-131 行付近）
- Modify: `/home/app/agkan-skills/CHANGELOG.md`

**Interfaces:**
- Produces: 「後続タスクの先行は 1 本の鎖に並ぶ」という不変条件。Task 3 の Case B step 4 はこれを前提にする

- [ ] **Step 1: Step 2 の末尾に追記する**

Step 2 の `Register blocking relationships when:` の箇条書きの後、`### 3.` の前に追加する。

````markdown
**Keep each task's blockers on one chain.** Dependent tasks are stacked on their blocker's open PR (see `agkan-subtask`), and a stack is a single chain. When this task has two or more blockers that do not already block one another in a line, add blocking relationships between the blockers so they form one chain. Put the blocker with the higher priority lower in the chain; on equal priority, put the smaller task ID lower.

```bash
# Example: this task (C) is blocked by A and B, and A is lower in the chain
agkan task block add <A-id> <B-id>
```

**Do not create verification-only follow-up tasks.** A task whose only work is "confirm after another task's PR merges", with no code change of its own, must not be created or moved to Ready. Move its checklist items into the blocker task's task list, record the reason in this task's body, and close it:

```bash
agkan task update <id> status closed
```
````

- [ ] **Step 2: CHANGELOG に追記する**

Task 3 で足した `### Added` の下に追加する。

```markdown
- **agkan-planning-subtask**: 先行が複数あるタスクでは先行同士にも依存を登録して 1 本の鎖にするように変更。また「先行のマージ後に確認するだけ」のタスクは作らず、確認項目を先行タスクへ移して close するように変更。後続タスクを先行 PR の上に積めるようにするため
```

- [ ] **Step 3: 文面を検証する**

Run: `cd /home/app/agkan-skills && rg -n "one chain|verification-only" skills/agkan-planning-subtask/SKILL.md`
Expected: 2 件以上

- [ ] **Step 4: コミット**

```bash
cd /home/app/agkan-skills
git add skills/agkan-planning-subtask/SKILL.md CHANGELOG.md
git commit -m "feat(agkan-planning-subtask): keep blockers on one chain and drop verify-only tasks"
```

---

### Task 5: agkan-review — stack のマージ判定（条件付き）

**Files:**
- Modify: `/home/app/agkan-skills/skills/agkan-review/SKILL.md:80-90`（状態と遷移の表）
- Modify: `/home/app/agkan-skills/CHANGELOG.md`

**Interfaces:**
- Consumes: Task 1 の `S3_LOWER_STATE`

- [ ] **Step 1: 要否を判定する**

`S3_LOWER_STATE` の `state` が `MERGED` なら、このタスクは変更なしで完了とし、spec の「事前検証の結果」に「agkan-review は変更不要」と追記してコミットする。

```bash
cd /home/app/agkan-private
git add docs/superpowers/specs/2026-10-16-bulk-run-stacked-pr-design.md
git commit -m "docs(spec): note agkan-review needs no change for stacked merges"
```

`MERGED` 以外なら Step 2 へ進む。

- [ ] **Step 2: 判定表に行を足す（`MERGED` 以外だった場合のみ）**

`| `CLOSED` (mergedAt is null) | `closed` | ...` の行の前に、S3 で観測した状態を `done` として扱う行を足す。例として、観測値が「`state` = `CLOSED` で、stack の上位 PR がマージ済み」だった場合:

```markdown
| `CLOSED` and the PR was merged as part of a stack (`gh pr view <URL> --json mergeCommit -q .mergeCommit` is non-null) | `done` | `agkan task update <id> status done` | Increment `done_count` |
```

条件式は S3 で観測した実際のフィールドに合わせる。観測値がこの例と違う場合は、その観測値で判定する行にする。

- [ ] **Step 3: CHANGELOG に追記してコミットする**

```markdown
### Fixed

- **agkan-review**: stack の上位 PR でまとめてマージされた下位 PR を `closed` ではなく `done` と判定するように修正
```

```bash
cd /home/app/agkan-skills
git add skills/agkan-review/SKILL.md CHANGELOG.md
git commit -m "fix(agkan-review): treat PRs merged as part of a stack as done"
```

---

### Task 6: 受け入れ確認（捨て用リポジトリで一括 run）

**Files:**
- なし（確認のみ。結果は spec の「事前検証の結果」の下に「受け入れ確認」として追記）

**Interfaces:**
- Consumes: Task 2〜5 の成果物

- [ ] **Step 1: 変更したスキルを Codex が読む場所に一時的に配置する**

Codex は /home/app/.agents/skills/ のコピーを読む（2026-10-02 に GitHub から入れたもの）。退避してから差し替える。

```bash
BK=/tmp/claude-1000/-app/82f15431-6b89-47e7-8ae7-313d2f08b3ad/scratchpad/agents-skills-backup
mkdir -p "$BK"
for s in agkan-subtask agkan-planning-subtask agkan-review; do
  cp -a /home/app/.agents/skills/$s "$BK/"
  cp /home/app/agkan-skills/skills/$s/SKILL.md /home/app/.agents/skills/$s/SKILL.md
done
```

- [ ] **Step 2: board をビルドして捨て用リポジトリで起動する**

```bash
cd /home/app/agkan-private && pnpm run build
cd "$SPIKE" && git checkout develop && git pull && agkan init
agkan task add "A: add a.md" --status ready --priority high
agkan task add "C: add c.md that links to a.md" --status ready --priority medium
agkan task block add <A-id> <C-id>
agkan board start --port 4410
```

インストール済みの `agkan` は /home/app/agkan-private/dist を直接読む（ /home/app/agkan-private/bin/agkan ）。そのためビルド後は、skillth（ /app ）で新しく起動するセッションも修正後のコードで動く。既に起動中の /app の board プロセスは、再起動するまで古いコードのまま動く。

`.agkan.yml` の `models.run.agent` を `codex` にする（skillth の /app/.agkan.yml:37-38 と同じ）。

- [ ] **Step 3: 一括 run（pr）を実行して観測する**

board の Ready 列ヘッダの一括 run ボタンで `pr` を選ぶ。両方のセッションが終わったら:

```bash
agkan task get <A-id> --json | jq -r .task.status   # Expected: review
agkan task get <C-id> --json | jq -r .task.status   # Expected: review
agkan task meta get <C-id> stack_base --json | jq -r .data.value   # Expected: A のブランチ名
gh_ pr view <C の PR> --json baseRefName -q .baseRefName            # Expected: A のブランチ名
agkan ps                                                            # Expected: 実行中なし
```

- [ ] **Step 4: マージ後の付け替えと done 判定を観測する**

```bash
gh_ pr ready <A の PR>; gh_ pr merge <A の PR> --merge
sleep 10; gh_ pr view <C の PR> --json baseRefName -q .baseRefName   # Expected: develop
```

この後 agkan-review を実行し、A が `done`、C が `review` のままであることを確認する。続けて C をマージし、再度 agkan-review を実行して C が `done` になることを確認する。

- [ ] **Step 5: 後片付けと記録**

```bash
for s in agkan-subtask agkan-planning-subtask agkan-review; do
  cp -a "$BK/$s/." /home/app/.agents/skills/$s/
done
diff -q "$BK/agkan-subtask/SKILL.md" /home/app/.agents/skills/agkan-subtask/SKILL.md && echo restored
```

spec に「受け入れ確認」節を足し、Step 3・4 の観測値を書いてコミットする。捨て用リポジトリは Task 1 Step 8 の手順で削除する（承認済みの場合のみ）。

```bash
cd /home/app/agkan-private
git add docs/superpowers/specs/2026-10-16-bulk-run-stacked-pr-design.md
git commit -m "docs(spec): record acceptance results for stacked bulk runs"
```

---

## 検討して採らなかった案

- board のタスク選択で積み先を決めて、プロンプトで渡す案: ユーザーの判断で、判断はスキルに置いた
- 例外時に pr でも明示的な `exit` でセッションを終える案: 例外は待機でよいという決定に基づき、範囲外とした
- 既存の skillth の OPEN な PR を stack に移行する作業: spec の範囲外
