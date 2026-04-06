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

テストの詳細は **[TESTING.ja.md](TESTING.ja.md)** を参照してください。

基本コマンド:
```bash
pnpm test          # ユニットテストを実行
pnpm run test:e2e  # E2Eテストを実行
```

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
