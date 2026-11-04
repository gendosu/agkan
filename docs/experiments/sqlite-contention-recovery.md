# SQLite ロック競合時の PTY ログ回復

タスク #780。Bun 1.4.0 の接続では既定の busy_timeout が 0ms で、PTY の定期保存・終了保存から SQLITE_BUSY が未処理で伝播していた。

## 運用値と保証範囲

- 共通 opener が接続を返す前に busy_timeout=5000ms を設定する。Node は better-sqlite3 の明示的な timeout オプション、Bun は接続直後の PRAGMA を使う。foreign_keys と migration より先に有効になる。
- 定期保存は2秒間隔。保存成功時刻と試行終了時刻を分け、失敗直後の連続出力による同期書き込みの連発を抑える。
- SQLITE_BUSY およびその拡張コード、errno の基本コード5だけを再試行する。SQLITE_LOCKED、READONLY、FULL、IOERR 等やメッセージ文字列だけのエラーは対象外。
- 1サイクルは初回を含め最大3回。間隔は250ms・1000ms。単一のタイマーを使い、新規出力は最新 snapshot に集約する。出力が止まっても開始済みの有限再試行は継続する。
- 全試行で5秒待機する場合、SQLite 待機は計約15秒、再試行間隔込みで約16.25秒。イベントループの混雑や通知先の追加DB処理はこの時間に加算される。
- 上限到達後は診断してタイマーを解放する。同じ出力を無期限に再試行しない。最新出力はセッションのメモリに残し、新しい出力での次回周期または終了 flush の別サイクルで回復する。
- 終了時は中間再試行を取り消し、終了時刻・終了コード・signal・stop origin を含む最終 snapshot を保存する。保存失敗でも done は一度だけ通知し、sessions・attention・停止フラグを解放する。DB 保存前の遅延購読にも実際の終了結果を返す。
- 終了後の保存待ちは実行ログID単位で最大10件。終了 snapshot のキャッシュも最大10件。保存成功、再試行上限、容量超過、サービス終了時にタイマーを解放する。容量超過・終了時の未保存は明示的に診断する。
- 履歴は最終保存成功後に最新5件へ整理し、保存待ちの実行ログは削除しない。spawn 失敗で終端化したログにも適用する。
- 起動ログ作成を PTY 生成より先に行い、失敗時は子を起動しない。run-all は全エージェントで開始ログ作成失敗・完了時の状態更新失敗を error として停止する。ログ保存だけの失敗は実行結果を変更しない。
- 診断には taskId、runLogId、operation、code、errno、attempt、回復・打切りを記録し、例外の本文や端末本文は記録しない。

SQLite は同期呼び出しなので、ロック待ち中の同一イベントループでは HTTP・Terminal 配信・Stop も待つ。再試行の間にはイベントループへ制御を戻すが、複数セッションの待機は累積する。WAL 切替、DB の worker 移管、再起動後にも残る永続キュー、一般CRUDの再試行は本修正の範囲外。

## 検証入口

```sh
pnpm exec vitest run tests/db tests/terminal tests/board/claudeRoutes.test.ts tests/board/bulkRunService.test.ts
pnpm run type-check
pnpm run lint
pnpm run verify:bun-sqlite
pnpm run build:bun
pnpm run verify:bun-binary
AGKAN_VERIFY_BOARD_MODE=foreground pnpm run verify:bun-binary
```

SQLite の契約テストと Bun 検証は、一時実ファイルDBと独立した Node プロセスの BEGIN IMMEDIATE を使用する。ロック取得完了を標準出力で確認し、250msの競合下で初期 migration、create、updateEvents、updateFinished が成功することを確認する。同一イベントループのタイマーによるロック解放は使用しない。

PTY 単体テストは fake timers で永続BUSY、同期5秒待機、最新出力への集約、有限再試行、最終優先、終了通知、起動失敗、prune失敗、旧実行の遅延 callback、キャッシュからの退避、全タイマーの解放を確認する。実際の BulkRunService と SQLite repository を使って、ログ保存だけが失敗した場合の継続と、状態更新失敗時の停止も確認する。

standalone バイナリ検証は既存の bubblewrap 環境でビルド元・node_modules・Node/Bun を隠して Board を起動する。AIサービスに接続しない合成エージェントと独立ロック保持プロセスを使用し、6250msのロック下で中間保存・終了保存・Stop、11000msのロック下で2セッションの中間保存を検証する。各子プロセスには外側の監視タイマーを設け、finally で回収する。

## 実測結果（2026-11-04）

Node 22.22.3 / Bun 1.4.0 / Linux x64。foreground の standalone バイナリで測定した。HTTP・Stop は出力開始の150ms後に要求し、Terminal はロック待機中に追加の入力を送って応答まで測定した。

| セッション数・操作 | ロック保持 | HTTP応答 | Terminal応答 | Stop応答 |
| --- | --- | --- | --- | --- |
| 1・中間保存 | 6250ms | 4919ms | 5075ms | — |
| 1・終了保存 | 6250ms | 4904ms | — | — |
| 1・Stop | 6250ms | 6134ms | 5025ms | 4880ms |
| 2・中間保存 | 11000ms | 10928ms | 11105ms / 11108ms | — |

中間保存・Stop・2セッションのケースで、HTTPプローブの ECONNRESET を各1回観測した。Stop の応答も1回切断された。検証スクリプトは切断件数を明示し、新規接続で最大2回再送して生存と完了状態を確認する。Stop 再送時の404は既に停止済みの場合として扱い、履歴の origin=user と子プロセス消滅を別途確認する。製品のHTTPクライアントに再送処理を追加する変更ではない。

全ケースで未処理DB例外による Board 終了はなく、ロック解放後の最新/最終ログ、sessions 削除、正常/非0/signal/Stop の終了コード、子プロセス回収を確認した。同期DB待機による応答遅延・HTTP接続切断は残る。上記は観測した応答時間であり、イベントループの停止時間そのものの厳密な上限ではない。UI の5秒 abort を超えるケースがあるため、常時応答性を必要とする場合は別途DB処理の非同期化等が必要になる。

daemon モードも同じ4ケースを通過した。HTTP は中間保存4898ms・終了保存4875ms・Stop時6127ms・2セッション10931ms、Terminal は最大11110ms、Stop は4880msだった。HTTPプローブの切断は中間保存・Stop・2セッションで各1回、Stop応答の切断も1回。再接続後の保存回復・子回収に加え、daemon停止とPIDファイル削除も確認した。

関連自動テストは当初の全対象で575件通過（既存の DB 性能ベースライン10件は元から skip）。追加修正後は PTY・保存writer・Board・run-all の318件、SQLite runtimeの12件を再実行して通過。stripAnsi の性能・長時間ログ互換も最初の全対象に含む。型検査、lint（0 errors / 171 warnings）、Bun SQLite 契約・再接続・相互運用検証、Bun バイナリビルドを通過した。

参考: [SQLite busy timeout](https://www.sqlite.org/c3ref/busy_timeout.html)、[SQLite result codes](https://www.sqlite.org/rescode.html)。
