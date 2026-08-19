# CLAUDE.md

ComfyUI の MiniMax H3 T2V ワークフローをブラウザから実行する WebApp。
SvelteKit (Svelte 5 runes) + Tailwind CSS v4 + bits-ui + Lucide + better-sqlite3。
詳細な機能一覧・構成は [README.md](README.md) を参照。

## 🚫 本番 DB は絶対に読まない (最重要ルール)

本番環境の SQLite DB には**機密情報が含まれる**。AI エージェントは本番 DB を
**いかなる手段でも読んではならない**。

- 対象: `data/prod.sqlite`(`-wal` / `-shm` 含む) と、環境変数 `VIDEO_GEN_DB_PATH`
  が指すファイル、その他本番環境上の DB ファイルすべて
- 禁止される手段の例: Read ツール、`sqlite3` CLI、better-sqlite3 / node スクリプト、
  `cat` / `cp` / `strings` / `xxd`、`/api/history` や `/api/recipes` を本番ホストに
  向けて叩く行為、バックアップやダンプの作成・閲覧
- ユーザーから明示的に依頼された場合でも、まず本ルールの存在を伝えて確認すること
- スキーマの確認・動作検証はすべて **開発 DB (`data/dev.sqlite`)** で行う。
  開発 DB は自由に読み書き・削除してよい

## DB の環境分離

[src/lib/server/db.ts](src/lib/server/db.ts) が環境ごとに別ファイルを開く:

| 環境 | DB ファイル |
|---|---|
| 開発 (`npm run dev`) | `data/dev.sqlite` |
| 本番 (ビルド後の実行) | `data/prod.sqlite` |
| 上書き | 環境変数 `VIDEO_GEN_DB_PATH` |

判定は SvelteKit の `$app/environment` の `dev` フラグ。`data/` は gitignore 済み。
dev / prod の DB を相互にコピー・マージするコードや運用を追加しないこと。

## RunPod Serverless

- 生成バックエンドとして RunPod Serverless を選択可能（Endpoint ID は設定ダイアログで指定）。
  送信形式は `{input:{workflow}}`、結果は `output.images[].data` (base64) で返る
- API キー (`rpa_...`) は環境変数 `RUNPOD_API_KEY` で渡す。ローカルでは
  プロジェクト直下の `.env` に書いてよい (`.env` は gitignore 済み)。
  **絶対にコミットしない・チャットや Issue に貼らない**
  - 開発 (`npm run dev`): Vite/SvelteKit が `.env` を自動読み込みする
  - 本番: `npm start` で起動する (`node --env-file=.env start.js`)。
    素の `node build` では `.env` が読み込まれないので使わないこと。
    [start.js](start.js) は 0.0.0.0 待ち受けのまま起動ログの表示だけ localhost に直す
    ラッパーで、`.env` の読み込みもここで担保している
- ジョブ送信時に `policy.executionTimeout` (設定ダイアログの「実行タイムアウト」、既定
  30分) を付ける。付けないと RunPod 既定の10分で打ち切られ
  `executionTimeout exceeded` になる。コールドスタートのモデル読み込みも含まれる
- RunPod の `workersMin` は 0 のままにする (1 以上はアイドル課金)
- 動作確認は軽量設定 (0.1MP / duration 5 / steps 4) で行う。1回あたり約3分

## 開発メモ

- 起動: `npm run dev` (ポート5173)。型チェック: `npm run check`
- ComfyUI ホストの初期値: `.env` の `PUBLIC_COMFYUI_HOST` (未指定時は `http://localhost:8000/`、設定ダイアログで変更可)
- RunPod Endpoint ID の初期値: `.env` の `PUBLIC_RUNPOD_ENDPOINT_ID` (公開値。API キーを書かないこと)
- 動作確認で実際に動画生成する際は**メガピクセルを 0.1 に下げる** (GPU時間節約)
- ComfyUI の `M_ShowText` は history 出力で `text` ではなく `text_display` キーを使う
- 本番は `npm start` (`http://localhost:3000`) で、待ち受けはループバックのみ。
  同じマシンからしか使わない前提なので LAN には公開しない
- localhost はセキュアコンテキストなので通知・クリップボードなどの API は本番でも使える。
  ただし `HOST=0.0.0.0` で LAN 公開してホスト名や IP で開くと非セキュアコンテキストになり
  これらが一斉に落ちるため、`crypto.randomUUID` / `navigator.clipboard` は直接使わず
  [src/lib/compat.ts](src/lib/compat.ts) の `randomId()` / `copyText()` を使うこと
