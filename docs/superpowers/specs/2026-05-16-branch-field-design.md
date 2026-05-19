# Branch Field Feature Design

**Date:** 2026-05-16
**Status:** Approved (Revised)

## Overview

タスクにgitブランチを紐付ける機能を追加する。タスク作成モーダルとdetailパネルのdetailsタブに、ブランチ名の選択・手動入力UIを提供する。タスク実行時にはブランチの存在確認とcheckoutを自動で行い、「実行時に自動生成」が選択されている場合（または未設定のレガシータスクの場合）はClaudeがdescriptionを読んでブランチ名を生成・作成してから作業を開始する。

UIは「Autoボタン＋テキスト入力」方式ではなく、**ドロップダウンの固定トップ項目として「✨ 実行時に自動生成」を提供する** 方式を採る。

## Architecture

### データ層

**新規マイグレーション:** `src/db/migrations/20260516000000_add_branch_to_tasks.ts`

```sql
ALTER TABLE tasks ADD COLUMN branch TEXT DEFAULT NULL;
```

**型定義の更新:** `src/models/Task.ts` の `Task` / `CreateTaskInput` / `UpdateTaskInput` 各インターフェースに `branch?: string | null` を追加。`src/board/client/types.ts` の `TaskData` にも同フィールドを追加。

### マーカー値

「実行時に自動生成」を選択した状態をDBに表現するために、専用のマーカー文字列を用いる。

- **マーカー値: `<auto-generate>`**
- `<` `>` はgitのブランチ名として無効な文字（git check-ref-format で reject される）なので、実在のブランチ名と衝突しない
- `src/models/Task.ts` に定数として `export const BRANCH_AUTO_GENERATE = '<auto-generate>';` を定義し、サーバ／クライアントで共有

`NULL` も `BRANCH_AUTO_GENERATE` と同等に扱う（後述）。既存タスクをマイグレーションする必要はない。

### API

**新規エンドポイント:** `GET /api/git/branches`

- サーバーで `git branch -a` を実行し、ブランチ一覧を返す
- レスポンス: `{ "branches": ["main", "develop", "task/123-fix-bug", ...] }`
- リモートブランチは `remotes/origin/` プレフィックスを除いて返す
- git実行失敗時は `{ "branches": [] }` を返す

**既存エンドポイントの更新:**

- `POST /api/tasks` — `branch` フィールドを受け付ける
- `PATCH /api/tasks/:id` — `branch` フィールドを受け付ける（`null` 明示で値クリアも可）

`branch` の検証は行わず、文字列を素通しで保存する。`<auto-generate>` マーカーも単なる文字列として保存。

### UI — タスク作成モーダル (addTaskModal)

**対象ファイル:** `src/board/boardRenderer.ts` (`getAddTaskModal()`), `src/board/client/addTaskModal.ts`

priorityドロップダウンの下に `branch` フィールドを追加する。**Autoボタンは設置しない。**

```
[ Title                         ]
[ Description                   ]
[ Priority ▼ ]
[ Branch: ✨ 実行時に自動生成    ]    ← input (デフォルト選択中表示)
[ Tags                          ]
```

クリック時のドロップダウン:

```
┌─ branch dropdown ──────────────────────┐
│ ✨ 実行時に自動生成              ✓     │ ← 固定トップ項目（選択中マーク）
├────────────────────────────────────────┤
│ main                                    │
│ feature/foo                             │
│ beta                                    │
│ ...                                     │
└────────────────────────────────────────┘
```

#### 動作仕様

- **デフォルト選択**: モーダルを開いた時点で「✨ 実行時に自動生成」が選択済み（内部値 `<auto-generate>`）。inputには表示テキスト `✨ 実行時に自動生成` が読み取り専用で表示される。
- **ドロップダウン表示**: input にフォーカス／クリックすると `GET /api/git/branches` を1回だけ呼んでブランチ一覧を取得し、ドロップダウンを表示。
- **固定トップ項目**: 「✨ 実行時に自動生成」を常にドロップダウンの最上部に固定表示。区切り線でgit branch一覧と視覚的に分離。
- **既存ブランチ選択**: ブランチ名をクリックするとinput値がそのブランチ名に設定され、input は通常のテキスト入力モードに切り替わる。
- **手動入力**: 「実行時に自動生成」が選択されている状態でinputにタイプし始めると、自動的に手動入力モードへ切り替わり（マーカーは外れる）、入力値で既存ブランチ一覧をフィルタリングする。存在しないブランチ名の入力も許可（新規ブランチ作成扱い）。
- **「実行時に自動生成」への戻し**: ドロップダウンから固定トップ項目を再選択すれば、マーカー状態へ戻せる。

#### 状態管理（クライアント側）

| UI状態 | input表示 | 内部値（送信値） |
|---|---|---|
| Auto（デフォルト） | `✨ 実行時に自動生成`（読み取り専用） | `<auto-generate>` |
| 既存branch選択中 | `feature/foo`（編集可） | `feature/foo` |
| 手動入力中 | ユーザー入力テキスト | 入力文字列 |

submitAddTask() の fetch body には常に**内部値**（表示テキストではなく、Auto時は `<auto-generate>`、それ以外はinputの編集可能な文字列）を `branch` として送信する。inputに表示される `✨ 実行時に自動生成` はあくまでユーザー向け表示で、送信値ではない。

### UI — detailパネル

**対象ファイル:** `src/board/client/detailPanelHtml.ts`, `src/board/client/detailPanel.ts`

detailsタブのpriorityフィールドの下に、**addTaskModalと同一の構造・挙動のbranch入力UI**を配置する。

#### 動作仕様

- **初期表示**: 既存タスクの `branch` フィールド値に基づく:
  - `NULL` または `<auto-generate>` → `✨ 実行時に自動生成` を表示
  - それ以外の文字列 → 実ブランチ名を表示
- **編集**: addTaskModalと同じドロップダウン／手動入力／マーカー戻しのインタラクションを提供。
- **保存**: 既存の `collectEditedTaskFields()` で `branch` を収集し、`PATCH /api/tasks/:id` で送信。

### タスク実行時のブランチ処理

**対象ファイル:** `src/board/boardRoutes.ts` の `POST /api/claude/tasks/:taskId/run` ハンドラ

`startProcess()` 実行前、タスクの `branch` フィールド値に応じて処理を分岐する。

#### branch が実ブランチ名の場合（`null` でも `<auto-generate>` でもない文字列）

1. `git branch --list <branch>` でローカルに存在するか確認
2. 存在する → `git checkout <branch>` を実行してからClaudeを起動
3. 存在しない → `git checkout -b <branch>` でブランチを作成してからClaudeを起動

**コマンドインジェクション対策**: `execSync` のテンプレートリテラル展開ではなく、`execFileSync('git', ['checkout', branch], ...)` のように引数を配列で渡す形に統一する。または事前にgit-check-ref-format相当のregexバリデーションを行う。

#### branch が `null` または `<auto-generate>` の場合

Claudeへのプロンプトに以下の指示を追加する：

```
このタスクのtitleとbodyを読み、作業内容に適したgitブランチ名を生成してください。
形式: task/<taskId>-<kebab-case>（英数字とハイフンのみ、最大60文字）
生成したブランチ名で git checkout -b を実行してから作業を開始し、
作業開始後に PATCH /api/tasks/<taskId> で branch フィールドにブランチ名を保存してください。
```

- Claude自身がdescriptionを読んでブランチ名を意味的に判断する
- `git checkout -b` の実行もClaude（タスクエージェント）が担う
- DBの `branch` フィールド更新もClaude側がAPI経由で行う
- `null` と `<auto-generate>` を同一扱いすることで、本機能導入前に作成された既存タスクをマイグレーション無しでサポート

## Data Flow

```
ユーザー操作（作成/編集）
    │
    ├─ デフォルト → branch = '<auto-generate>'
    ├─ dropdown選択 → branch = 既存ブランチ名
    ├─ 手動入力 → branch = ユーザー入力
    ├─ フォーカス時 GET /api/git/branches → サジェスト表示
    └─ 保存 → POST or PATCH /api/tasks にbranchを含めて送信
                    │
                    └─ DB: tasks.branch に保存

タスク実行（Run）
    │
    ├─【branch = 実ブランチ名】
    │   ├─ git branch --list で存在確認
    │   ├─ git checkout <branch> or git checkout -b <branch>
    │   └─ Claude起動
    │
    └─【branch = NULL or '<auto-generate>'】
        ├─ プロンプトに自動生成・作成指示を追加
        ├─ Claude起動
        └─ Claude が自律的に:
            ├─ description読み込み → ブランチ名生成
            ├─ git checkout -b <generated-branch>
            └─ PATCH /api/tasks/:id でbranchを保存
```

## Error Handling

- `GET /api/git/branches` 失敗時: 空配列を返し、ドロップダウンは固定トップ項目のみ表示（手動入力は可能）
- `git checkout` 失敗時: 500を返してプロセス起動を中止、エラーメッセージをレスポンスに含める
- Claude生成ブランチ名が不正な場合: Claudeがリトライまたはフォールバック名を使用（プロンプト側でガード）

## Testing

- DBマイグレーションのテスト: `branch` カラムの追加・idempotency確認
- `GET /api/git/branches` のAPIテスト: 正常系・git失敗時の空配列
- `POST /api/tasks` / `PATCH /api/tasks/:id` でbranchフィールドが保存されること（マーカー値・実ブランチ名・null それぞれ）
- 実行時ブランチ処理のテスト:
  - branch=実ブランチ名 → git checkoutが実行される
  - branch=`<auto-generate>` → プロンプトに生成指示が追加される
  - branch=null → プロンプトに生成指示が追加される（後方互換）
- UIテスト（手動）:
  - addTaskModalを開いた時点で「実行時に自動生成」が選択されている
  - ドロップダウンの固定トップ項目をクリックすると入力欄が表示テキストに戻る
  - 既存ブランチ選択 → 手動編集 → ドロップダウンで「実行時に自動生成」に戻せる
  - detailパネルで既存タスク（branch=NULL）を開くと「実行時に自動生成」表示

## Out of Scope

- クライアント側でのtitleからのbranch slug生成（旧Autoボタン機能）は本機能で廃止
- branch名のバリデーション・正規化（サーバ側で許可しない文字を弾く等）
- 既存branch=NULLタスクのDB一括マイグレーション
