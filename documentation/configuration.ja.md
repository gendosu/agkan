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

## モデル設定

`.agkan.yml` の `models` セクションでは、ボード経由でplanningおよびrunコマンドを実行する際に使用するClaudeモデルとeffortレベルを指定できます。

### 利用可能なフィールド

| フィールド | 型 | デフォルト値 | 説明 |
|----------|-----|------------|------|
| `models.planning.model` | string | (Claude CLIのデフォルト) | planningコマンド実行時に使用するモデル |
| `models.planning.effort` | string | (Claude CLIのデフォルト) | planningコマンドのeffortレベル（`low`, `medium`, `high`, `xhigh`, `max`） |
| `models.run.model` | string | (Claude CLIのデフォルト) | run/prコマンド実行時に使用するモデル |
| `models.run.effort` | string | (Claude CLIのデフォルト) | run/prコマンドのeffortレベル（`low`, `medium`, `high`, `xhigh`, `max`） |

フルモデル名とClaude CLIのエイリアスの両方が使用できます。`model` と `effort` はいずれも省略可能です。

### 設定例

```yaml
# データベースファイルのパス
path: ./.agkan/data.db

# モデル設定
models:
  planning:
    model: claude-opus-4-7
    effort: high
  run:
    model: claude-sonnet-4-6
    effort: low
```

### エイリアスの使用

フルモデル名の代わりに短いエイリアスを使用できます：

```yaml
models:
  planning:
    model: opus
    effort: high
  run:
    model: sonnet
```

使用可能なエイリアス: `opus`、`sonnet`、`haiku`（Claude CLIが解決します）

### フィールドの詳細

- **`models.planning`**: ボードがplanningタスクを実行する際に使用するClaudeモデルとeffortレベルを指定します。`opus` や `claude-opus-4-7` など高性能なモデルと高いeffortレベルの使用を推奨します。
  ```yaml
  models:
    planning:
      model: opus
      effort: high
  ```

- **`models.run`**: ボードがrunまたはprコマンドを実行する際に使用するClaudeモデルとeffortレベルを指定します。`pr` コマンドもこの値を使用します。
  ```yaml
  models:
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
