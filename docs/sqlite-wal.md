# SQLite WAL の移行とバックアップ

通常の書き込み可能なファイル DB は、新規・既存とも初回の共通接続で WAL に切り替わる。番号付きスキーマ migration や DB の作り直しは不要で、タスク ID、関連データ、migration 履歴は維持する。低レベル opener の `:memory:` は `memory` のまま扱う。テスト用のファイル DB にも WAL を適用する。

```yaml
# .agkan.yml（テスト時は .agkan-test.yml）
database:
  journalMode: wal # 既定。wal または delete のみ
```

設定は worktree では主リポジトリと共有する。`NODE_ENV=test` の場合は worktree ごとのテスト設定を使う。`AGENT_KANBAN_DB_PATH` はパスだけを上書きする。`agkan config get database.journalMode` で要求設定を確認できる。

## 初回移行

1. 対象 DB を使う Board を `agkan board stop`（foreground は正常終了）で停止し、他の CLI・接続も終了する。
2. バックアップが必要なら、全接続の正常終了後に DB をコピーする。
3. 新版で Board または CLI を起動する。`agkan task count --json` などの読み取りコマンドも共通の書き込み可能な接続を使うため、自動移行が起きる。

busy_timeout=5000 の設定後、transaction とスキーマ migration の前に現在のモードを確認する。既に WAL の場合は切替 PRAGMA を再実行しない。WAL 使用時は synchronous=FULL を明示し、foreign_keys=ON と SQLite 既定の wal_autocheckpoint を維持する。NORMAL/OFF や独自 checkpoint worker は追加しない。

初回切替が他の接続と競合すると、SQLite の有限待機後に初期化が失敗する。元の原因と Board / CLI を停止して再実行する案内を通知し、DELETE へ黙ってフォールバックしない。失敗した接続は閉じ、ロック解放後は同じプロセスから再取得できる。WAL が永続化された後に別の初期化段階が失敗しても、モードを自動的に戻さない。

公開 opener に readonly オプションはなく、CLI の一覧・count も readonly 接続ではない。書き込み権限がない DB やディレクトリでは移行・初期化が失敗し得る。SQLite 自体の readonly WAL 対応を、この CLI の readonly 機能として扱わない。

## ネットワークファイルシステム

標準運用は単一ホストのローカル FS。SQLite WAL はネットワーク FS をサポートせず、自動検出も行わない。ネットワーク FS を使う構成では初回接続前に `database.journalMode: delete` を設定する。ただし DELETE でもネットワーク FS 自体のロック保証は追加されない。

WAL 化済み DB をネットワーク FS へ移す場合は、すべての接続を正常終了し、ローカルにある間に設定を `delete` に変更して CLI を一度正常実行・終了する。必要なら SQLite の `PRAGMA journal_mode;` が `delete` であることを確認してから移す。WAL→DELETE も他の接続が使用中なら失敗するため、停止後に再実行する。

## サイドカーとバックアップ

`<DBパス>-wal` と `<DBパス>-shm` は SQLite が管理する。アプリや清掃スクリプトで手動削除しない。commit 済みデータが WAL にのみ存在することがあるため、稼働中の `.db` 単体コピーは完全なバックアップにならない。サイドカーは `.gitignore` の対象にする。

物理バックアップは、Board と他のすべての DB 接続を正常終了して SQLite の checkpoint / close を完了させてから DB ファイルをコピーする。クラッシュした場合もサイドカーを消さず、先にローカル FS 上で SQLite を正常に開閉して回復を完了させる。添付ファイルも必要に応じて別途保存する。

`agkan export` は SQL を通じて読む論理 JSON export なので、未 checkpoint の commit 済みタスクも取得する。JSON 形式は変わらない。ただし実行ログや添付ファイルを含む物理 DB 全体のバックアップではない。

## 対象外と検証

書き込み同士の競合は WAL で解消しない。checkpoint / recovery や `PRAGMA locking_mode=EXCLUSIVE` などによる BUSY、同期 I/O によるイベントループ停止も残る。テストの `BEGIN EXCLUSIVE` は transaction の種類で、接続全体の `locking_mode=EXCLUSIVE` とは異なる。worker 分離は #783、一般 CRUD の競合対応は #784 の範囲。

```sh
pnpm exec vitest run tests/db tests/board/boardRoutes.test.ts tests/cli/commands/config/get.test.ts tests/cli/commands/init.test.ts tests/cli/commands/task/count.test.ts tests/services/ExportImportService.test.ts
pnpm run type-check
pnpm run lint
pnpm run build:server
pnpm run verify:bun-sqlite
pnpm run build:bun
pnpm run verify:bun-binary
```

新規・既存 DELETE DB をアプリ自身が WAL 化した後、独立 Node writer が実際に UPDATE した `BEGIN EXCLUSIVE` を 7 秒保持する。HTTP 200 と独立 CLI count の正しい件数を、ロック解放前に確認する。commit 前後の値も検証する。HTTP・CLI・writer は別プロセスで、外側の監視タイマーと finally による終了・一時ディレクトリ回収を使う。

Bun SQLite 検証も同じ回帰条件を実行する。standalone 検証には Linux の `/usr/bin/bwrap` とビルド済みアーカイブが必要で、ビルド元・Node/Bun・node_modules を隠してバイナリを動かす。`AGKAN_VERIFY_BOARD_MODE=foreground` でも実行可能。既存の保存競合・回復シナリオも維持する。

一次資料: [SQLite WAL](https://www.sqlite.org/wal.html)、[journal_mode](https://www.sqlite.org/pragma.html#pragma_journal_mode)、[synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous)。
