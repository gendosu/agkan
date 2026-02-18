---
name: execute-planning
description: Use when reviewing backlog tasks to assess decomposition, implementation readiness, and priority ordering before development begins.
---

# execute-planning

## Overview

agkanを使用してBacklogタスクを精査し、分解・Ready移動・先送りの判断を行うプランニングワークフロー。

---

## ワークフロー

### 1. Backlogタスクを取得

```bash
agkan task list --status backlog --json
```

### 2. タスクを1件ずつ精査

各タスクに対して以下を判断する

または、タスクIDが指定されていたら、対象のタスクについて以下を判断する

#### 2a. 内容の確認・補足・タスクリスト化

- タスク内容が不明確な場合、コードを確認して詳細を調査する
- 調査した内容はタスクの説明に追記する:

```bash
agkan task update <id> body "<追記内容>"
```

- タスクに複数の作業が含まれている場合、内容を整理してタスクリスト形式で説明に追記する:

タスクリスト化する際に、調査をする場合はExploreスキルを使用してコードを確認し、タスク内容を理解した上で、Planモードでタスクリストを作成することが望ましい。

```- タスク内容の要約
- [ ] 作業1
- [ ] 作業2
- [ ] 作業3
```

#### 2b. タスク分解の判断

**分解の粒度基準: 1タスク = 1PR = 1機能（改修）**

- 1つのPRをマージしたとき、その機能・改修が完結する粒度にする
- PRをマージしても半完成の状態になるような分割はしない
- 複数の独立した機能・改修が1タスクに混在している場合のみ分割する

タスクが上記基準を超えるスコープを含む場合、サブタスクに分割する:

```bash
# 分割後のタスクを新規作成
agkan task add "<サブタスク名>" "<詳細>"

# 元タスクを分割済みとしてクローズ（または更新）
agkan task update <id> status closed
```

#### 2c. Ready移動の判断

以下を**すべて満たす**場合、Readyに移動する:

- ブロッカーがない（依存タスクが完了済み）
- 1つのPRとして実装可能なスコープ
- 実装方針が明確

```bash
agkan task update <id> status ready
```

#### 2d. 先送りの判断

「いつかやるが今ではない」タスクには `いつかやる` タグを付け、Backlogのままにする:

```bash
# タグが存在しない場合は先に作成
agkan tag add "いつかやる"
# タスクにタグを付与
agkan tag attach <task-id> <tag-id>
```

先送り基準:
- 現在の優先事項に対して影響が小さい
- 依存する別タスクが完了していない
- リソースや情報が不足している

---

## タグ優先度

タスクにタグを付ける際は以下の優先順位を基準にする:

| 優先度 | タグ名 |
|--------|-------------|
| 1 | bug |
| 2 | security |
| 3 | improvement |
| 4 | test |
| 5 | performance |
| 6 | refactor |
| 7 | docs |

タグ付与コマンド:

```bash
# タグが存在しない場合は先に作成
agkan tag add "<tag>"
# タスクにタグを付与
agkan tag attach <task-id> <tag-id>
```

---

## 判断フロー

```
Backlogタスクを取得
    ↓
タスクの内容を確認
    ↓
内容が不明確？
   Yes → コード調査 → タスクに追記
   No  → 次へ
    ↓
分解できる？
   Yes → サブタスクに分割 → 元タスクをクローズ
   No  → 次へ
    ↓
今すぐ実装可能？（ブロッカーなし・1PR・方針明確）
   Yes → Readyへ移動
   No  → いつかやるタグを付けてBacklogのまま
    ↓
次のタスクへ（全件終了まで繰り返す）
```

---

## 注意事項

- `いつかやる` タグのタスクは、Readyタスクがなくなった後に再検討する
- タスク分解時は元タスクの内容を引き継ぐ
- Readyに移動するのは「今すぐ着手できる」ものだけ
