# テスト実行ガイド

このドキュメントでは、agkanプロジェクトのテスト環境とテスト実行方法について説明します。

## テストフレームワーク

- **テストフレームワーク**: Vitest 4.0.18
- **テスト言語**: TypeScript
- **データベース**: SQLite（テスト用にリセット機構を実装）

## 環境セットアップ

### 前提条件

- Node.js 18以上
- npm

### セットアップ手順

1. プロジェクトの依存パッケージをインストール:
```bash
npm install
```

2. TypeScriptコードをビルド（テスト実行前に推奨）:
```bash
npm run build
```

## テストの実行方法

### 基本的なテスト実行

すべてのテストを実行:
```bash
npm test
```

### Vitestの各種オプション

Watchモードでテスト実行（ファイル変更時に自動再実行）:
```bash
npx vitest
```

特定のテストファイルのみ実行:
```bash
npx vitest tests/TaskService.test.ts
```

カバレッジレポート付きでテスト実行:
```bash
npx vitest --coverage
```

## テストファイル構成

テストは38ファイル・約549ケースで構成されています。

```
tests/
├── TaskService.test.ts          # タスクCRUD・検索・親子関係（61ケース）
├── TagService.test.ts           # タグ操作（20ケース）
├── TaskBlockService.test.ts     # ブロック依存関係管理（24ケース）
├── TaskTagService.test.ts       # タスク-タグ関連付け（23ケース）
├── cli-json-output.test.ts      # CLI JSON出力（44ケース）
├── cli/
│   ├── commands/
│   │   ├── task/                # add, count, delete, find, get, list, update, update-parent
│   │   ├── block/               # add, list, remove
│   │   ├── tag/                 # add, attach, delete, detach, list, show
│   │   └── meta/                # delete, get, list, set
│   └── utils/                   # array-utils, error-handler, output-formatter, response-formatter, validators
├── db/
│   ├── config.test.ts           # DB設定（27ケース）
│   └── reset.test.ts            # DBリセット（4ケース）
├── services/
│   ├── FileService.test.ts      # ファイル操作（13ケース）
│   └── index.test.ts            # サービス初期化（7ケース）
└── utils/
    ├── cycle-detector.test.ts   # 循環参照検出（9ケース）
    ├── input-validators.test.ts # 入力バリデーション（25ケース）
    └── security.test.ts         # セキュリティ（7ケース）
```

## テストの特徴

### 依存性注入（Dependency Injection）

全サービスクラス（TaskService, TagService, TaskBlockService, TaskTagService, FileService等）はコンストラクタ引数でデータベースインスタンスを受け取れます。テスト時はモックDBを注入してユニットテストを独立して実行できます。

```typescript
constructor(private db: Database = getDatabase()) {
  // テスト時はモックDBを注入、本番時はデフォルトのDBを使用
}
```

### モックデータベース

`tests/utils/mock-database.ts` が提供するユーティリティを使用してインメモリDBを生成します。

```typescript
import { createMockDatabase } from './utils/mock-database';

beforeEach(() => {
  mockDb = createMockDatabase();
  taskService = new TaskService(mockDb);
});
```

### カバレッジ

- **CRUD操作**: Create, Read, Update, Delete の全操作
- **フィルタリング**: status, author, tag, 複合条件
- **エッジケース**: 存在しないID, null値, 空文字列
- **CLIコマンド**: 全コマンドの入出力・エラー処理
- **統合シナリオ**: タスクライフサイクル全体・複数タスク同時操作

## トラブルシューティング

### テストが失敗する場合

1. **依存パッケージの確認**:
```bash
npm install
```

2. **TypeScriptビルドエラーの確認**:
```bash
npm run build
```

3. **データベースファイルの削除**:
```bash
rm -rf data/agkan.db
```

4. **Node.jsバージョンの確認**:
```bash
node --version  # 18以上であることを確認
```

### よくある問題

- **データベースロックエラー**: 他のプロセスがデータベースを使用している場合は、そのプロセスを終了してください
- **パーミッションエラー**: `data/`ディレクトリに書き込み権限があることを確認してください

## CI/CD環境でのテスト実行

CI/CD環境では、以下のコマンドを順次実行します:

```bash
# 依存パッケージのインストール
npm install

# TypeScriptビルド
npm run build

# テスト実行
npm test
```

## 参考情報

- テストディレクトリ: `tests/`
- データベースリセット機能: `src/db/reset.ts`
- モックデータベース: `tests/utils/mock-database.ts`
- Vitest公式ドキュメント: https://vitest.dev/

## テスト結果の例

すべてのテストが成功すると、以下のような出力が表示されます:

```
 ✓ tests/TaskService.test.ts (61)
 ✓ tests/TagService.test.ts (20)
 ✓ tests/TaskBlockService.test.ts (24)
 ✓ tests/TaskTagService.test.ts (23)
 ✓ tests/cli-json-output.test.ts (44)
 ✓ tests/cli/commands/task/add.test.ts (32)
 ... （38ファイル）

 Test Files  38 passed (38)
      Tests  549 passed (549)
```
