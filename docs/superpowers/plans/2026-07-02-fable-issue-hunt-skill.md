# fable-issue-hunt スキル 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 呼び出すと Fable 5 が agkan コードベースの課題を4軸で並列発見し、重複排除して agkan タスクへ完全自動登録するスキル `fable-issue-hunt` を作る。

**Architecture:** `.claude/skills/fable-issue-hunt/SKILL.md` に、オーケストレーター向けのワークフローを記述する。オーケストレーターは (1) 既存タスク取得 → (2) `model=fable` サブエージェント4体を並列 spawn → (3) findings 統合・重複排除 → (4) `agkan task add` + `agkan tag attach` で登録 → (5) 報告、の順で実行する。成果物はコードではなく Markdown スキル1ファイル。

**Tech Stack:** Claude Code スキル（Markdown + YAML frontmatter）、agkan CLI（`./bin/agkan`）、Agent ツール（model=fable）。

## Global Constraints

- スキル配置: `.claude/skills/fable-issue-hunt/SKILL.md`（このプロジェクトの既存スキルと同じ場所）
- frontmatter は `name` と `description` の2キーのみ（既存 `.claude/skills/release/SKILL.md` に準拠）
- agkan CLI 呼び出しは `./bin/agkan` を使う
- agkan priority の有効値: `critical, high, medium, low`（他の値は使わない）
- agkan task add のデフォルト status は `backlog`。本スキルでは `backlog` で登録する
- タグ付けは2段階: `./bin/agkan task add ... --json` で id 取得 → `./bin/agkan tag attach <id> <tag>`
- タグ規則: Board 関連 → `board` / CLI 関連 → `cli`（プロジェクト CLAUDE.md 準拠）
- Fable への探索プロンプトでは、推測・「おそらく」・「可能性」・「将来実装予定」の記述を禁止し、全 finding に `file:line` 根拠を必須化する
- 登録は完全自動（登録前確認なし）、末尾に登録一覧とスキップした重複を必ず報告する
- スキル本文の説明的文章は日本語で記述する

---

### Task 1: スキル雛形（frontmatter + 概要 + ワークフロー骨子）

**Files:**
- Create: `.claude/skills/fable-issue-hunt/SKILL.md`

**Interfaces:**
- Produces: スキル `fable-issue-hunt`（後続タスクが同ファイルに Fable プロンプト・登録ロジックを追記する土台）

- [ ] **Step 1: frontmatter と概要・ワークフロー骨子を記述**

`.claude/skills/fable-issue-hunt/SKILL.md` を新規作成し、以下を記述する。

```markdown
---
name: fable-issue-hunt
description: Use when you want to discover project issues with Fable 5 and turn them into agkan tasks. Triggers on "課題を棚卸し", "Fableで課題発見", "課題を洗い出してタスク化", "issue hunt".
---

# fable-issue-hunt

## Overview

Fable 5 に agkan コードベースの課題を4軸（バグ / 技術的負債 / テスト / UX）で並列発見させ、
重複を排除して agkan タスクへ完全自動登録するスキル。メインセッションはオーケストレーター
として探索・統合・登録・報告を統括し、実際の発見は `model=fable` のサブエージェントが担う。

## Workflow

1. 事前準備: 既存 agkan タスクを取得（重複排除の基準集合）
2. 並列探索: `model=fable` サブエージェント4体を1メッセージで並列 spawn
3. 統合・重複排除: 4軸の findings を集約し、既存タスク・findings 相互の重複を除外
4. 登録: 残った findings を agkan タスク化（priority 写像・タグ付与）
5. 報告: 登録件数・軸別内訳・スキップした重複を一覧提示

各ステップの詳細は以降のセクションに従う。
```

- [ ] **Step 2: frontmatter の妥当性を検証**

Run: `head -4 .claude/skills/fable-issue-hunt/SKILL.md`
Expected: 1行目と4行目が `---`、間に `name: fable-issue-hunt` と `description:` が1行ずつ存在する（既存 `.claude/skills/release/SKILL.md` と同じ2キー構成）。

- [ ] **Step 3: コミット**

```bash
git add .claude/skills/fable-issue-hunt/SKILL.md
git commit -m "feat(skill): add fable-issue-hunt skill skeleton"
```

---

### Task 2: 事前準備セクション（既存タスク取得）

**Files:**
- Modify: `.claude/skills/fable-issue-hunt/SKILL.md`（`## 1. 事前準備` セクションを追記）

**Interfaces:**
- Consumes: Task 1 の SKILL.md
- Produces: `## 1. 事前準備` セクション（後続の重複排除が参照する既存タスク取得手順）

- [ ] **Step 1: 事前準備セクションを追記**

SKILL.md の末尾に以下を追記する。

````markdown
## 1. 事前準備

重複排除の基準として、既存タスク（done/closed 含む全件）を JSON で取得する。

```bash
./bin/agkan task list --all --json
```

取得した各タスクの `title` と `body` を、後続の重複判定に用いる基準集合として保持する。
探索対象は `src/`（本体ロジック）と `tests/`（テスト資産）を中心とする。
````

- [ ] **Step 2: 記載コマンドの構文を実機検証**

Run: `./bin/agkan task list --all --json | head -c 200`
Expected: JSON 配列（またはオブジェクト）が出力され、エラーにならない。

- [ ] **Step 3: コミット**

```bash
git add .claude/skills/fable-issue-hunt/SKILL.md
git commit -m "feat(skill): add pre-flight existing-task fetch section"
```

---

### Task 3: 並列 Fable 探索セクション（4軸プロンプト + 出力スキーマ）

**Files:**
- Modify: `.claude/skills/fable-issue-hunt/SKILL.md`（`## 2. 並列探索` セクションを追記）

**Interfaces:**
- Consumes: Task 2 の基準集合手順
- Produces: `## 2. 並列探索` セクション。各 Fable サブエージェントが返す findings JSON スキーマ（`title`, `dimension`, `severity`, `evidence`, `suggestion`）を後続タスクへ供給する

- [ ] **Step 1: 並列探索セクション（共通指示 + 出力スキーマ + 4軸レンズ）を追記**

SKILL.md の末尾に以下を追記する。

````markdown
## 2. 並列探索（次元別並列 Fable）

`Agent` ツールで `model: "fable"` のサブエージェントを **4体、1メッセージ内で並列** に spawn する。
各エージェントは以下の1軸のみを担当する。

### 各エージェント共通の指示（プロンプト骨子）

- 対象: agkan（TypeScript 製 CLI かんばんタスク管理ツール）の `src/` と `tests/`
- 証拠主義を厳守すること:
  - すべての finding に `file:line` と、コードで確認できた具体的根拠を必須で付ける
  - 「推測」「おそらく」「可能性」「将来実装予定」の記述は禁止。実際に確認できた事実のみ
- 出力は次の JSON スキーマの配列のみ（説明文を混ぜない）:

```json
[
  {
    "title": "簡潔な課題名（日本語）",
    "dimension": "bug | tech-debt | test | ux",
    "severity": "high | medium | low",
    "evidence": "path/to/file.ts:123 — 確認できた具体的根拠",
    "suggestion": "対処の方向性"
  }
]
```

### 軸ごとの評価レンズ（`dimension` は固定）

- **bug**: 実際に動作を壊す欠陥のみ（ロジック誤り・エッジケース未処理・エラーハンドリング漏れ）。理論上の懸念は除外
- **tech-debt**: 肥大化ファイル・責務の曖昧さ・重複・境界不明瞭など構造的課題
- **test**: テストカバレッジ不足・脆いテスト・CI/品質のギャップ
- **ux**: CLI の使い勝手・Board 機能・不足機能などユーザー体験面

各エージェントには自軸の `dimension` 値と対応するレンズのみを渡し、findings 配列を返させる。
````

- [ ] **Step 2: スキーマの自己整合を確認**

Run: `grep -nE '"dimension"|bug | tech-debt | test | ux' .claude/skills/fable-issue-hunt/SKILL.md`
Expected: 出力スキーマの `dimension` 取り得る値（`bug`, `tech-debt`, `test`, `ux`）が、軸ごとレンズの見出しと一致していることを目視確認できる。

- [ ] **Step 3: コミット**

```bash
git add .claude/skills/fable-issue-hunt/SKILL.md
git commit -m "feat(skill): add parallel Fable exploration section with 4-dimension prompts"
```

---

### Task 4: 統合・重複排除・登録・報告セクション

**Files:**
- Modify: `.claude/skills/fable-issue-hunt/SKILL.md`（`## 3. 統合・重複排除`, `## 4. 登録`, `## 5. 報告` を追記）

**Interfaces:**
- Consumes: Task 3 の findings JSON スキーマ、Task 2 の既存タスク基準集合
- Produces: 完結した登録・報告手順（severity→priority 写像、タグ付与、報告フォーマット）

- [ ] **Step 1: 統合・重複排除・登録・報告セクションを追記**

SKILL.md の末尾に以下を追記する。

````markdown
## 3. 統合・重複排除

4体のサブエージェントが返した findings 配列をすべて集約する。次を重複として除外する。

- 既存 agkan タスク（第1節で取得）と title・内容が実質同一のもの
- findings 相互で実質同一のもの（同一の `file:line` × 同種の課題）

除外したものは「スキップした重複」として控え、第5節で報告する。

## 4. 登録（完全自動）

重複排除後の各 finding について、以下を実行する。登録前の確認は行わない。

### 4-1. severity → priority 写像

- `high` → `high`
- `medium` → `medium`
- `low` → `low`
（agkan priority の有効値は `critical, high, medium, low`。本スキルは上記3値のみ使用する）

### 4-2. タスク作成（id を取得）

```bash
./bin/agkan task add "<title>" "<body>" --priority <priority> --status backlog --json
```

- `<body>` には `evidence` と `suggestion` を Markdown で含める
- `--json` 出力から作成タスクの `id` を取得する

### 4-3. タグ付与

タグ規則（プロジェクト CLAUDE.md 準拠）に従い、必要なタグを attach する。

- 課題が Board 機能・Board 関連 → `board`
- 課題が CLI コマンド・CLI 改善 → `cli`
- 両方該当 → 両方 attach / どちらでもない → タグなし

```bash
./bin/agkan tag attach <id> board
./bin/agkan tag attach <id> cli
```

タグが未存在の場合は先に作成する。

```bash
./bin/agkan tag add board
./bin/agkan tag add cli
```

（既存タグ一覧は `./bin/agkan tag list` で確認できる）

## 5. 報告

登録完了後、以下を必ず提示する。

- 登録件数の合計と、軸別内訳（bug / tech-debt / test / ux）
- 登録した全タスクの一覧: `id` / `title` / `dimension` / 付与タグ
- スキップした重複の一覧: `title` / 重複と判断した理由
````

- [ ] **Step 2: 登録・タグコマンドの構文を実機検証（dry 相当）**

Run:
```bash
./bin/agkan task add "fable-issue-hunt 構文検証用" "検証用ダミー" --priority low --status backlog --json
```
Expected: JSON が返り、作成タスクの `id` が含まれる。続けて `id` を使い `./bin/agkan tag list` で `board`/`cli` の存在を確認し、`./bin/agkan tag attach <id> cli`（無ければ `tag add cli` の後）でエラーにならないことを確認する。検証後 `./bin/agkan task delete <id>` で後片付けする。

- [ ] **Step 3: コミット**

```bash
git add .claude/skills/fable-issue-hunt/SKILL.md
git commit -m "feat(skill): add dedup, registration and reporting sections"
```

---

### Task 5: エンドツーエンド検証

**Files:**
- Modify: `.claude/skills/fable-issue-hunt/SKILL.md`（必要なら文言修正のみ）

**Interfaces:**
- Consumes: 完成した SKILL.md 全体

- [ ] **Step 1: スキル構造の最終確認**

Run: `sed -n '1,999p' .claude/skills/fable-issue-hunt/SKILL.md | grep -nE '^## '`
Expected: `## Overview`, `## Workflow`, `## 1. 事前準備`, `## 2. 並列探索`, `## 3. 統合・重複排除`, `## 4. 登録`, `## 5. 報告` が順に並ぶ。プレースホルダ（TBD/TODO）が無いことを目視確認する。

- [ ] **Step 2: プレースホルダ・矛盾スキャン**

Run: `grep -nEi 'tbd|todo|後で|あとで|fixme' .claude/skills/fable-issue-hunt/SKILL.md`
Expected: 該当なし（出力ゼロ）。

- [ ] **Step 3: ライブ動作確認（任意・ユーザー承認時）**

ユーザーが承認した場合のみ、実際にスキルを起動して1回通しで実行し、Fable 4体の並列探索 →
重複排除 → agkan 登録 → 報告が想定どおり動くことを確認する。登録されたタスクを `./bin/agkan
task list --json` で確認する。

- [ ] **Step 4: 最終コミット（修正があれば）**

```bash
git add .claude/skills/fable-issue-hunt/SKILL.md
git commit -m "docs(skill): finalize fable-issue-hunt skill"
```

---

## Self-Review

- **Spec coverage**: 目的(Task1) / 4軸探索(Task3) / 証拠主義・スキーマ(Task3) / 重複排除(Task4) / priority写像・タグ規則(Task4) / 完全自動登録・報告(Task4) / スキル配置・メタ(Task1) — 仕様の全節に対応タスクあり。
- **Placeholder scan**: Task5 Step2 でスキャンを実施。計画本文にプレースホルダなし。
- **Type consistency**: findings スキーマのキー（title/dimension/severity/evidence/suggestion）と dimension 値（bug/tech-debt/test/ux）、priority 値（high/medium/low）を Task3・Task4 で一貫使用。agkan コマンドは全タスクで `./bin/agkan` に統一。
