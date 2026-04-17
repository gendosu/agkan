---
layout: home
title: "agkan — AIエージェント向け軽量タスク管理ツール"
lang: ja
permalink: /ja/
header:
  overlay_color: "#1a1a2e"
  overlay_filter: 0.5
custom_css: true
---

<link rel="stylesheet" href="{{ '/assets/css/custom.css' | prepend: site.baseurl }}">

{% include lang-toggle.html %}

<div class="hero-section">
  <h1>agkan</h1>
  <p class="tagline">AIエージェントとの協働に最適化された軽量CLIタスク管理ツール</p>
  <div class="badges">
    <a href="https://github.com/gendosu/agkan/actions/workflows/test.yml">
      <img src="https://github.com/gendosu/agkan/workflows/Test/badge.svg?branch=main" alt="Test">
    </a>
    &nbsp;
    <a href="https://github.com/gendosu/agkan/actions/workflows/quality.yml">
      <img src="https://github.com/gendosu/agkan/workflows/Quality%20Check/badge.svg?branch=main" alt="Quality Check">
    </a>
  </div>
  <div class="install-box">
    <code>npm install -g agkan</code>
    <span class="copy-hint">コピー &amp; 実行</span>
  </div>
</div>

---

## 機能

<div class="features-grid">
  <div class="feature-card">
    <h3>🤖 AIネイティブ設計</h3>
    <p>Claude CodeやAIエージェントとのシームレスな協働のために設計。タスクの実行、計画、レビューを自動化できます。</p>
  </div>
  <div class="feature-card">
    <h3>📋 カンバンワークフロー</h3>
    <p>7つのステータスでタスクを管理: icebox, backlog, ready, in_progress, review, done, closed。</p>
  </div>
  <div class="feature-card">
    <h3>🗄️ SQLiteストレージ</h3>
    <p>SQLiteによる高速なローカルデータ管理。クラウド依存なしで利用可能。</p>
  </div>
  <div class="feature-card">
    <h3>🌳 親子タスク管理</h3>
    <p>ツリービューによるタスク階層管理。複雑な作業をサブタスクに整理できます。</p>
  </div>
  <div class="feature-card">
    <h3>🔗 ブロッキング関係</h3>
    <p>タスクの依存関係を定義し、循環参照を自動検出します。</p>
  </div>
  <div class="feature-card">
    <h3>🏷️ タグシステム</h3>
    <p>カスタムタグでタスクを分類・フィルタリング。より良い整理を実現します。</p>
  </div>
  <div class="feature-card">
    <h3>🖥️ カンバンボードUI</h3>
    <p>ローカルウェブベースのカンバンボード。Claudeとの統合により、ワンクリックでタスクを実行できます。</p>
  </div>
  <div class="feature-card">
    <h3>📤 JSON出力</h3>
    <p>全コマンドで機械可読なJSON出力に対応。スクリプトや自動化に最適です。</p>
  </div>
</div>

---

## デモ

<div class="demo-section">
  <p>よく使うワークフローのデモ:</p>
  <div class="demo-placeholder">
<pre>
# プロジェクトでagkanを初期化
$ agkan init

# タスクを作成
$ agkan task add "ログイン機能を実装する" "ユーザー認証システムの実装"

# タスク一覧を表示
$ agkan task list
 ID  タイトル                    ステータス  優先度
 1   ログイン機能を実装する      backlog     medium

# ステータスを更新
$ agkan task update 1 --status in_progress

# 進行中のタスクを表示
$ agkan task list --status in_progress
 ID  タイトル                    ステータス       優先度
 1   ログイン機能を実装する      in_progress      medium

# タグを使用
$ agkan tag add "backend"
$ agkan tag attach 1 "backend"

# ブラウザでカンバンボードを起動
$ agkan board
Board started at http://localhost:8080
</pre>
  </div>
</div>

---

## インストール

### 前提条件

- Node.js 20以上
- npm

### npmからインストール（推奨）

```bash
npm install -g agkan
```

### GitHubからインストール

```bash
npm install -g https://github.com/gendosu/agkan.git
```

### プロジェクトで初期化

```bash
cd your-project
agkan init
```

---

## 使い方

### タスクの作成

```bash
# 基本的なタスク作成
agkan task add "タスクのタイトル" "タスクの説明"

# ステータスと作者を指定して作成
agkan task add "ログイン機能を実装する" "ユーザー認証システム" \
  --status ready \
  --author "your-name"

# Markdownファイルから作成
agkan task add "設計レビュー" --file ./design-doc.md
```

### タスクの一覧・検索

```bash
# 全タスクを表示
agkan task list

# ステータスでフィルタ
agkan task list --status in_progress

# ツリービュー（親子関係）
agkan task list --tree

# タグでフィルタ
agkan task list --tag "backend"

# キーワード検索
agkan task find "ログイン"
```

### タスクの更新

```bash
# ステータスを更新
agkan task update 1 --status review

# タイトルを更新
agkan task update 1 --title "新しいタイトル"
```

### カンバンボード

```bash
# ローカルWebUIを起動
agkan board

# カスタムポート
agkan board -p 3000
```

### エージェントスキル

Claude Codeを使ったAI支援タスク実行:

```bash
# コンパニオンスキルパッケージをインストール
npm install -g agkan-skills
```

詳細は [agkan-skills](https://github.com/gendosu/agkan-skills) を参照してください。

<div class="warning-box">
  <p>⚠️ <strong>重要</strong>: agkanはClaudeを <code>--dangerously-skip-permissions</code> モードで起動します。信頼できるコードの隔離環境でのみ使用してください。</p>
</div>

---

## リンク

- [GitHubリポジトリ](https://github.com/gendosu/agkan)
- [コマンドリファレンス]({{ site.baseurl }}/ja/reference/commands/)
- [English]({{ site.baseurl }}/)
- [npmパッケージ](https://www.npmjs.com/package/agkan)
