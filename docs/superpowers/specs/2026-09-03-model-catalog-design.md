# modelCatalog によるタスク単位 cli/model/effort 選択の設計

**日付**: 2026-09-03
**ベースブランチ**: `beta`（コミット `c84aa44` 時点。`agent: claude | codex` と `models.<agent>` による multi-agent 設定、および `tasks` テーブルの model/effort カラム化がすでに含まれる）

---

## 概要

タスク単位の model/effort override は現在 Claude 専用のエイリアス表（`fable/opus/sonnet/haiku`）と単一の effort 表（`low/medium/high/xhigh/max`）に固定されており、CLI・Board API・Board UI の 3 箇所がそれぞれこの表を参照している。一方、`.agkan.yml` の `agent:` は Claude / Codex をプロジェクト全体で 1 つだけ選ぶ。

本設計では **modelCatalog**（行 = `cli` + `model` + その model で使える `efforts`）を導入し、

- タスクで model を選ぶと、その行の `cli` でそのタスクだけを起動できる（`agent:` は「タスクに model 指定がないときの既定 cli」になる）
- model / effort の有効値は 3 箇所すべてがカタログから引く（Claude 固定の定数は廃止）
- カタログは組込既定を持ち、`.agkan.yml` で丸ごと上書きできる

ようにする。

### 現状（変更前）

- 有効値の定数: `src/board/claudePromptBuilder.ts:38-50`（`VALID_EFFORT_LEVELS` / `MODEL_ALIASES` と判定関数）
- 消費側:
  - CLI: `src/cli/commands/task/add-helpers.ts:102-129`、`src/cli/commands/task/update-helpers.ts:80-102`（フラグ検証）、`add.ts:52-53` / `update.ts:111-119`（ヘルプ文言）
  - Board API: `src/board/routes/taskRoutes.ts:85-111`（POST/PATCH の検証）
  - Board UI: `src/board/boardRenderer.ts:108-119`（Add モーダルの選択肢、サーバー描画）、`src/board/client/detailPanelHtml.ts:94-127`（詳細パネルの選択肢、クライアントバンドル）。両者は「別 TS プロジェクトのため重複」とコメントされた同一のハードコード配列
- 実行経路: `src/board/claudePromptBuilder.ts:64-81`（`resolveModelAndEffort`: task override > config）→ `src/board/routes/claudeRoutes.ts:42-48`（effort を再検証）→ `src/terminal/PtySessionService.ts:448-465`（`startProcess` 内で `resolveAgentTool(config)` により cli を決め、`buildAgentArgs` が cli 別の引数を組む）。`src/board/BulkRunService.ts:152` も同じ resolve 関数を使う
- 設定: `src/db/config.ts:5-27`（`AgentTool` / `Config`）、`:33-39`（`resolveAgentTool`）、`:45-48`（`resolveModelSettings`: `models.<agent>.<kind>` → `models.<kind>` の順で fallback）
- Codex の既定 model: `src/terminal/PtySessionService.ts:42`（`gpt-5.6-sol`）

---

## 決定事項

| 論点 | 決定 |
|---|---|
| cli 切替の単位 | タスク単位。model を選ぶと行から cli が決まる（cli 専用の選択肢は設けない） |
| カタログの置き場所 | 組込既定（ソース）+ `.agkan.yml` の `modelCatalog` で**丸ごと**上書き（行単位のマージはしない） |
| タスク側の保存形式 | 現行どおり `tasks.model_planning` / `model_run` に model 名のみ。cli は実行時にカタログで引く。マイグレーションなし |
| 行が見つからないとき | 実行時は 400 エラーで停止（既定 cli で黙って起動しない）。書き込み時はそもそも受け付けない |
| effort の検証単位 | 行ごと。model 未指定（config 既定に任せる）のときは既定 cli に属する全行の efforts の和集合 |
| config 由来の値の扱い | model は検証しない（現状どおり素通し）。effort は「行が特定できるときだけ」行で検証し、特定できなければ素通し |
| 表示形式 | `cli[model]` をそのまま表示（`claude[fable]`, `codex[gpt-5.6-sol]`）。現行の先頭大文字化（`claude[Fable]`）は廃止 |
| Codex セッション制御 | スコープ外（#707〜#713 のまま） |

---

## 1. カタログ定義と読み込み

新規ファイル `src/db/modelCatalog.ts`（CLI と board の両方から import する。マイグレーションからは import しない）。

```ts
export interface ModelCatalogEntry {
  cli: AgentTool;        // 'claude' | 'codex'
  model: string;         // CLI の --model にそのまま渡す値
  efforts: string[];     // この model で選べる effort。空配列可（effort override を選べない行）
}

export const DEFAULT_MODEL_CATALOG: readonly ModelCatalogEntry[];
export function resolveModelCatalog(config: Config): ModelCatalogEntry[];
export function findCatalogEntry(catalog, model: string, cli?: AgentTool): ModelCatalogEntry | undefined;
export function effortsForDefaultCli(catalog, cli: AgentTool): string[];   // 和集合（出現順、重複除去）
export function validateOverridePair(catalog, defaultCli, model: string | null | undefined, effort: string | null | undefined): string | undefined;
```

### 組込既定

| cli | model | efforts | 根拠 |
|---|---|---|---|
| claude | fable | low, medium, high, xhigh, max | `claude --help` の `--effort` 記載値 |
| claude | opus | 同上 | 同上 |
| claude | sonnet | 同上 | 同上 |
| claude | haiku | 同上 | 同上 |
| codex | gpt-5.6-sol | none, low, medium, high, xhigh | agkan task #707 の PoC 実測（codex-cli 0.144.1。max/ultra も受理されるが既定には含めない） |

### `.agkan.yml` の形式

```yaml
modelCatalog:
  - cli: claude
    model: fable
    efforts: [low, medium, high, xhigh, max]
  - cli: codex
    model: gpt-5.6-sol
    efforts: [none, low, medium, high, xhigh]
```

`Config` インターフェース（`src/db/config.ts:15-27`）に `modelCatalog?: ModelCatalogEntry[]` を追加する。

### 読み込み時の検証

`resolveModelCatalog` は `config.modelCatalog` が `undefined` なら既定を返す。存在する場合は以下を検証し、不正なら `resolveAgentTool` と同じく `Error` を throw する（メッセージは原因を特定できる文言にする）。

- 配列であること
- 各行: `cli` が `claude` / `codex`、`model` が空でない文字列、`efforts` が文字列配列（各要素は空でない）
- **同じ `model` 名が 2 行以上に現れない**（cli をまたいでも禁止。model 名だけで cli を一意に引くため）

空配列は有効（タスク単位の override が一切選べない状態になる）。

---

## 2. 書き込み時バリデーション（CLI / Board API 共通）

`validateOverridePair(catalog, defaultCli, model, effort)` を 1 つだけ用意し、CLI と API の両方から呼ぶ。戻り値はエラーメッセージ（有効なら `undefined`）。

ルール:

1. `model` が空でない → カタログに行が存在すること。なければ `Invalid model "x". Must be one of: <model 一覧>`
2. `effort` が空でない →
   - `model` が空でない → その行の `efforts` に含まれること
   - `model` が空 → `effortsForDefaultCli(catalog, defaultCli)` に含まれること
   - 含まれなければ `Invalid effort "x" for model "m". Must be one of: <候補>`（model 空のときは `for default cli "claude"` のように表現する）
3. 空文字 / `null` は「override を消す」指示として常に有効

検証対象は **書き込み後の実効ペア**（planning / run それぞれ）:

- `task add` / POST `/api/tasks`: 入力のみ
- `task update` / PATCH `/api/tasks/:id`: 入力にない側は保存済みの値を使う（`task update --model-run X` だけを送った場合、保存済み `effort_run` と X の組で検証する）

既定 cli は `resolveAgentTool(loadConfig())`。

変更箇所:

- `src/cli/commands/task/add-helpers.ts:102-129`（`validateModelEffortOptions` を上記関数の呼び出しに置換）
- `src/cli/commands/task/update-helpers.ts:80-102`（`validateModelAlias` / `validateEffortLevel` を廃止し、update 本体で保存済み値とマージして検証）
- `src/board/routes/taskRoutes.ts:85-111`（`validateOverrideValues` / `validateOverrideBody` を置換。PATCH では `ts.getTask` の値とマージ）
- `src/cli/commands/task/add.ts:52-53` / `update.ts:111-119` のヘルプ文言は解決済みカタログから生成（model は model 名の一覧、effort は既定 cli の和集合）

---

## 3. 実行経路

### `resolveLaunchSettings`（`resolveModelAndEffort` の置き換え）

`src/board/claudePromptBuilder.ts:64-81` を次の仕様に改める。

```ts
export interface LaunchSettings { agent: AgentTool; model?: string; effort?: string }
export function resolveLaunchSettings(taskService, taskId, command): LaunchSettings;  // 不正時は LaunchSettingsError を throw
```

手順（`kind` = command が `planning` なら `planning`、それ以外は `run`）:

1. `catalog = resolveModelCatalog(config)`、`defaultCli = resolveAgentTool(config)`
2. タスク override の model が**ある**:
   - `entry = findCatalogEntry(catalog, model)`。なければ throw（`model "x" is not in modelCatalog`）
   - `agent = entry.cli`、`model = entry.model`
3. タスク override の model が**ない**:
   - `agent = defaultCli`
   - `model = resolveModelSettings(config, kind, agent)?.model?.trim()`（`undefined` なら現状どおり CLI 側の既定。codex は `buildAgentArgs` が `gpt-5.6-sol` を補う）
   - `entry = model ? findCatalogEntry(catalog, model, agent) : undefined`（cli も一致する行だけを採用する。`agent:` の指定を優先するため）
4. `effort = タスク override の effort ?? resolveModelSettings(config, kind, agent)?.effort?.trim()`
5. `effort` があり `entry` が特定できている → `entry.efforts` に含まれなければ throw（`effort "x" is not allowed for model "m"`）。`entry` が特定できない（config の model がカタログにない）ときは検証せず素通し

`resolveModelSettings`（`src/db/config.ts:45-48`）は第 3 引数 `agent?: AgentTool` を受け取り、指定時はそれを使う（未指定時は現状どおり `resolveAgentTool(config)`）。fallback 順（`models.<agent>.<kind>` → `models.<kind>`）は変えない。

### 呼び出し側

- `src/board/routes/claudeRoutes.ts:42-48`: `resolveLaunchSettings` を呼び、throw されたら 400 でメッセージを返す。既存の effort 再検証ブロックは削除（resolve 側に吸収）
- `src/board/BulkRunService.ts:138-158`: `buildLaunchParams` が `agent` も返す。resolve が throw した場合はそのタスク ID を `skippedTaskIds`（`Set<number>`、`start()` でクリア）に記録して `selectNextTask` の候補から除外し、次へ進む。除外しないと `selectNextTask`（`src/board/BulkRunService.ts:75-104`）が `status: 'ready'` のまま残る同じタスクを選び続けて無限ループになる
- `src/terminal/PtySessionService.ts:448`: `startProcess(taskId, prompt, command = 'run', model?, effort?, agent?)` に末尾引数 `agent` を追加。`agent` 未指定時は現状どおり `resolveAgentTool(config)`。それ以外の分岐（hooks 注入の claude 限定、`buildAgentArgs`、bin 選択、prompt 注入方式）は既存の `agent` 変数を使うだけなので変更なし

---

## 4. Board UI

### カタログの配布

`src/board/boardRenderer.ts:259-262` の `configScript` に以下を追加し、クライアントは `window.modelCatalog` / `window.defaultAgent` を読む。

```js
var modelCatalog = [...];   // resolveModelCatalog(loadConfig()) の JSON
var defaultAgent = 'claude';
```

`src/board/boardRenderer.ts:108-119` と `src/board/client/detailPanelHtml.ts:94-100` の重複配列（`MODEL_ALIAS_OPTIONS` / `EFFORT_OPTIONS`）は削除する。Add モーダル（サーバー描画）はカタログを直接参照し、詳細パネル（クライアント）は `window.modelCatalog` を参照する。クライアント側の型は `src/board/client/types.ts` に `ModelCatalogEntry` と `declare const modelCatalog / defaultAgent` を置く。

### 選択肢と連動

- model セレクト: `Default (config)` + カタログ全行。表示は `cli[model]`、value は `model`
- effort セレクト: `Effort: default` + 候補。候補は選択中 model の行の `efforts`。model が `Default (config)` なら `defaultAgent` に属する行の efforts の和集合
- model セレクト変更時に effort の候補を組み直す。現在選択中の effort が新しい候補になければ空（default）に戻す
- Add モーダルと詳細パネルの両方で同じ連動ロジックを使う（クライアント側に 1 つの関数 `rebuildEffortOptions(modelSelect, effortSelect)` を置き、`src/board/client/addTaskModal.ts:245-248,282-289` と `src/board/client/detailPanel.ts:600-620` の周辺から呼ぶ）

送信する body の形（`models: { planning, run }` / `efforts: { planning, run }`。`src/board/client/detailPanelApi.ts:55-62`）は変えない。

### 保存済み値がカタログにない場合の表示

詳細パネルで、保存済みの model 名がカタログの行に存在しない場合は、その値を `(not in catalog) <model>` というラベルで選択済みの option として追加表示し、ユーザーが値を確認して変更できるようにする（黙って `Default` に見せない）。effort も同様。

---

## 5. CLI / init / docs

- `agkan config get`（`src/cli/commands/config/get.ts:31-46`）: `ResolvedConfig` に `modelCatalog: ModelCatalogEntry[]` を追加。JSON はそのまま配列、テキストは 1 行 1 エントリ（`modelCatalog: claude fable (low, medium, high, xhigh, max)`）。`agkan config get modelCatalog` の dot 記法にも乗る
- `agkan init` テンプレート（`src/cli/commands/init.ts:12-70`）: `agent:` の説明を「タスクに model 指定がないときに使う既定 cli」に更新。`models:` ブロックの後に `# modelCatalog:` を組込既定と同じ内容でコメントアウト追記
- `documentation/configuration.md` / `configuration.ja.md`: 「Model Catalog」節を新設（形式、既定、検証規則、丸ごと上書きであること、effort の候補は行ごと）。Agent Settings の説明を既定 cli の意味に更新。Models Settings の effort 説明（`low`〜`max` 固定の記述）を「カタログの行に従う」に修正
- `documentation/cli-reference.md`: `--model-planning/--model-run/--effort-planning/--effort-run` の説明を更新
- `CHANGELOG.md` / `CHANGELOG.ja.md` の Unreleased に追記（表示形式の変更 `claude[Fable]` → `claude[fable]` と、model 名の検証がカタログ基準になることを明記）

---

## 6. エラー処理

| 状況 | 挙動 |
|---|---|
| yml の `modelCatalog` が不正 | `resolveModelCatalog` が throw。CLI はメッセージを表示して exit 1、board は起動時（描画時）に 500 とログ |
| 書き込み時に model / effort が不正 | CLI: メッセージ + exit 1。API: 400 + `{ error }` |
| 実行時にタスクの model がカタログにない | `/api/claude/tasks/:id/run` は 400。BulkRun はそのタスク ID を `skippedTaskIds` に入れて以降の選択から除外し、続行 |
| 実行時に effort が行の efforts にない | 同上 |
| config の model がカタログにない | 検証しない（現状どおり素通し） |

---

## 7. テスト

- 新規 `tests/db/modelCatalog.test.ts`: 既定の内容、yml 上書き（丸ごと置換）、各検証エラー（cli 不正・model 空・efforts 型不正・model 重複）、`findCatalogEntry` の cli 指定あり/なし、`effortsForDefaultCli` の和集合、`validateOverridePair` の全分岐
- `tests/board/claudePromptBuilder.test.ts`: `resolveLaunchSettings` — 行から agent 決定 / 未登録 model で throw / model なしは `agent:` と `models.<cli>` / effort の行検証 / config 由来 effort の素通し（行が特定できないとき）と検証（行が特定できるとき）
- `tests/board/claudeRoutes.test.ts`: 未登録 model で 400、agent が `startProcess` に渡ること
- `tests/board/boardRoutes.test.ts`（taskRoutes の既存テスト）: POST/PATCH のペア検証（PATCH は保存済み値とのマージ）
- `tests/cli/commands/task/add.test.ts` / `update.test.ts`: フラグ検証がカタログ基準になること、update の保存済み値マージ
- `tests/terminal/PtySessionService.test.ts`: `agent` 引数が config の `agent:` より優先されること、未指定時は従来どおり
- `tests/cli/commands/config/get.test.ts`: `modelCatalog` の JSON / テキスト出力
- `tests/board/bulkRunService.test.ts`: resolve 失敗時にスキップして次へ進むこと
- Board UI の連動（effort 候補の組み直し）は `tests/board/client/`（jsdom 環境の既存クライアントテスト）に `rebuildEffortOptions` の単体テストを追加して検証する

---

## 8. スコープ外

- Codex セッションの hooks 注入・終了フロー・idle/blocked 検知・スキル配置（#707〜#713）。本設計で codex 行を選んだタスクは正しい cli / model / effort で spawn されるが、セッション終了などの挙動は現状の制約が残る
- `DEFAULT_CODEX_MODEL`（`src/terminal/PtySessionService.ts:42`）の変更
- `models.<agent>.<kind>.model` のカタログ検証
- 行単位のマージ、行ごとの表示ラベル指定

---

## 検討した代替案

| 案 | 採らなかった理由 |
|---|---|
| cli をプロジェクト全体で固定したまま、カタログを「選択中 cli の有効値表」としてだけ使う | ユーザー方針が「model を選べば cli が決まる」（タスク単位の切替）だったため |
| カタログをソース固定にする | model 名の変更・追加のたびにリリースが必要になる |
| カタログを `.agkan.yml` 必須にする（組込既定なし） | 既存プロジェクトが yml 追記なしで動かなくなる |
| `tasks` に `cli:model` 形式で保存 | 既存行の書き換えマイグレーションと CLI/JSON の値形式変更が必要。model 名で行を引けるなら不要 |
| `agent_planning` / `agent_run` カラムを追加 | カラム・フラグ・API・UI が増え、「model を選べば cli が決まる」方針と合わない |
| 行が見つからないとき既定 cli で起動する | codex の model 名を claude に渡すなど誤った起動になる。明示的に失敗させる方が安全 |
| effort を全行の和集合で検証する | 既定 cli が claude のとき codex 専用の `none` が選べてしまい、CLI 側で失敗する |
| BulkRun で resolve 失敗タスクを `advance()` するだけにする | `selectNextTask` が ready のまま残る同じタスクを選び続けて無限ループになる |
