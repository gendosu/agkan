---
name: execute-subtask
description: Use when a task has been selected and you need to implement it in an isolated (forked) context - handles in_progress update, branch creation, implementation, PR creation, and marking done.
user-invokable: false
metadata:
  context: fork
---

# execute-subtask

## Overview

選択済みタスクを、フォーク（ワークツリー）上で実装してPRを作成し、完了させるワークフロー。

---

## ワークフロー

### 1. タスクをin_progressに更新

```bash
agkan task update <id> status in_progress
```

### 2. ブランチ作成

```bash
git checkout -b <branch-name>
```

ブランチ名はタスクIDとタイトルから生成（例: `feat/42-add-login-page`）。

### 3. ブランチ名をタスクに書き込む

```bash
agkan task update <id> body "<既存本文>\n\nBranch: <branch-name>"
```

### 4. 実装

タスクの内容に従って実装を行う。

実装時に/key-guidelinesを参照し、コード品質を保つこと。

### 5. PRを作成

```bash
gh pr create --title "<title>" --body "<body>"
```

### 6. PRの情報をタスクに追記

```bash
agkan task update <id> body "<既存本文>\n\nPR: <PR URL>"
```

### 7. タスクをreviewに更新

```bash
agkan task update <id> status review
```

---

## 注意事項

- PRマージ前にタスクをdoneにしない（PRレビュー・マージ後にdoneへ）
- このスキルはタスク選択後に使用する（タスク選択は `execute-task` スキルで行う）
