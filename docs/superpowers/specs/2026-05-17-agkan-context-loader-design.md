# agkan context ローダー設計 (Claude Code SessionStart hook 統合)

- 作成日: 2026-05-17
- 関連タスク: agkan #581 (agkanのhooks機能)
- 対象バージョン: v3.11.0 (MINOR バージョンアップ)

## 1. 背景と目的

`agkan init` で初期化したプロジェクトを Claude Code で操作する際、現状ではユーザーが手動で `/agkan-skills:agkan` スキルを呼び出すか、`agkan agent-guide` を実行するまで、Claude は agkan の使い方を知らない。

本設計では、`agkan init` を拡張して Claude Code の SessionStart hook を自動セットアップし、セッション開始時に最小限の agkan 使用ガイドが自動的にコンテキストへ注入される仕組みを導入する。

### スコープ
- agkan の使い方ガイド (CLI コマンド一覧と簡易説明) を Claude Code セッション開始時に自動ロード

### スコープ外
- Gemini CLI / Codex CLI / Copilot CLI 等、Claude Code 以外のエージェント対応
- プロジェクト状態 (in_progress タスク数等) の動的表示
- `agkan claude install` 等の独立サブコマンド化
- agkan 側 hook 機構 (task.add 等で発火するイベントフック) — task 581 の本来テーマは別途検討

## 2. アーキテクチャ概要

```
agkan init
   │
   ├─→ 従来処理: .agkan.yml, .agkan/, デフォルトタグ
   │
   └─→ 新規処理: ClaudeIntegrator
          │
          ├─→ .claude/ 存在確認 (なければ作成)
          ├─→ .claude/settings.local.json 読み込み (なければ空オブジェクト)
          ├─→ hooks.SessionStart に agkan hook entry をマージ
          │     - 既存に同一 command が存在すればスキップ (冪等)
          └─→ JSON 書き戻し

セッション起動時 (Claude Code 側)
   │
   └─→ SessionStart hook 発火
          │
          └─→ `agkan context` 実行
                 │
                 └─→ stdout に最小ガイドを出力
                        │
                        └─→ Claude Code がセッションコンテキストへ注入
```

### 新規・変更コンポーネント

| ファイル | 種別 | 役割 |
|---|---|---|
| `src/cli/commands/context.ts` | 新規 | `agkan context` コマンド定義と出力テキスト定数 |
| `src/cli/integrations/claudeSettings.ts` | 新規 | `.claude/settings.local.json` のマージロジック |
| `src/cli/commands/init.ts` | 変更 | ClaudeIntegrator 呼び出しを追加 |
| `src/cli/index.ts` | 変更 | `setupContextCommand(program)` を呼び出して `context` コマンドを Commander に登録 |

## 3. `agkan context` コマンド

### 振る舞い
- デフォルト: stdout に最小ガイドをプレーンテキストで出力。終了コード 0。
- `--hook` フラグ指定時: 単一行 JSON `{"additionalContext": "<最小ガイド>"}` を stdout に出力。
- 既存 `agkan agent-guide` の `--hook` 規約に合わせる (`src/cli/commands/agent-guide.ts`)。
- DB アクセスなし。副作用なし。

### 出力サンプル

```
This project uses agkan (Agent Kanban) for task management.

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
```

### 設計判断
- 出力形式は既存 `agent-guide` の規約に従う (デフォルトはプレーンテキスト、`--hook` で JSON `{additionalContext}`)
  - 一貫性のため、SessionStart hook から呼ぶ際は `agkan context --hook` を使う
- 出力は静的文字列 (DB アクセスしない)
  - 速度重視・副作用なし・テスト容易。動的な状態情報は本スコープ外
- 出力テキストは `context.ts` 内の定数として保持 (テンプレート分離は YAGNI)

## 4. settings.local.json マージロジック

### 書き込まれるエントリ

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "agkan context --hook" }
        ]
      }
    ]
  }
}
```

### matcher を `startup|resume|clear|compact` にする理由
- `startup`: 新規セッション開始時
- `resume`: 過去セッション復帰時。コンテキスト再注入が必要
- `clear`: `/clear` 後は履歴消失するため再注入
- `compact`: 自動コンパクション後も再注入

matcher の仕様は Claude Code 公式ドキュメント (https://code.claude.com/docs/en/hooks) で確認済み。pipe `|` 区切りの単一文字列で複数値マッチが可能。`startup`/`resume`/`clear`/`compact` の 4 値が SessionStart の全有効値。

### マージアルゴリズム (擬似コード)

```
読み込み:
  if (!exists(.claude/)) mkdir
  fileExisted = exists(settings.local.json)
  rawText    = fileExisted ? read(settings.local.json) : "{}"
  config     = JSON.parse(rawText)
  indent     = fileExisted ? detectIndent(rawText) : 2  // 既存スタイル維持

スキップ判定 (冪等性):
  for (entry of config.hooks?.SessionStart ?? []) {
    for (hook of entry.hooks ?? []) {
      if (hook.type === "command" && hook.command === "agkan context --hook") {
        log "Skipped: .claude/settings.local.json (agkan hook already present)"
        return  // init は他処理を継続
      }
    }
  }

マージ:
  config.hooks ??= {}
  config.hooks.SessionStart ??= []
  config.hooks.SessionStart.push({
    matcher: "startup|resume|clear|compact",
    hooks: [{ type: "command", command: "agkan context" }]
  })

書き戻し:
  write(settings.local.json, JSON.stringify(config, null, indent))
  log fileExisted
    ? "Updated: .claude/settings.local.json (added agkan SessionStart hook)"
    : "Created: .claude/settings.local.json (added agkan SessionStart hook)"
```

**補足:**
- スキップ・マージのいずれの分岐でも、`init` 本体の他処理 (`.agkan.yml` 生成、`.agkan/` 作成、デフォルトタグ作成) は継続する。Claude 統合は init の最後に呼ばれる任意処理である。
- `detectIndent` は既存 JSON の先頭のインデント幅 (タブ/スペース) を検出して維持する。検出不能時は 2 スペースをデフォルトとする。`detect-indent` 等の小さなライブラリ、または自前の簡易実装で対応する。

### エラー処理
- JSON パース失敗 → 警告ログを出して当該処理だけスキップ (`agkan init` 全体は失敗させない)
- 書き込み失敗 → 警告ログを出して当該処理だけスキップ
- いずれもデフォルトタグ作成と同じく「非クリティカル警告」として扱う

### init 時のコンソール出力
- ファイル新規作成時: `Created: .claude/settings.local.json (added agkan SessionStart hook)`
- 既存ファイルにマージ追加時: `Updated: .claude/settings.local.json (added agkan SessionStart hook)`
- agkan hook が既に存在しスキップ時: `Skipped: .claude/settings.local.json (agkan hook already present)`

判定は読み込み時の `fileExisted` フラグと冪等性ループ結果による (擬似コード参照)。

### 設計判断
- 書き込み先は `.claude/settings.local.json` (`.claude/settings.json` ではない)
  - `settings.local.json` は gitignore 慣習に乗っており、個人マシン単位の opt-in 設定として適切
  - チーム内の Claude Code 非利用者に影響を与えない
- 既存 hook や他の設定キーには一切触らない
- 冪等性は `command === "agkan context --hook"` の一致で判定する
- 既存ファイルのインデントスタイルは維持する (タブ/スペース、幅とも)。検出不能時は 2 スペース

## 5. テスト戦略

### `agkan context` 単体テスト (`tests/unit/cli/commands/context.test.ts`)
- stdout に期待キーフレーズが含まれる ("agkan task list", "agkan task add", "agkan agent-guide" 等)
- 終了コード 0
- 副作用なし (DB アクセスしない)

### ClaudeIntegrator 単体テスト (`tests/unit/cli/integrations/claudeSettings.test.ts`)
- `.claude/` が存在しないケース → 作成される
- `settings.local.json` が存在しないケース → 新規作成され hook が記述される
- 既存に他の hook が存在するケース → 既存を保ったまま agkan hook が追加される
- 既存に agkan hook が存在するケース → 変更なし (冪等)
- 既存に空の `hooks` プロパティが存在するケース → 正しく初期化される
- 既存ファイルがタブインデントのケース → 書き戻し後もタブを維持
- 既存ファイルが 4 スペースインデントのケース → 書き戻し後も 4 スペースを維持
- JSON パース不能ファイル → エラー処理されて `init` 全体は失敗しない
- 書き込み失敗 (権限なし等) → エラー処理されて `init` 全体は失敗しない

### init 統合テスト (`tests/unit/cli/commands/init.test.ts` 既存ファイル拡張)
- `init` 実行後に `.claude/settings.local.json` が存在し agkan hook を含む
- 既に agkan hook がある状態で `init` 再実行 → 重複しない (冪等)

### E2E テスト (`tests/e2e/` 既存スクリプト拡張)
- `agkan init` 実行 → `.claude/settings.local.json` 生成確認
- `agkan context` 実行 → stdout に期待文字列確認

### テストフィクスチャの隔離
- 既存の init テスト同様、`tmp/test-*` 等の隔離ディレクトリで `process.chdir` を使う
- テスト後にディレクトリクリーンアップ

## 6. バージョニング・ドキュメント・後方互換

### バージョニング (`.claude/rules/versioning.md` 準拠)
- 新規 `agkan context` コマンド追加 + `agkan init` の振る舞い拡張 (機能追加・後方互換)
- → **MINOR バージョンアップ**: 現在 v3.10.0 → v3.11.0

### 後方互換性
- `agkan init` の既存挙動は完全に保持 (`.agkan.yml`, `.agkan/`, デフォルトタグ作成)
- 新規処理は追記のみ。既存 `settings.local.json` の他キー・他 hook は破壊しない
- 旧バージョンの agkan で初期化済みプロジェクトでも、再度 `agkan init` を実行すれば hook が後付けされる (冪等)

### ドキュメント更新
- `README.md` / `README.ja.md` — `agkan init` セクションに「Claude Code 用 SessionStart hook を自動設定する」記述を追加
- `CHANGELOG.md` / `CHANGELOG.ja.md` — Unreleased セクションに追加
  - `### Added`: `agkan context` command outputting minimal session brief for Claude Code SessionStart hook
  - `### Changed`: `agkan init` now also configures `.claude/settings.local.json` SessionStart hook (idempotent, non-destructive)
- `src/cli/commands/agent-guide.ts` — full reference 側に `agkan context` の存在を 1 行追加 (相互参照)

## 7. 実装時に決定する細目
- 出力テキストの最終文言 (微調整)
- ClaudeIntegrator のクラス/関数 API 形 (init.ts から呼び出すインターフェイス)
