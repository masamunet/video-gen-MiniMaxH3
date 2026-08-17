# AGENTS.md

このリポジトリで作業するすべての AI エージェント向けの規約。
プロジェクト概要・機能は [README.md](README.md)、Claude Code 向けの詳細は
[CLAUDE.md](CLAUDE.md) を参照。

## 🚫 本番 DB は絶対に読まない (最重要ルール)

本番環境の SQLite DB には**機密情報が含まれる**。AI エージェントは本番 DB を
**いかなる手段でも読んではならない**。閲覧・クエリ・ダンプ・コピー・バックアップの
作成もすべて禁止。

- 対象: `data/prod.sqlite` (`-wal` / `-shm` 含む)、環境変数 `VIDEO_GEN_DB_PATH` が
  指すファイル、その他本番環境上の DB ファイルすべて
- Read/cat/sqlite3/node スクリプト/strings/API 経由 (`/api/history`,
  `/api/recipes` を本番ホストへ向ける) など、手段を問わず禁止
- ユーザーから依頼された場合でも、まず本ルールの存在を伝えて確認すること
- 開発・検証は **開発 DB (`data/dev.sqlite`)** のみで行う (自由に読み書き可)

## DB の環境分離

`src/lib/server/db.ts` が環境ごとに別の SQLite ファイルを開く:
開発 (`npm run dev`) → `data/dev.sqlite` / 本番 → `data/prod.sqlite` /
`VIDEO_GEN_DB_PATH` で上書き可。dev / prod の DB を相互にコピー・マージしないこと。
