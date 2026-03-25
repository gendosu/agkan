---
name: sync-agkan-db
description: |
  Syncs the .agkan directory between dynabook and mac2018 via scp.
  Use this skill when the user wants to sync, backup, or transfer .agkan data,
  or when the user says "sync agkan", ".agkanをmac2018に送る", "mac2018に同期",
  "dynabookに同期", or similar.
  Always invoke this skill for any request to copy or sync .agkan between hosts.
---

# sync-agkan-db

`.agkan` ディレクトリを dynabook と mac2018 の間で scp で相互同期するスキルです。
ホスト名に応じてコピー先を自動判定します。

## 手順

1. 現在のホスト名を取得する:
   ```bash
   hostname
   ```

2. ホスト名が `dynabook` の場合、mac2018 へコピーする:
   ```bash
   scp -pr .agkan mac2018:/Volumes/ADATA-SD600/products/gendosu/agkan
   ```

3. ホスト名が `mac2018` の場合、dynabook へコピーする:
   ```bash
   scp -pr .agkan dynabook:/home/gen/products/gendosu/agkan
   ```

4. ホスト名が `dynabook` でも `mac2018` でもない場合は、スキップして以下のメッセージを表示する:
   ```
   ホスト名が dynabook でも mac2018 でもないため、同期をスキップしました。（現在のホスト名: <hostname>）
   ```

## 完了後

成功した場合は「同期完了」と報告する。エラーが発生した場合はエラー内容をそのまま表示する。
