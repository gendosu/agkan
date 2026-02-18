# Contributing to agkan

このプロジェクトへのコントリビューションに興味を持っていただきありがとうございます。

## 開発環境のセットアップ

### 必要な環境

- Node.js 18以上
- npm 9以上
- Git

### セットアップ手順

```bash
# リポジトリをクローン
git clone https://github.com/gendosu/agkan.git
cd agkan

# 依存関係をインストール
npm install

# ビルドを確認
npm run build

# テストを実行
npm test
```

## 開発プロセス

### ブランチ戦略

- `main`: 本番環境用の安定したブランチ
- `feature/*`: 新機能開発用
- `fix/*`: バグ修正用
- `refactor/*`: リファクタリング用

### コミット規約

Conventional Commitsに従ってください:

- `feat:` 新機能の追加
- `fix:` バグ修正
- `refactor:` リファクタリング
- `test:` テストの追加・修正
- `docs:` ドキュメントの更新
- `chore:` ビルドプロセスやツールの変更

例:
```
feat: add task priority feature
fix: resolve database connection issue
test: add unit tests for TaskService
```

## テスト駆動開発（TDD）の実践

このプロジェクトでは、**テスト駆動開発（TDD）**を推奨しています。

### TDDの基本サイクル

1. **Red**: 失敗するテストを先に書く
2. **Green**: テストを通すための最小限の実装を行う
3. **Refactor**: コードを改善する

### TDDのコミット順序

TDDを実践する場合、以下の順序でコミットしてください:

1. **test**: テストコードを先にコミット
2. **feat/fix**: 実装コードをコミット

例:
```bash
# 1. テストを先に書く
git add tests/TaskService.test.ts
git commit -m "test: add test for new task priority feature"

# 2. 実装を行う
git add src/services/TaskService.ts
git commit -m "feat: implement task priority feature"
```

### TDDの詳細ガイド

TDDの詳細な実践方法については、[TDD-GUIDE.md](./TDD-GUIDE.md)を参照してください。

## コーディング規約

### リンターとフォーマッター

このプロジェクトでは、ESLintとPrettierを使用しています。

```bash
# コードをフォーマット
npm run format

# フォーマットをチェック
npm run format:check

# リンターを実行
npm run lint

# リンターの自動修正
npm run lint:fix

# 型チェック
npm run type-check
```

### コードスタイル

- インデント: 2スペース
- セミコロン: あり
- クォート: シングルクォート
- 行末のカンマ: あり（trailing comma）

## テスト

### テストの実行

```bash
# 全テストを実行
npm test

# カバレッジレポートを生成
npm run test -- --coverage

# E2Eテストを実行
./test-e2e.sh
```

### テストの書き方

- 単体テスト: `tests/` ディレクトリに配置
- テストファイル名: `*.test.ts`
- カバレッジ目標:
  - 行カバレッジ: 80%以上
  - ブランチカバレッジ: 80%以上

詳細は [TESTING.md](./TESTING.md) を参照してください。

## CI/CDパイプライン

このプロジェクトでは、GitHub Actionsを使用したCI/CDパイプラインが設定されています。

### 自動実行されるチェック

プルリクエストやmainブランチへのpushで以下が自動実行されます:

1. **Type Check**: TypeScriptの型チェック
2. **Lint**: ESLintによるコードチェック
3. **Format Check**: Prettierによるフォーマットチェック
4. **Test**: 全テストの実行
5. **Build**: プロダクションビルド
6. **Coverage Check**: カバレッジが80%未満の場合は失敗

### Pre-push Hook

`git push` 実行時に自動的にテストが実行されます。テストが失敗した場合、pushはブロックされます。

```bash
# 通常のpush (テストが実行される)
git push

# テストをスキップしてpush (緊急時のみ使用)
git push --no-verify
```

### カバレッジレポート

カバレッジレポートはGitHub Actionsのアーティファクトとして保存されます。
プルリクエストのChecksタブから確認できます。

## プルリクエスト

### プルリクエストを送る前に

1. すべてのテストが通ることを確認
   ```bash
   npm test
   ```

2. リンターとフォーマッターのチェック
   ```bash
   npm run check
   ```

3. ビルドが成功することを確認
   ```bash
   npm run build
   ```

**注意**: pre-pushフックにより、pushする前に自動的にテストが実行されます。

### プルリクエストの説明

プルリクエストには以下を含めてください:

- 変更内容の概要
- 関連するIssue番号
- テストの追加/修正内容
- スクリーンショット（UI変更の場合）

## ドキュメント

コードの変更に伴い、以下のドキュメントを更新してください:

- `README.md`: ユーザー向けの使い方
- `CHANGELOG.md`: 変更履歴
- `TESTING.md`: テストの実行方法
- コード内のJSDoc: API仕様

## 質問・相談

質問や相談がある場合は、Issueを作成してください。

## ライセンス

このプロジェクトに貢献することで、あなたのコントリビューションが
プロジェクトと同じライセンスの下で公開されることに同意したものとみなされます。

---

ありがとうございます！
