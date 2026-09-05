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

`.agkan.yml` の `agent` フィールドで、ボードがタスク実行に使用するAIコーディングエージェントを選択します。

### 利用可能な値

| 値 | 説明 |
|-------|-------------|
| (未設定) | デフォルトの `claude` が使用されます |
| `claude` | Claude Code CLIを使用 |
| `codex` | OpenAI Codex CLIを使用 |

```yaml
# デフォルト
agent: claude

# OpenAI Codex CLIを使用
agent: codex
```

各エージェントCLIは別途インストールと認証が必要です。`agent` にこれら以外の値を設定するとエラーになります: `Invalid agent "<value>". Must be one of: claude, codex`。

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
| codex | `gpt-6-astra` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` |
| codex | `gpt-5.6-sol` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` |
| codex | `gpt-5.6-terra` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` |
| codex | `gpt-5.6-luna` | `low`, `medium`, `high`, `xhigh`, `max` |

### 検証

`modelCatalog` を設定すると、組み込みの既定は**丸ごと置き換わります**（行単位のマージはしません）。空配列も有効で、その場合タスク単位のオーバーライドは一切選べません。次の場合はエラーになります。

- `modelCatalog` が配列でない
- 行の `cli` が `claude` でも `codex` でもない
- 行の `model` が空、または `efforts` が「空でない文字列の配列」でない
- 同じ `model` 名が 2 行以上に現れる

### タスクからの使われ方

- タスクでモデルを選ぶと、そのタスクを実行する cli も決まります（そのタスクに限り `agent:` を上書きします）。
- effort は、選択したモデルの行の `efforts` に含まれる場合のみ有効です。モデル未選択のときは、既定の `agent:` に属する全行の efforts の和集合が候補になります。
- 保存済みのモデルがカタログから消えている場合、実行は既定 cli にフォールバックせず 400 で失敗します。Board の詳細パネルはその値を `(not in catalog) <model>` として表示し、修正できるようにします。
- `models.<agent>.<kind>.model` の値はカタログで検証しません。その effort は、モデルが同じ cli のカタログ行に一致するときだけ検証されます。

## モデル設定

`.agkan.yml` の `models` セクションでは、ボード経由でplanningおよびrunコマンドを実行する際に、選択したエージェントが使用するモデルとeffortレベルを指定できます。

### 利用可能なフィールド

| フィールド | 型 | デフォルト値 | 説明 |
|----------|-----|------------|------|
| `models.<agent>.planning.model` | string | claude: 選択したCLIのデフォルト / codex: `gpt-5.6-sol` | planningコマンド実行時に使用するモデル |
| `models.<agent>.planning.effort` | string | (選択したCLIのデフォルト) | planningコマンドのeffortレベル（[モデルカタログ](#モデルカタログ)を参照） |
| `models.<agent>.run.model` | string | claude: 選択したCLIのデフォルト / codex: `gpt-5.6-sol` | run/prコマンド実行時に使用するモデル |
| `models.<agent>.run.effort` | string | (選択したCLIのデフォルト) | run/prコマンドのeffortレベル（[モデルカタログ](#モデルカタログ)を参照） |

`<agent>` は `claude` または `codex` です。`models.claude` と `models.codex` の両方を同時に定義でき、`agent` で選択した側の設定のみが使用されます。`model` と `effort` はいずれも省略可能です。

`models.codex.planning.model` / `models.codex.run.model` が未設定の場合、Codex CLI自身のデフォルトに委ねるのではなく、agkanが `gpt-5.6-sol` をデフォルトとして使用します。`claude` にはagkan側のデフォルトはなく、未設定の場合はClaude CLI自身のデフォルトモデルが使用されます。

> **破壊的変更**: この機能導入以前は、Codexのモデルが未設定の場合 `--model` 自体が渡されず、Codex CLI自身のデフォルトモデルに委ねられていました。agkanは今後常に `--model` を渡し、未設定時は `gpt-5.6-sol` をデフォルトとします。Codex CLI自身のデフォルトに依存していた場合は、`models.codex.planning.model` / `models.codex.run.model` にそのモデル名を明示的に設定してください。

後方互換のため、エージェントキーを持たない従来のフラット形式 `models.planning` / `models.run` も引き続きフォールバックとしてサポートされます: `models.<agent>.planning`（または `.run`）が未設定の場合、`models.planning`（または `.run`）にフォールバックします。エージェント固有の設定は常に従来のフラット形式より優先されます。

モデル名は選択したエージェントのCLIにそのまま渡されます（`claude` と `codex` のどちらも `--model` フラグ）。`opus`、`sonnet`、`haiku` などのClaude CLIのエイリアスは、agkanではなくClaude CLI自身が解決します。agkanはどちらのエージェントについてもモデルのエイリアス解決やバリデーションは行いません。Codexの場合、`effort` は `--effort` フラグではなく `--config model_reasoning_effort=<effort>` として渡されます。

### 設定例

```yaml
# データベースファイルのパス
path: ./.agkan/data.db

# モデル設定
agent: codex
models:
  claude:
    planning:
      model: claude-opus-4-7
      effort: high
    run:
      model: claude-sonnet-4-6
      effort: low
  codex:
    planning:
      model: gpt-5.6-sol
      effort: high
    run:
      model: gpt-5.6-sol
      effort: high
```

### エイリアスの使用

`agent: claude` を選択している場合、フルモデル名の代わりに短いエイリアスを使用できます：

```yaml
models:
  claude:
    planning:
      model: opus
      effort: high
    run:
      model: sonnet
```

使用可能なエイリアス: `opus`、`sonnet`、`haiku`（Claude CLIが解決します。Codexについてagkanはエイリアスを解決しません）

### フィールドの詳細

- **`models.<agent>.planning`**: ボードがplanningタスクを実行する際に、対象エージェントが使用するモデルとeffortレベルを指定します。`claude` の場合は `opus` など高性能なモデルと高いeffortレベルの使用を推奨します。
  ```yaml
  models:
    claude:
      planning:
        model: opus
        effort: high
  ```

- **`models.<agent>.run`**: ボードがrunまたはprコマンドを実行する際に、対象エージェントが使用するモデルとeffortレベルを指定します。`pr` コマンドもこの値を使用します。
  ```yaml
  models:
    claude:
      run:
        model: sonnet
        effort: low
  ```

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
