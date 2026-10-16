# 一括 run（pr）の依存タスクを stacked PR で積む設計

**日付**: 2026-10-16
**対象リポジトリ**: `agkan-private`（board 本体）、`agkan-skills`（スキル）
**関連**: GitHub stacked pull requests（2026-10-06 GA）

---

## 概要

board の一括 run（pr）で、依存関係のあるタスクを「先行タスクの PR の上に後続タスクの PR を積む」形で処理する。単純なケース（依存が 1 本の鎖になる場合）では、後続タスクが先行 PR のマージを待って止まる状態が発生しなくなることを目標とする。

### 発端となった事象（skillth リポジトリ、2026-10-15〜16）

1. 一括 run（pr、agent=codex）で #1506 が実行され、Codex は PR #2902 を作成して status を `review` にした
2. Codex の notify フックが目標 status（`review`）到達を検出してセッションを終了した（`task_run_logs` id=1197、finished 2026-10-15T23:26:06.209Z、exit 0）
3. `src/board/BulkRunService.ts:189` が exit 0 を受けて、command が `pr` でも status を `done` に上書きした。PR #2902 は OPEN のまま #1506 が `done` になった
4. #1506 の解決により、#1504（「#1506 のマージ後に確認するだけ」のタスク）が同時刻に選ばれて起動した（id=1198、started 2026-10-15T23:26:06.198Z）
5. Codex は PR 未マージを正しく判定し、agkan-subtask の review 条件（commit・push・PR）を満たさないため `in_progress` に留めた
6. pr/run のセッションは status が review/done/closed に到達したときだけ終了する（`src/hooks/hook-codex-notify.mjs:33-37`、`src/hooks/board-stop-client.mjs:21`。Claude 側も `src/hooks/hook-stop.mjs:251`）。そのためセッションは、PR #2902 のマージ（2026-10-16T01:51:13Z）後に Codex が確認を終えて `done` にした 01:53:28Z まで、約 2.5 時間（durationMs=8842235）残り続けた

原因は 2 つある。

- **board の不具合**: 一括 run が終了時に status を一律 `done` に上書きする（3）
- **作業の組み方**: 先行 PR のマージを前提にした後続タスクを作り、それを一括 run に流した（4〜6）

---

## 決定事項

| 論点 | 決定 |
|---|---|
| 先行タスクが `review`（PR OPEN）のときの後続タスク | 先行 PR のブランチから切り、その上に PR を積む |
| 「先行のマージ後に確認するだけ」のタスク | 作らない。重複指摘は先行タスクに統合して close する |
| 後続タスクに review 中の先行が複数ある場合 | 1 本の鎖に並んでいる場合だけ積む。並べ替え（既存 PR の rebase・付け替え）はしない |
| 鎖になるかどうかの担保 | planning で依存関係を 1 本の鎖にしておく |
| 積むか待つかの判断と git 操作 | agkan-subtask スキルが行う（board のタスク選択は変えない） |
| 実行時にしか分からない例外 | 理由を記録して `in_progress` のまま待機する。例外を網羅的に拾う仕組みは作らない |

並べ替えを採らない理由: 公式ドキュメント上、stack の並べ替えと層の挿入は対話型 TUI の `gh stack modify` でしか行えず、`gh stack sync` は非対話端末で中断する（[Managing stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests)）。無人のエージェントからは実行できない。

---

## 前提となる GitHub stacked PR の仕様

出典: [About stacked pull requests](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs)、[Stacked pull requests reference](https://docs.github.com/en/pull-requests/reference/stacked-pull-requests)、[Changelog 2026-10-06](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)

- 一番下の PR は trunk（通常は既定ブランチ）に、それより上の PR は 1 つ下の PR のブランチに向ける
- マージは下から順。一番上をマージすると、下の PR もまとめてマージされる
- 一番下の PR がマージされると、残りのブランチは自動で rebase され、次の PR は trunk 向けに付け替えられる
- 同じリポジトリ内だけで使える。merge・squash・rebase の 3 方式すべてに対応する。マージにはブランチ間の履歴が線形である必要がある
- CLI は公式拡張 `github/gh-stack`。ローカルの `gh` 2.101.0 で `gh stack` を実行すると、この拡張の導入を案内される
- REST API に stack の作成・延長・解除がある。GraphQL は読み取り専用

ドキュメントで確認できなかった点は「事前検証」で確かめる。

---

## 設計

### 1. board: 一括 run 終了時の status 上書きの修正（agkan-private）

`src/board/BulkRunService.ts:189` の `this.ts.updateTask(taskId, { status: 'done' })` を次のように変える。

- 目標 status は `runTargetStatus(ptyCommand)` で決める（`src/utils/runTargetStatus.ts:9-13`。pr なら `review`、run なら `done`）
- 現在の status がすでに `review`/`done`/`closed` のタスクは書き換えない。`done` を `review` に戻すこともしない

これで、PR がマージされる前に先行タスクが `done` になることがなくなる。その結果、後続タスクが「先行が review で PR がある」状態を正しく観測できる。

タスク選択（`src/board/taskSelection.ts:42` で、先行が `review` なら解決済みとみなす判定）は変えない。この判定が、review 中の先行の上に後続を積む入口になる。

テスト: `BulkRunService` の既存テストに、pr で exit 0 のとき `review` になること、run で exit 0 のとき `done` になること、すでに `done` のタスクを `review` に戻さないこと、の 3 つを追加する。

### 2. agkan-subtask: 先行 PR の上に積む（agkan-skills）

対象: `skills/agkan-subtask/SKILL.md`

**Step 2 Case B（ブランチ未作成）に「積み先の決定」を追加する。** ブランチを作る前に次を行う。

1. `agkan task block list <id> --json` の `blockedBy` から、status が `done` でない先行を集める（未解決の先行）
2. 未解決の先行が 0 件なら、従来どおり `origin/$DEFAULT_BRANCH` から切る
3. 未解決の先行それぞれについて、次をすべて満たすことを確認する。1 つでも満たさなければ「例外」とする
   - status が `review`
   - PR URL がある（本文の `PR:` ラベル、なければ metadata の `pr`。agkan-review と同じ取得順）
   - `gh pr view <URL> --json state,headRefName,baseRefName` の `state` が `OPEN`
4. 未解決の先行の PR が 1 本の鎖に並んでいることを確認する。鎖とは、ある PR の `baseRefName` が、集合内の別の PR の `headRefName` と一致するつながりで、集合の全 PR がたどれる状態を指す。鎖の一番下の PR の base は任意でよい（集合外の、より下の層であってもよい）。鎖にならなければ「例外」とする
5. 鎖の一番上の PR の `headRefName` を積み先とする。`git fetch origin` のあと、`git checkout -b <branch-name> origin/<積み先>` で切る
6. 積み先をタスクの metadata `stack_base` に記録する（Step 6・Step 9、および後の再開で使う）

**例外のとき**: 理由（どの先行がどの条件を満たさなかったか）を本文に記録し、`in_progress` のまま待機する。ブランチは作らない。

**Step 2 Case A（ブランチ作成済み）の衝突チェック**: metadata `stack_base` があれば、`origin/$DEFAULT_BRANCH` ではなく `origin/<stack_base>` に対して `git merge-base --is-ancestor` を行う。ただし `stack_base` の PR がすでにマージ済みの場合は、`origin/$DEFAULT_BRANCH` に対して行う。

**Step 6（PR 作成）**: `stack_base` があれば、PR の base を `stack_base` にして作り、stack として登録する。具体的なコマンドは事前検証 S1・S2 の結果で決める。

**Step 9（セルフレビュー）**: 差分の範囲を `git diff origin/<stack_base>...HEAD` にする（`stack_base` がなければ従来どおり既定ブランチ）。こうしないと、先行タスクの差分がレビュー対象に混ざる。

### 3. agkan-planning-subtask: 依存の 1 本化と確認タスクの禁止（agkan-skills）

対象: `skills/agkan-planning-subtask/SKILL.md` の Step 2（Blocking Relationship Setup、109-131 行）

- 先行が 2 つ以上あり、先行同士がまだ鎖になっていない場合は、先行同士にも依存を足して 1 本の鎖にする（例: C が A と B に依存するなら、B を A に依存させる）。どちらを下にするかは、優先度が高い方、同じなら ID の小さい方を下にする
- 「先行のマージ後に確認するだけ」で、それ自体にコード変更がないタスクは作らない。既存タスクがこの形になった場合は、確認項目を先行タスクのタスクリストに移し、元のタスクは理由を記録して `closed` にする

一括 run はもともと 1 タスクずつ順に実行する（`src/board/BulkRunService.ts` の `runNext` は、実行中のタスクがあれば終わるまで待つ）。そのため、依存を 1 本にしても一括 run の速度は落ちない。代わりに、鎖の上の PR は下の PR より先にマージできなくなる。

### 4. agkan-review: stack の PR がマージされたときの判定（agkan-skills）

対象: `skills/agkan-review/SKILL.md`

現在は `gh pr view <URL> --json state,mergedAt` の `MERGED` で `done`、`CLOSED` で `closed` にする（87-88 行）。stack で一番上の PR をまとめてマージしたときに下の PR がどの状態になるかは、ドキュメントに記載がない。事前検証 S3 の結果に応じて次のどちらかにする。

- 下の PR も `MERGED` になる場合: 変更しない
- 下の PR が `MERGED` 以外になる場合: その状態を `done` として扱う判定を追加する

---

## 事前検証（実装の前に行う）

捨て用のリポジトリ（同じアカウントの private リポジトリ）で確かめる。gh-stack 拡張の導入が必要。

| ID | 確かめること | 結果で決まること |
|---|---|---|
| S1 | develop 向けの既存 PR（A）の上に、新しいブランチ（C）を非対話で stack として積めるか。`gh stack` の非対話実行と REST API の両方で試す | 設計 2 の Step 6 のコマンド |
| S2 | native の stack に登録せず、`gh pr create --base <A のブランチ>` だけで足りるか。A がマージされたとき、C の PR が develop 向けに自動で付け替わるか（リポジトリの「マージ後にブランチを自動削除」設定の有無で両方試す） | S2 で足りるなら gh-stack 拡張を必須にしない |
| S3 | stack の一番上の PR をマージしたとき、下の PR の `state` と `mergedAt` がどうなるか。stack の PR で auto-merge を有効にできるか | 設計 4 の変更の要否。skillth の auto-merge 運用との両立 |

---

## エッジケース

| ケース | 扱い |
|---|---|
| 先行がすべて `done` | 従来どおり既定ブランチから切る |
| 先行が `closed`（PR がマージされずに閉じた） | 例外として待機する。タスク選択上は解決済み扱いのまま起動されるが、スキルが積み先を決められない |
| 先行が `review` だが PR がない | 例外として待機する |
| planning 後に依存が追加されて鎖が崩れた | 例外として待機する |
| 積んだ後に、先行 PR がレビュー指摘で更新された | GitHub の stack の rebase に任せる。後続タスクの再実行はしない |
| 積んだ後に先行 PR がマージされた | GitHub が後続 PR を trunk 向けに付け替える（S2・S3 で確認） |
| 再開時（Case A）に `stack_base` の PR がマージ済み | 衝突チェックは既定ブランチに対して行う |

## 範囲外

- 先行同士の自動並べ替え（決定事項を参照）
- 例外で待機したセッションを自動で終わらせる仕組み
- board の単体 run（一括でない run）の起動プロンプトのブランチ指示（`src/board/claudePromptBuilder.ts:40-44`）。このプロンプトは `git checkout -b` の起点を指定しない。積み先はスキルの Step 2 が決める
- 既存の OPEN な PR を後から stack に組み込む移行作業

## 完了条件

1. `BulkRunService` のテストで、pr で exit 0 → `review`、run で exit 0 → `done`、`done` を書き換えない、の 3 つが通る
2. 捨て用リポジトリで、A（ready）と C（A に依存、ready）を一括 run（pr）に流すと次のようになる
   - A は `review` で止まり、`done` にならない
   - C は A の PR のブランチから切られ、C の PR の base が A のブランチになる
   - C は `review` に到達してセッションが終わり、`in_progress` のまま残らない
3. A の PR をマージすると C の PR が trunk 向けに付け替わり、agkan-review で A、続いて C が `done` になる

---

## 事前検証の結果（2026-10-16 実施）

捨て用リポジトリ `gendosu/agkan-stack-spike`（既定ブランチ `develop`）、`gh` 2.101.0、`gh stack` 0.2.1 で実施した。

| ID | 手順 | 結果 |
|---|---|---|
| S2（自動削除なし） | A: `develop` 向け PR、C: `--base feat/a` の PR。A をマージ | C の base は `feat/a` のまま。develop には付け替わらない |
| S2（自動削除あり） | 同じ手順（A2 / C2） | C2 の base が `develop` に自動で付け替わり、`OPEN` のまま |
| S1 | 既存 PR A3（`develop` 向け）と C3（`--base feat/a3`）を `gh stack link feat/a3 feat/c3 < /dev/null` で stack 化 | 非対話で成功（exit 0）。ただし `--base` を省略すると、clone の `origin/HEAD`（`main`）を trunk とみなし、A3 の base を `main` に書き換えた。その後 `--base develop` で付け直そうとすると HTTP 422 `PullRequest.base is invalid` で失敗し、base を戻せなかった |
| S1（マージ） | stack 内の A3 を `gh pr merge 5 --merge` | 失敗: `This pull request is part of a stack and must be merged using the asynchronous merge REST API` |
| S3（素の `--base` 方式） | A4: `develop` 向け、C4: `--base feat/a4`。C4 を先にマージ | C4 は `MERGED`（`baseRefName=feat/a4`）。変更は `feat/a4` に入り、develop には入らない。A4 は `OPEN` のまま |
| S3（auto-merge） | `gh pr merge feat/c4 --auto --merge` | 必須チェックのないリポジトリでは `Pull request is in clean status` で有効化されず、確認できなかった |

skillth は `deleteBranchOnMerge: true`（`gh repo view gendosu/skillth --json deleteBranchOnMerge`）。

### 採用した方式

- STEP6_VARIANT: **A**（`gh pr create --base <stack_base>` だけで積み、native stack には登録しない）
  - 理由: 自動削除が有効なリポジトリでは、先行のマージで後続が自動で付け替わる（S2）。native stack は、`gh pr merge` によるマージができなくなる・一番下の base が固定される・`--base` の省略で base を書き換える、という点で既存の運用とぶつかる（S1）
  - 制約: リポジトリの「マージ後にブランチを自動削除」が無効だと、後続の PR は付け替わらない。agkan-subtask には、無効なリポジトリでは積まずに待機する分岐を入れる
- S3_LOWER_STATE: 素の `--base` 方式では、上の PR を先にマージすると `MERGED` になるが、マージ先は先行のブランチで、既定ブランチには入っていない
  - agkan-review の変更（設計 4）: `MERGED` でも、マージコミットが既定ブランチに含まれていなければ `done` にしない（skipped として数える）
- S3_AUTOMERGE: 未確認（検証リポジトリに必須チェックがないため）

## 受け入れ確認（2026-10-16 実施）

捨て用リポジトリで、A（ready、high）と C（A に依存、ready、medium）を一括 run（pr、agent=codex、gpt-6.1-sol、effort=medium）に流した。修正後の agkan（`feat/bulk-run-stacked-pr` のビルド）と、修正後のスキルを /home/app/.agents/skills/ に一時配置して使った。

| 完了条件 | 観測結果 |
|---|---|
| 2: A は `review` で止まり `done` にならない | A は `review`。セッション終了後も `review` のまま |
| 2: C は A の PR のブランチから切られ、PR の base が A のブランチ | C の metadata `stack_base=feat/1-a-add-docs-a-md`。PR #11 の base も同じ。PR #11 の差分は `docs/c.md` だけ |
| 2: C は `review` に到達してセッションが終わる | C は `review`。`agkan ps` は実行中なし。一括 run 全体で約 3 分 |
| 3: A の PR をマージすると C の PR が trunk 向けに付け替わる | A（#10）のマージ後、C（#11）は `OPEN`、base が `develop` |
| 3: agkan-review で A、続いて C が `done` になる | 1 回目の判定で A が `done`、C は OPEN のためスキップ。C のマージ後の 2 回目で C が `done`。develop に `docs/a.md` と `docs/c.md` が入った |

補足: 1 回目の実行では、検証用ディレクトリが Codex の信頼済みディレクトリに入っておらず、Codex が信頼確認の画面で止まった。信頼設定の追加後に再実行した。Codex のこの挙動は、本対応とは関係のない環境要因である。
