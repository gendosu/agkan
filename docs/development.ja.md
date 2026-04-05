# 開発

## 開発者向けセットアップ

agkan自体の開発に参加したい開発者向けの手順:

1. リポジトリをクローン:
```bash
git clone https://github.com/gendosu/agkan.git
cd agkan
```

2. 依存パッケージをインストール:
```bash
pnpm install
```

3. TypeScriptコードをビルド:
```bash
pnpm run build
```

4. グローバルコマンドとして登録:
```bash
pnpm link --global
```

## 開発ガイドライン

包括的な開発情報については、以下のドキュメントを参照してください:

- **[TESTING.ja.md](TESTING.ja.md)** - テストガイド、カバレッジ実行、テストパターン
- **[CONTRIBUTING.ja.md](../CONTRIBUTING.ja.md)** - コントリビューションガイドラインとTDDプラクティス
- **[TDD-GUIDE.md](TDD-GUIDE.md)** - 実践例を含むテスト駆動開発ガイド
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - プロジェクトアーキテクチャとデザインパターン

## コード品質

このプロジェクトではコード品質のためにESLintとPrettierを使用しています:

```bash
pnpm run lint        # コードをチェック
pnpm run lint:fix    # 問題を自動修正
pnpm run format      # コードをフォーマット
pnpm run check       # 全チェックを実行
```

## テスト

### ユニットテスト

Vitestを使用したユニットテストを実行:
```bash
pnpm test
```

全てのサービス層とモデル層がテストされています。

### E2Eテスト

実際のCLIコマンドを実行する包括的なE2Eテストを実行:
```bash
pnpm run test:e2e
```

E2Eテストは以下の機能をカバーします:
- ビルドとユニットテスト
- タグ管理機能（作成、一覧、削除、重複チェック）
- タグ付与機能（付与、解除、表示、重複チェック）
- タグフィルタリング（単一タグ、複数タグ、ステータス組み合わせ）
- CASCADE削除（データベース整合性確認）

テストはローカルのテスト用データベース（`.agkan-test/test-e2e.db`）を使用し、実行後に自動的にクリーンアップされます。

## ビルド

```bash
pnpm run build
```

## 開発時の自動ビルド

```bash
pnpm run dev
```

## TypeScript型チェック

```bash
npx tsc --noEmit
```

## データベースの初期化

データベースは最初のコマンド実行時に自動的に作成されます。手動で再作成する場合:

```bash
rm -rf data/agkan.db
agkan task list  # データベースが再作成されます
```
