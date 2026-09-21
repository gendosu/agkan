# 設定

`.agkan.yml` の全フィールド・データベースパスの解決順序・テストモードの挙動・プロジェクトごとの管理方法を網羅した設定リファレンスです。

## 目次

- [データベースの保存場所](#データベースの保存場所)
  - [設定ファイル: `.agkan.yml`](#設定ファイル-agkanyml)
  - [パスの指定方法](#パスの指定方法)
  - [環境変数による設定](#環境変数による設定)
  - [デフォルトの動作](#デフォルトの動作)
  - [プロジェクトごとの管理](#プロジェクトごとの管理)
- [ボード設定](#ボード設定)
- [エージェント設定](#エージェント設定)
- [モデルカタログ](#モデルカタログ)
- [モデル設定](#モデル設定)
- [パーミッションモード設定](#パーミッションモード設定)

## データベースの保存場所

agkanは、データベースの保存場所を設定ファイルでカスタマイズできます。

### 設定ファイル: `.agkan.yml`

プロジェクトのルートディレクトリに`.agkan.yml`ファイルを作成することで、データベースの保存場所を指定できます。

**設定例:**

```yaml
# データベースファイルのパス
path: ./.agkan/data.db
```

### パスの指定方法

- **相対パス**: カレントディレクトリからの相対パスとして解決されます
  ```yaml
  path: ./data/kanban.db
  path: ./.agkan/data.db
  ```

- **絶対パス**: そのままのパスが使用されます
  ```yaml
  path: /home/user/.config/agkan/data.db
  ```

### 環境変数による設定

agkanは `AGENT_KANBAN_DB_PATH` 環境変数によるデータベースの場所指定をサポートしています。CI/CD環境や複数環境の管理に特に有用です。

**環境変数の設定例:**

```bash
# カスタムデータベースパスを使用
export AGENT_KANBAN_DB_PATH=/path/to/your/database.db
agkan task list

# 絶対パスを使用
export AGENT_KANBAN_DB_PATH=/home/user/.config/agkan/data.db

# 相対パスを使用
export AGENT_KANBAN_DB_PATH=./custom/location/data.db
```

**優先順位:**

データベースパスは以下の優先順位で解決されます:

**通常モード (`NODE_ENV` が `test` でない場合):**
1. **環境変数**（最高優先）: `AGENT_KANBAN_DB_PATH`
2. **設定ファイル**（フォールバック）: `.agkan.yml` の `path` フィールド
3. **デフォルトパス**（最低優先）: `.agkan/data.db`

**テストモード (`NODE_ENV=test` の場合):**
1. **環境変数**（最高優先）: `AGENT_KANBAN_DB_PATH`
2. **設定ファイル**（フォールバック）: `.agkan-test.yml` の `path` フィールド
3. **デフォルトパス**（最低優先）: `.agkan-test/data.db`

**テストモードについて:**

テストモード（`NODE_ENV=test`）では、テストデータと本番データを自動的に分離します:

- 別の設定ファイルを使用: `.agkan.yml` の代わりに `.agkan-test.yml`
- 別のデフォルトディレクトリを使用: `.agkan/` の代わりに `.agkan-test/`
- テストモードでも環境変数が最高優先になります

**使用例:**

```bash
# CI/CDパイプライン（一時DBを使用）
export AGENT_KANBAN_DB_PATH=/tmp/ci-test-db.db
agkan task list

# 複数環境の管理
export AGENT_KANBAN_DB_PATH=./dev/data.db      # 開発環境
export AGENT_KANBAN_DB_PATH=./staging/data.db  # ステージング環境

# テストの実行
NODE_ENV=test pnpm test
# デフォルトで .agkan-test/data.db を使用

# カスタムテストDBで実行
NODE_ENV=test AGENT_KANBAN_DB_PATH=/tmp/test.db pnpm test
```

### デフォルトの動作

`.agkan.yml`ファイルが存在せず、環境変数も設定されていない場合、データベースは以下の場所に作成されます：

```
<カレントディレクトリ>/.agkan/data.db
```

テストモード（`NODE_ENV=test`）の場合のデフォルト:

```
<カレントディレクトリ>/.agkan-test/data.db
```

### プロジェクトごとの管理

プロジェクトごとに異なるタスク管理を行いたい場合は、各プロジェクトのルートに`.agkan.yml`を配置してください：

```bash
# プロジェクトA
cd /path/to/projectA
cat > .agkan.yml << EOF
path: ./.agkan/data.db
EOF

# プロジェクトB
cd /path/to/projectB
cat > .agkan.yml << EOF
path: ./.agkan/data.db
EOF
```

これにより、各プロジェクトで独立したタスク管理が可能になります。

## ボード設定

`.agkan.yml` の `board` セクションでは、`agkan board` コマンドの動作をカスタマイズできます。

### 利用可能なフィールド

| フィールド | 型 | デフォルト値 | 説明 |
|----------|-----|------------|------|
| `board.port` | number | `8080` | ボードWebサーバーのポート番号 |
| `board.title` | string | `"agkan Board"` | ボードUIに表示されるタイトル |

### 設定例

```yaml
# データベースファイルのパス
path: ./.agkan/data.db

# ボード設定
board:
  port: 8080
  title: "マイプロジェクトボード"
```

### フィールドの詳細

- **`board.port`**: ボードWebサーバーがリッスンするTCPポートを指定します。デフォルトポート `8080` が既に使用中の場合に有用です。
  ```yaml
  board:
    port: 8080
  ```

- **`board.title`**: ボードUIに表示されるタイトルを設定します。複数のプロジェクトを管理する際に、ボードを区別するのに役立ちます。
  ```yaml
  board:
    title: "マイプロジェクトボード"
  ```

## エージェント設定

version 2 では `models.<phase>.agent` で planning と run の CLI を別々に選択します。トップレベルの `agent` は phase 側で省略した場合のフォールバックで、version 1 では従来どおり単一の既定 CLI です。

### 利用可能な値

| 値 | 説明 |
|-------|-------------|
| (未設定) | デフォルトの `claude` が使用されます |
| `claude` | Claude Code CLIを使用 |
| `codex` | OpenAI Codex CLIを使用 |
| `agy` | agy CLIを使用 |
| `grok` | xAI Grok CLIを使用 |

```yaml
# デフォルト
agent: claude

# OpenAI Codex CLIを使用
agent: codex

# Use agy CLI
agent: agy

# xAI Grok CLIを使用
agent: grok
```

各エージェントCLIは別途インストールと認証が必要です。`agent` にこれら以外の値を設定するとエラーになります: `Invalid agent "<value>". Must be one of: claude, codex, agy, grok`。

> **agyの副作用**: claude や codex と異なり、agy にはセッション単位で完了通知フックを登録するフラグが無く、マシン上の全 agy 実行が共有する単一のグローバルファイル `~/.gemini/config/hooks.json` のみを読み込みます。`agent: agy` でボードセッションを実行すると、`board-stop` というエントリをそのファイルにマージします（既に存在する他の名前付きフックは保持されます）。これはボード自身のフックが有効な場合のみ書き込まれ、ボード外で手動実行した `agy` は影響を受けません（フックはボード固有の環境変数を確認してから動作するため）。

> **grokの副作用**: agy と同様に、grok は `~/.grok/hooks/*.json` からグローバルにフックを読み込みます。`agent: grok` でボードセッションを実行すると、Stop フックを含む `~/.grok/hooks/agkan-board-stop.json` を書き込みます（`herdr.json` など既存の他のフックファイルは保持されます）。これはボード自身のフックが有効な場合のみ書き込まれ、ボード外で手動実行した `grok` は影響を受けません（フックはボード固有の環境変数を確認してから動作するため）。

## モデルカタログ

`.agkan.yml` の `modelCatalog` は、タスクが選択できるモデル・そのモデルを実行する cli・そのモデルで選べる effort を定義します。`agkan task add` / `agkan task update` のフラグ検証、`POST` / `PATCH /api/tasks` の検証、Board のモデル/effortドロップダウンは、すべてこのカタログを唯一の正として参照します。

### 形式

```yaml
modelCatalog:
  - cli: claude
    model: fable
    efforts: [low, medium, high, xhigh, max]
```

| フィールド | 型 | 説明 |
|----------|-----|------|
| `cli` | string | `claude`、`codex`、`agy`、または `grok`。このモデルを選んだタスクを実行する cli |
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
| codex | `gpt-6-astra` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` |
| codex | `gpt-5.6-sol` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` |
| codex | `gpt-5.6-terra` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` |
| codex | `gpt-5.6-luna` | `low`, `medium`, `high`, `xhigh`, `max` |
| agy | `gemini-3.8-flash` | `low`, `medium`, `high` |
| agy | `gemini-3.7-flash` | `low`, `medium`, `high` |
| agy | `claude-sonnet-4-6` | (なし) |
| agy | `claude-opus-4-6-thinking` | (なし) |
| agy | `gpt-oss-120b-medium` | (なし) |
| grok | `grok-4.7` | `low`, `medium`, `high`, `xhigh` |
| grok | `grok-4.6` | `low`, `medium`, `high`, `xhigh` |
| grok | `grok-4.5` | `low`, `medium`, `high` |

`agy models` はモデルIDに effort を埋め込んだ形（`gemini-3.8-flash-high` など）で一覧を返しますが、agy CLI はそのベースID単体と、独立した `--effort low|medium|high` フラグの組み合わせも受け付けるため、この2行は実際の effort オーバーライドを持ちます。`claude-sonnet-4-6`、`claude-opus-4-6-thinking`、`gpt-oss-120b-medium` は固定バリアントで `--effort` を受け付けないため、いずれも効果を持ちません。

### 検証

`modelCatalog` を設定すると、組み込みの既定は**丸ごと置き換わります**（行単位のマージはしません）。空配列も有効で、その場合タスク単位のオーバーライドは一切選べません。次の場合はエラーになります。

- `modelCatalog` が配列でない
- 行の `cli` が `claude`、`codex`、`agy`、`grok` のいずれでもない
- 行の `model` が空、または `efforts` が「空でない文字列の配列」でない
- 同じ `model` 名が 2 行以上に現れる

### タスクからの使われ方

- タスクでモデルを選ぶと、そのタスクを実行する cli も決まり、そのタスクに限り phase の既定値を上書きします。
- effort は、タスクで選択したモデルの行の `efforts` に含まれる場合のみ有効です。タスク側モデル未選択時は phase の解決済みモデル、phase にモデルがなければ解決済み agent の全行を基準に検証します。
- 保存済みのモデルがカタログから消えている場合、実行は既定 cli にフォールバックせず 400 で失敗します。Board の詳細パネルはその値を `(not in catalog) <model>` として表示し、修正できるようにします。
- version 2 の phase モデルと effort は、同じ cli のカタログ行に対して検証します。version 1 は従来のパススルー動作を維持します。

## モデル設定

version 2 では各 phase の `agent`、`model`、`effort` を一つのまとまりとして指定します。`pr` は `run` の設定を使います。

### 利用可能なフィールド

| フィールド | 型 | デフォルト値 | 説明 |
|----------|-----|------------|------|
| `models.<phase>.agent` | string | トップレベル `agent`、次に `claude` | `planning` または `run` を実行する CLI |
| `models.<phase>.model` | string | 選択した CLI の既定値 | CLI に渡すモデル |
| `models.<phase>.effort` | string | 選択した CLI の既定値 | 同じモデルのカタログ行で許可された effort |

`<phase>` は `planning` または `run`、`agent` は `claude`、`codex`、`agy`、`grok` のいずれかです。モデルは同じ agent の `modelCatalog` 行に存在し、effort はその行で許可されている必要があります。未対応version、agent/modelの不一致、不正なeffortは設定エラーになります。

起動時の優先順位は、タスク単位のmodel/effort、version 2のphase設定、version 1互換設定または既定値です。Board単体実行、Bulk Run、`task run-all` は同じ解決処理を使います。

### 設定例

```yaml
version: 2

models:
  planning:
    agent: claude
    model: fable
    effort: high
  run:
    agent: codex
    model: gpt-5.6-sol
    effort: high
```

### version 1 の互換性と移行

version 未指定は version 1 として扱われ、既存の agent 別設定は従来どおり動作します。

```yaml
version: 1 # 省略可
agent: claude
models:
  claude:
    planning:
      model: opus
      effort: high
    run:
      model: sonnet
```

移行するには `version: 2` を追加し、各 phase を `models` 直下へ移して `agent` を加えます。version 1 の従来のフラット形式 `models.planning` / `models.run` も維持されます。将来の未対応versionはversion 1/2として解釈せず拒否します。`agkan init` は planning = Claude/Fable/high、run = Codex/gpt-5.6-sol/high のversion 2設定を生成します。

解決済みversionと各phaseは、`agkan config get`、`agkan config get models.planning.agent`、またはJSON出力で確認できます。

## パーミッションモード設定

`.agkan.yml` の `permissionMode` フィールドで、ボードからタスクを実行する際のClaude CLIのパーミッションチェック方法を制御できます。

### 利用可能な値

| 値 | Claude CLI フラグ | 説明 |
|-------|----------------|-------------|
| (未設定) | `--permission-mode auto` | デフォルト。Claudeがautoパーミッションモードを使用 |
| `auto` | `--permission-mode auto` | Claudeがautoパーミッションモードを使用 |
| `bypassPermissions` | `--permission-mode bypassPermissions` | すべてのパーミッションチェックをバイパス |
| `acceptEdits` | `--permission-mode acceptEdits` | ファイル編集を自動的に承認 |
| `dontAsk` | `--permission-mode dontAsk` | パーミッションを確認しない |
| `plan` | `--permission-mode plan` | プランのみモード |
| `default` | `--permission-mode default` | Claudeのデフォルトパーミッションモード |
| `skipPermissions` | `--dangerously-skip-permissions` | レガシーフラグ（すべてのチェックをバイパスする旧来の動作） |

### 設定例

```yaml
# autoパーミッションモードを使用（デフォルト）
permissionMode: auto

# レガシーの --dangerously-skip-permissions フラグを使用
permissionMode: skipPermissions
```

> **破壊的変更**: この機能導入以前は常に `--dangerously-skip-permissions` が渡されていました。新しいデフォルトは `--permission-mode auto` です。従来の動作を維持するには `.agkan.yml` に `permissionMode: skipPermissions` を設定してください。

### 他のエージェントへのマッピング

`permissionMode` の値は、選択したエージェントCLI固有のフラグに変換されます。`agent: agy` の場合:

| 値 | agy CLIフラグ |
|----|---------------|
| (未設定) / `auto` / `bypassPermissions` / `skipPermissions` | `--dangerously-skip-permissions` |
| `dontAsk` | `--mode accept-edits` |
| `plan` | `--mode plan` |
| `default` / `acceptEdits` | (なし。agy の対話的な request-review デフォルト) |

> agy には Claude の `auto` モードに相当するものがないため、`auto`（デフォルト）はボード実行を非対話に保つために `--dangerously-skip-permissions` で近似されます。agy に承認を求めさせたい場合は `permissionMode: default` を設定してください。

`agent: grok` の場合:

| 値 | grok CLIフラグ |
|----|---------------|
| (未設定) / `auto` | `--permission-mode auto` |
| `bypassPermissions` / `skipPermissions` | `--permission-mode bypassPermissions` |
| `acceptEdits` / `dontAsk` / `plan` / `default` | `--permission-mode <同じ値>` |

agy と異なり grok は `auto` を持つため、未設定時は `--permission-mode auto` が使われます。
