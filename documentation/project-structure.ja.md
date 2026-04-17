# プロジェクト構成

```
agkan/
├── bin/
│   └── agkan                        # CLIエントリーポイント
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── block/               # ブロック関係コマンド
│   │   │   │   ├── add.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── remove.ts
│   │   │   ├── meta/                # メタデータコマンド
│   │   │   │   ├── delete.ts
│   │   │   │   ├── get.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── set.ts
│   │   │   ├── tag/                 # タグコマンド
│   │   │   │   ├── add.ts
│   │   │   │   ├── attach.ts
│   │   │   │   ├── delete.ts
│   │   │   │   ├── detach.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── show.ts
│   │   │   └── task/                # タスクコマンド
│   │   │       ├── add.ts
│   │   │       ├── count.ts
│   │   │       ├── delete.ts
│   │   │       ├── find.ts
│   │   │       ├── get.ts
│   │   │       ├── list.ts
│   │   │       ├── update-parent.ts
│   │   │       └── update.ts
│   │   ├── utils/                   # CLIユーティリティ
│   │   └── index.ts                 # CLIエントリー・コマンド登録
│   ├── db/
│   │   ├── config.ts                # DB設定
│   │   ├── connection.ts            # データベース接続管理
│   │   ├── schema.ts                # スキーマ定義・マイグレーション
│   │   └── reset.ts                 # テスト用DBリセット
│   ├── models/
│   │   ├── Task.ts                  # タスクモデル
│   │   ├── Tag.ts                   # タグモデル
│   │   ├── TaskBlock.ts             # ブロック関係モデル
│   │   ├── TaskMetadata.ts          # メタデータモデル
│   │   ├── TaskTag.ts               # タスク-タグ関連モデル
│   │   └── index.ts
│   ├── services/
│   │   ├── TaskService.ts           # タスク管理ビジネスロジック
│   │   ├── TagService.ts            # タグ管理ビジネスロジック
│   │   ├── TaskBlockService.ts      # ブロック関係管理
│   │   ├── TaskTagService.ts        # タスク-タグ関連管理
│   │   ├── MetadataService.ts       # メタデータ管理
│   │   ├── FileService.ts           # ファイル読み込み
│   │   └── index.ts
│   └── utils/
│       ├── format.ts                # フォーマットユーティリティ
│       ├── cycle-detector.ts        # 循環参照検出
│       ├── input-validators.ts      # 入力バリデーション
│       └── security.ts              # セキュリティユーティリティ
├── dist/                            # ビルド出力ディレクトリ
├── package.json
├── tsconfig.json
└── README.md
```
