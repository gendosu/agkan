# modelCatalog の main 先行マージ設計

**日付**: 2026-09-05
**ベースブランチ**: `main`（= `upstream/main` = `147fdca`。`origin/main` は 22 コミット遅れているため、マージ先は `upstream/main` と同一のローカル `main`）
**取り込み元**: `beta`（`4700f1a` 時点）

---

## 概要

`beta` には multi-agent 対応（`agent: claude | codex`）と modelCatalog（タスク単位の cli/model/effort 選択）が積まれている。このうち **modelCatalog の仕組みだけを先に `main` へ出す**。ただし公開時点で選択できるモデルは Claude の `fable` / `opus` / `sonnet` / `haiku` の 4 つに限り、Codex は組み込みカタログとドキュメントの両方から外す。

Codex を動かすコード自体（`AgentTool` 型、`agent:` 設定、`models.codex` 設定、Codex CLI 起動、`buildCodexPermissionArgs`）は `main` に入る。modelCatalog が型レベルでこれらに依存しており、切り離すと `beta` を後で `main` にマージし直すときのコンフリクトが広範に発生するためである。結果として Codex は「コードは存在するがドキュメント化されていない」状態になる。

### 現状（`main` と `beta` の差）

- `main..beta` = 39 コミット / 53 ファイル / +7,890 −414
- `main` に `src/db/modelCatalog.ts` と `src/board/client/modelOptions.ts` は存在しない
- `main` の `src/db/config.ts` の `Config` には `agent` / `modelCatalog` がなく、`models` は `planning` / `run` のフラット形式のみ
- `beta` の `src/db/modelCatalog.ts:5` が `import type { AgentTool, Config } from './config'` で、カタログ行の `cli` の型が `src/db/config.ts:6` の `AgentTool = 'claude' | 'codex'`
- `resolveModelCatalog` は `src/db/modelCatalog.ts:66-84`。`config.modelCatalog` があれば組み込み既定を**丸ごと**置き換える
- カタログの消費側 7 箇所がすべて `resolveAgentTool(config)` で既定 cli を解決している: `src/board/boardRenderer.ts:322`、`src/board/routes/taskRoutes.ts:148`、`src/board/claudePromptBuilder.ts:58`、`src/cli/commands/task/add-helpers.ts:149`、`src/cli/commands/task/update-helpers.ts:116`、`src/cli/commands/config/get.ts:35`、`src/terminal/PtySessionService.ts:463`
- Codex 固有の実装は局所的: `src/db/modelCatalog.ts:24`（カタログ行）、`src/db/config.ts` の `buildCodexPermissionArgs`、`src/terminal/PtySessionService.ts:41`（`CODEX_BIN`）/ `:330`（Codex 分岐）/ `:474`（`agentBin` 選択）
- このリポジトリ自身の `.agkan.yml:22` は `agent: claude` で、Codex は使用していない

---

## 決定事項

| 論点 | 決定 |
|---|---|
| Codex コードの扱い | `main` に入れる。`AgentTool` 型と Codex CLI 起動はそのまま残す |
| 組み込みカタログ | `DEFAULT_MODEL_CATALOG` から Codex 行を削除し、Claude の 4 行のみにする |
| Codex を隠す深さ | ドキュメントと `agkan init` テンプレートからのみ隠す。エラー文言と `agkan config get` の出力はそのまま |
| マージ手法 | `main` から新ブランチを切り、`beta` からファイル単位で取り込む（cherry-pick も beta 丸ごとマージもしない） |
| `docs/superpowers/` | `main` に取り込まない |
| 診断ログ（`9699eba`） | `main` に取り込まない |
| `README.md` / `README.ja.md` | `beta` の変更（agent selection 文言）を取り込まない |
| CHANGELOG | リリース済みの `3.21.0` 節には触れず、既存の空の `## [Unreleased]` 節に新規エントリを置く |
| `beta` 側の Codex 行 | `main` に合わせて削除する |

---

## 1. 作業ブランチと取り込み範囲

`main` から `feat/model-catalog-main` を切り、`beta` からファイル単位で取り込む。

```bash
git checkout -b feat/model-catalog-main main
git checkout beta -- src/ tests/ documentation/ CHANGELOG.md CHANGELOG.ja.md
```

| 対象 | 扱い |
|---|---|
| `src/` `tests/` `documentation/` | `beta` の内容を取り込む |
| `CHANGELOG.md` `CHANGELOG.ja.md` | 取り込んだうえで第 4 章のとおり書き直す |
| `README.md` `README.ja.md` | 取り込まない（`beta` の差分は「agent selection（Claude/Codex）」の文言追加のみで、Codex を隠す方針と矛盾する） |
| `docs/superpowers/` | 取り込まない（spec 4 件・plan 4 件、計約 5,360 行。board status transition / fable-issue-hunt skill / board run session termination など未実装トピックを含む） |
| 診断ログ | 取り込み後に戻す。`9699eba` が `src/board/routes/claudeRoutes.ts` に 5 行、`src/terminal/PtySessionService.ts` に 13 行追加（1 行削除）したもの |

## 2. コミット分割

| # | 種別 | 内容 |
|---|---|---|
| 1 | `feat` | multi-agent 基盤と modelCatalog 本体。`src/db/config.ts` `src/db/modelCatalog.ts` `src/terminal/PtySessionService.ts` `src/board/**` `src/cli/**` と対応する `tests/**`。診断ログは含めない |
| 2 | `feat` | `DEFAULT_MODEL_CATALOG` から Codex 行を削除し、期待値がずれるテストを調整 |
| 3 | `docs` | `documentation/` と `src/cli/commands/init.ts` から Codex 記述を削除 |
| 4 | `docs` | `CHANGELOG.md` / `CHANGELOG.ja.md` を `## [Unreleased]` 節に書き直し |

各コミットの時点でビルドと型チェックが通ることを条件とする。コミット 1 の時点ではカタログに Codex 行が残っているため、テストは `beta` と同じ内容で通る。

## 3. Codex を隠す範囲

### 削除する

| ファイル | 箇所 | 内容 |
|---|---|---|
| `src/db/modelCatalog.ts` | `:24` | `{ cli: 'codex', model: 'gpt-5.6-sol', efforts: CODEX_EFFORTS }` の 1 行。あわせて未参照になる `CODEX_EFFORTS`（`:17`）も削除 |
| `src/cli/commands/init.ts` | `:20` | `# Valid values: claude \| codex` を `# Valid values: claude` に |
| `src/cli/commands/init.ts` | `:46` | `# If omitted for codex, agkan defaults to gpt-5.6-sol ...` の行 |
| `src/cli/commands/init.ts` | `:55-61` | `models:` テンプレート内の `codex:` ブロック |
| `src/cli/commands/init.ts` | `:81-83` | `modelCatalog:` テンプレート内の `- cli: codex` エントリ |
| `documentation/configuration.md` | `:190-211` | `## Agent Settings` 節全体（目次の該当行も削除） |
| `documentation/configuration.md` | `:223-225` | Format 例の `- cli: codex` エントリ |
| `documentation/configuration.md` | `:230` | `cli` フィールド説明の「`claude` or `codex`」を `claude` のみに |
| `documentation/configuration.md` | `:244` | Built-in Default 表の codex 行 |
| `documentation/configuration.md` | `:251` | Validation の「a row's `cli` is neither `claude` nor `codex`」を `claude` のみに |
| `documentation/configuration.md` | `:270` `:272` `:275` `:277` `:279` `:283` | Models Settings の `<agent>` 説明・codex 既定値・破壊的変更の注記・Codex の effort 渡し方 |
| `documentation/configuration.md` | `:292` `:301` | 設定例の `agent: codex` と `codex:` ブロック |
| `documentation/configuration.ja.md` | `:177-198` | `## エージェント設定` 節全体（目次の該当行も削除） |
| `documentation/configuration.ja.md` | `:210-212` `:217` `:231` `:238` `:257` `:259` `:262` `:264` `:266` `:270` `:279` `:288` | 上記 `configuration.md` と対応する箇所 |
| `documentation/cli-reference.md` | `:629` | `config get` 出力例の `modelCatalog: codex gpt-5.6-sol (...)` 行 |
| `documentation/cli-reference.ja.md` | `:624` | 同上 |

`## Agent Settings` 節を削除すると `.agkan.yml` の `agent:` フィールド自体が文書化されなくなる。`agkan init` のテンプレートには `agent: claude`（`src/cli/commands/init.ts:22`）が残るため、既定値の Claude で使う限り利用者に不足はない。

### 残す（`beta` と同一）

- `src/db/config.ts:6` の `AgentTool = 'claude' | 'codex'`
- `resolveAgentTool` のエラー文言 `Invalid agent "<value>". Must be one of: claude, codex`
- `resolveModelCatalog` の cli 検証エラー文言 `Must be one of: claude, codex`
- `src/cli/commands/config/get.ts:17,27,45` の `models.codex` 出力
- `src/db/config.ts` の `buildCodexPermissionArgs`
- `src/terminal/PtySessionService.ts` の Codex CLI 起動一式

これらを残すのは、`beta` を後で `main` にマージし直す際のコンフリクトを減らすためである。

## 4. CHANGELOG の扱い

`beta` はリリース済みの `## [3.21.0] - 2026-09-02` 節を書き換えている（タグ `v3.21.0` は `0b3e2c3`、`main` の `package.json` も `3.21.0`）。`main` では 3.21.0 節に手を触れず、既存の空の `## [Unreleased]` 節に新規エントリとして置く。

### 含めないエントリ

- Codex の既定モデルを `gpt-5.6-sol` にする破壊的変更（#14）
- `agkan init` テンプレートと `documentation/configuration.md` / `.ja.md` の codex 例を `gpt-5.1-codex` → `gpt-5.6-sol` に更新（#735）

### 含めるエントリ（Claude のみの記述に直す）

- `modelCatalog` 設定の追加。cli の並記「`claude` / `codex`」は `claude` のみにする
- タスク単位の model / effort 検証を固定エイリアス表から `modelCatalog` 基準に変更
- Board のモデル表示を `claude[Fable]` から `claude[fable]` に変更、カタログにない値は `(not in catalog) <値>` と表示
- `modelCatalog` にない model のタスク実行を失敗させる（`POST /api/claude/tasks/:id/run` は 400、Bulk Run はスキップして続行）
- `task add` / `task update` の model/effort フラグの有効値がカタログ由来になったこと

3.21.0 で既出の「`--model-planning` 等のフラグ追加」は Unreleased 節では繰り返さず、有効値の決まり方が変わった点だけを Changed として書く。

## 5. テスト調整

`tests/` 配下で `codex` / `gpt-5.6-sol` に触れるのは 15 ファイル・109 箇所。

### 残す（multi-agent 機能そのものの検証）

- `tests/terminal/PtySessionService.test.ts`（18 箇所）— Codex CLI 起動、`--` センチネル、`agent` 引数の優先
- `tests/db/config.test.ts`（10 箇所）— `resolveAgentTool` / `buildCodexPermissionArgs` / `resolveModelSettings`

### 調整する（組み込みカタログの内容に依存）

- `tests/db/modelCatalog.test.ts`（17 箇所）— 既定カタログの中身、cli 検証
- `tests/board/client/modelOptions.test.ts`（9 箇所）— UI の選択肢生成
- `tests/cli/commands/config/get.test.ts`（12 箇所）— `config get` の出力
- `tests/cli/commands/init.test.ts`（1 箇所）— テンプレート内容
- `tests/board/boardRenderer.test.ts`（4 箇所）、`tests/board/client/addTaskModal.test.ts`（5 箇所）、`tests/board/client/detailPanelHtml.test.ts`（5 箇所）— サーバー描画とクライアント描画の選択肢

### 要確認（カタログ由来か機能由来か実装時に判別）

- `tests/board/boardRoutes.test.ts`（10 箇所）、`tests/board/claudePromptBuilder.test.ts`（12 箇所）、`tests/board/claudeRoutes.test.ts`（5 箇所）、`tests/board/bulkRunService.test.ts`（2 箇所）、`tests/cli/commands/task/add.test.ts`（3 箇所）、`tests/cli/commands/task/update.test.ts`（6 箇所）

カタログにない model を扱うケースの検証で `gpt-5.6-sol` を使っているテストは、Codex 行の削除後もそのまま「カタログにない model」の例として成立する可能性がある。実装時にテストを走らせて実際に失敗するものだけを直す。

## 6. `beta` 側の後処理

`main` へのマージ完了後、`beta` でも `src/db/modelCatalog.ts` の Codex 行を削除して `main` に揃える。これにより以後の `beta` → `main` のマージでこの行が衝突しなくなる。

`beta` でタスク単位に Codex を選びたくなった場合は `.agkan.yml` に `modelCatalog` を書く。`resolveModelCatalog`（`src/db/modelCatalog.ts:66-84`）が組み込み既定を丸ごと置き換える設計のため、Claude 4 行に Codex 行を足したカタログをそのまま定義すればよい。

## 7. 検証

| 手順 | 期待結果 |
|---|---|
| `npm run build` | 成功 |
| lint / typecheck | エラーなし |
| テスト一式（約 15 分） | 全件成功 |
| `./e2etest.sh` | 成功 |
| `git diff main -- docs/ README.md README.ja.md` | 空（`docs/superpowers/` と README を取り込んでいないこと） |
| `grep -rn "codex" documentation/` | ヒットなし |
| `grep -c "codex" src/db/modelCatalog.ts` | cli 検証のエラー文言 1 箇所のみ |
| `git diff main..feat/model-catalog-main -- CHANGELOG.md` | `## [3.21.0]` 節に変更がないこと |

PR で `main` へマージする。

## 8. スコープ外

- Codex のドキュメント公開（本設計では意図的に伏せる。公開するときは削除したドキュメントを戻す）
- `origin/main`（private）の 22 コミット遅れの解消
- `beta` に残る docs（spec / plan 8 ファイル）と診断ログの `main` への反映
- バージョン番号の bump とリリース（`release` skill の担当）
- board run session termination、board status transition バグ修正、fable-issue-hunt skill など `beta` の他トピック

---

## 検討した代替案

| 案 | 採らなかった理由 |
|---|---|
| `beta` を `main` に丸ごとマージし、あとから削除コミットを足す | `docs/superpowers/` の 8 ファイルと診断ログが `main` の履歴に一度入って残る |
| 実装コミット 28 本を cherry-pick する | 途中コミットがすべて Codex 前提のため、コンフリクト解決が最大 28 回発生し、テストが通らない中間コミットも生じる |
| Codex を完全に除去して Claude 専用の modelCatalog にする | `AgentTool` 型・`PtySessionService`・`buildCodexPermissionArgs`・`config get` まで書き換えることになり、`beta` を再マージするたびに同じ箇所で衝突する |
| カタログの Codex 行だけ消し、ドキュメントの Agent Settings 節は残す | 「デフォルトエージェントを Codex にできる」multi-agent 対応が公式ドキュメント上は公開されてしまう |
| エラー文言と `config get` 出力からも Codex を消す | 利用者からは完全に隠れるが、`main` と `beta` で文言とテスト期待値が食い違い、`config.ts` / `modelCatalog.ts` / `get.ts` とそのテストで再マージ時に衝突する |
| `beta` では Codex 行を残す | `main` の削除と `beta` の存在が毎回のマージで衝突し、merge-base の取り方によっては削除が黙って勝つ事故が起きる |
| `beta` の CHANGELOG 差分をそのまま持ち込む | リリース済みの `3.21.0` 節（タグ `v3.21.0`）の改変になる |
