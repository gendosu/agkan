# タスク単位 model/effort override のカラム化設計

**日付**: 2026-08-30
**対象ブランチ**: beta

---

## 概要

タスク単位の Claude model/effort override（planning/run それぞれの model・reasoning effort 指定）は現在 `task_metadata` テーブルに汎用キー（`model:planning` / `model:run` / `effort:planning` / `effort:run`）として保存されている。これを `priority` / `branch` と同様に `tasks` テーブルの専用カラムへ切り出し、CLI・Board API・Board UI から一貫した方法で取得・設定できるようにする。

### 現状（変更前）

- `src/board/taskModelOverride.ts` — `MetadataService` 経由で4キーを get/set する薄いラッパー
- 消費側:
  - `src/board/claudePromptBuilder.ts:51-62`（`resolveModelAndEffort`）
  - `src/board/BulkRunService.ts:140-166`（`buildLaunchParams` 内にほぼ同一ロジックを重複保持 — backlog task #724 で指摘済み）
  - `src/board/routes/taskRoutes.ts:114-115,162-163`（POST/PATCH での書き込み）
  - `src/board/client/detailPanelHtml.ts` / `src/board/boardRenderer.ts`（UI ドロップダウン）
- CLI には専用フラグがなく、汎用 `agkan task meta set/get` でしか触れない
- 既存データ例: task #689 に `model:run=sonnet`, `model:planning=sonnet` が metadata として保存済み

---

## 決定事項

| 論点 | 決定 |
|---|---|
| 既存 metadata の扱い | マイグレーション内でバックフィル後、`task_metadata` の該当行を削除する（単一の正、参照元の分岐を残さない） |
| CLI 露出範囲 | `branch`/`priority` と同様、`task add`/`task update` に専用フラグ、`task get --json` に露出（`task list --json` には含めない） |
| 値のバリデーション | CLI/API 双方で不正値をエラー拒否する。有効値リストは `claudePromptBuilder.ts` を正とし、CLI もそこから import して共用する |
| #724 との関係 | `resolveModelAndEffort` に一元化することで model/effort 解決ロジックの重複は解消する。プロンプト文字列重複（`exitInstruction`/`branchInstruction`）は対象外のまま残す — #724 の本文をその範囲に絞って更新する（クローズしない） |

---

## アプローチ比較

| 案 | 内容 | 判断 |
|---|---|---|
| **A. フラットカラム×4（採用）** | `tasks.model_planning` / `model_run` / `effort_planning` / `effort_run` を独立した NULL 許容 TEXT カラムとして追加 | `priority`/`branch` の実績パターンに合致。単純な SQL、既存の `buildUpdateClauses` にそのまま追加できる |
| B. JSON1カラム | `tasks.run_options TEXT` に `{planning:{model,effort}, run:{model,effort}}` を JSON 格納 | クエリ・ソート不可、既存の平坦カラム規約と不整合。将来の柔軟性という推測に基づく過剰設計（YAGNI 違反）につき不採用 |

---

## 設計詳細

### 1. スキーマ / マイグレーション

新規マイグレーション `src/db/migrations/20260830000000_add_model_effort_overrides_to_tasks.ts` を追加する。`20260516000000_add_branch_to_tasks.ts`（`PRAGMA table_info` チェック付き ALTER TABLE パターン）と `20260328000000_initial_schema.ts:234-250`（`task_metadata` からのバックフィル→削除パターン、`priority` で実績あり）を組み合わせる。

```typescript
// 疑似コード
1. PRAGMA table_info(tasks) で未追加のカラムのみ ALTER TABLE tasks ADD COLUMN <col> TEXT DEFAULT NULL（4本）
2. SELECT task_id, key, value FROM task_metadata
   WHERE key IN ('model:planning','model:run','effort:planning','effort:run')
3. 各行について:
   - key → カラム名マッピング（例: 'model:run' → 'model_run'）
   - UPDATE tasks SET <col> = value WHERE id = task_id AND <col> IS NULL
   - DELETE FROM task_metadata WHERE task_id = ? AND key = ?
```

`AND <col> IS NULL` ガードは `priority` バックフィルと同じ安全策（再実行時に上書きしない）。

### 2. 型定義・DB アダプタ

- `src/models/Task.ts:34,55,78` — `Task` / `CreateTaskInput` / `UpdateTaskInput` に `model_planning?`, `model_run?`, `effort_planning?`, `effort_run?`（`string | null`）を追加。`branch` フィールドと同じ書き方。
- `src/db/adapters/sqlite-storage-backend.ts`
  - `create()` の INSERT 文・パラメータ配列に4本追加
  - `buildUpdateClauses()` の `fields` 配列に4本追加
- `src/services/ExportImportService.ts:36,127,170` — export/import 型・シリアライズ・デシリアライズに追加（`branch` と同パターン）

### 3. CLI

- `src/cli/commands/task/add.ts` / `update.ts` に以下を追加:
  - `--model-planning <alias>`
  - `--model-run <alias>`
  - `--effort-planning <level>`
  - `--effort-run <level>`
  - `update` では空文字でクリア（`--priority ""` と同じ挙動）
- `src/cli/commands/task/update-helpers.ts`
  - `SUPPORTED_FIELDS` に `model_planning`, `model_run`, `effort_planning`, `effort_run` を追加
  - `validateModelAlias(val, formatter)` / `validateEffortLevel(val, formatter)` を新設。`validatePriority` と同じ形（`formatter.error` + 使用可能値一覧をメッセージに含める）
- `src/cli/commands/task/get.ts` — JSON整形・テキスト表示に4フィールド追加（`branch` と同じ場所・同じ扱い）
- `src/cli/commands/task/add-helpers.ts` の `taskToJson` — 4フィールド追加
- `src/cli/commands/task/copy.ts` — 4フィールドをコピー対象に追加
- `task list --json` には含めない（既存の `branch` 除外方針を踏襲）

### 4. バリデーション値の一本化

`src/board/claudePromptBuilder.ts:35-38` に既存の `VALID_EFFORT_LEVELS` / `isValidEffortLevel` をそのまま CLI からも import して再利用する。同モジュールに `MODEL_ALIASES = ['fable','opus','sonnet','haiku'] as const` / `isValidModelAlias` を新設し、同様に共用する。

`src/cli/commands/board.ts` が既に `src/board/*` を import している前例があるため、CLI → board の依存追加は既存パターンの延長であり新たな循環依存は生じない。

Board detail panel（`src/board/client/detailPanelHtml.ts`）はクライアント側の別 tsconfig プロジェクトのため独自コピーのまま維持する（#724 が別途指摘済みの論点であり、今回のスコープ外）。

### 5. Board API / 解決ロジックの一元化

- `src/board/taskModelOverride.ts`
  - `getTaskModelOverride` / `getTaskEffortOverride` の第一引数を `MetadataService` → `TaskService` に変更し、内部で `taskService.getTask(taskId)` を呼んでカラムを読むだけの実装に変更する
  - `persistTaskModelOverrides` / `persistTaskEffortOverrides` も `taskService.updateTask(taskId, {...})` でカラムを書く実装に変更する。関数シグネチャ（呼び出し側インターフェース）は極力維持し、呼び出し元の変更を最小化する
- `src/board/claudePromptBuilder.ts:51-62` の `resolveModelAndEffort` — 引数を `ms: MetadataService` → `taskService: TaskService` に変更するのみで、ロジック本体は変えない
- `src/board/BulkRunService.ts:140-166`
  - `buildLaunchParams` 内の重複インライン解決ロジック（157-159行）を削除し、`resolveModelAndEffort(this.taskService, taskId, 'run')` を呼ぶ形に統一する
  - コンストラクタの `ms?: MetadataService` を `taskService?: TaskService` に置き換え、`undefined` 時のフォールバック挙動（config 直読み）は維持する
- `src/board/routes/taskRoutes.ts:114-115,162-163` — 呼び出し方は維持（内部実装が metadata からカラムに変わるのみ）

---

## テスト

- `tests/db/migrations/` — バックフィル＋削除の新規マイグレーションテスト（`tests/db/migrations/initial_schema.test.ts` の priority 移行テストと同型）
- `tests/board/taskModelOverride.test.ts` — `TaskService` ベースの実装に書き換え
- `tests/board/claudePromptBuilder.test.ts` / `tests/board/bulkRunService.test.ts` / `tests/board/claudeRoutes.test.ts` — 既存の `ms.setMetadata(...)` セットアップを `taskService.updateTask(...)` またはカラム直接投入に置き換え
- CLI の新規バリデーション関数（`validateModelAlias`/`validateEffortLevel`）・新フラグの単体テスト追加
- `ExportImportService` の export/import ラウンドトリップテストに4フィールド追加

---

## 対応しないこと（スコープ外）

- `src/board/client/detailPanelHtml.ts` / `boardRenderer.ts` の `MODEL_ALIAS_OPTIONS`/`EFFORT_OPTIONS` 重複解消（クライアント側は別 tsconfig プロジェクトのため今回は着手しない）
- #724 のプロンプト文字列重複（`exitInstruction`/`branchInstruction`）の解消
- `task list --json` への露出（`branch` と同じ除外方針を踏襲）
