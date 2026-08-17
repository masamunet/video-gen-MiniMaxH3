# MiniMax H3 Video Studio

ComfyUI の MiniMax H3 T2V ワークフロー (`video_minimax_h3_t2v-upscale-api.json`) をブラウザから実行する Web アプリ。

SvelteKit (Svelte 5 runes) + Tailwind CSS v4 + bits-ui + Lucide アイコンで構築。

## 機能

- **3ペインのメイン画面** — 左: 入力 / 右: 出力 / 下: 直近履歴
- **入力**: プロンプト・アスペクト比・メガピクセル・duration (既定 5)・steps (既定 4)。すべて localStorage に自動保存され、次回起動時に復元
- アスペクト比とメガピクセルの選択肢は ComfyUI 本体の `/object_info` から取得するため、ワークフロー JSON と必ず一致（接続不可時はフォールバック選択肢）
- **出力**: 生成された動画・最終的に実行されたプロンプトの日本語版（ランダムプロンプト整形後）・英語版・所要秒数
- **履歴 / ライブラリ**: 直近履歴を下ペインに表示、`/library` で全履歴を検索・閲覧・削除。履歴はサーバー側の SQLite に保存 (開発: `data/dev.sqlite` / 本番: `data/prod.sqlite`)
- **プロンプトビルダー** (`/builder`): MiniMax H3 形式 ([gist](https://gist.github.com/Naxdy/43b7422a1e4a79fb8b0489c6c39eaace) 参照) のプロンプトを組み立てる
  - 前置テキスト + シーン (textarea の配列、追加/削除/並べ替え) + 後置テキスト
  - **タイムライン**: キーフレームをドラッグして各 Shot の開始時刻 (progress 0〜1 × duration) を設定。キーフレームはシーンではなく **シャッフル後の Shot スロット** に紐づくため、順番が変わってもタイムスタンプは崩れない。シーン数に応じて自動増減、Shot 1 は先頭固定 (タイムスタンプなし)、隣のキーフレームは追い越せない
  - **秒数自動計算**: progress × duration から公式形式 `[Shot N] At MM:SS.mmm` を自動生成。テキスト中の `[Shot 2:progress=0.5]` 表記も変換される (duration 12 なら `[Shot 2] At 00:06.000`)
  - **ランダムシーン**: シーンが3つ以上のとき最初と最後を固定し中間をシャッフル (サイコロで再抽選)
  - **シーン連結**: カード間の「連結」トグルで隣接シーンをブロック化。連結された2つ以上のシーンはシャッフルしても順番・隣接が保たれる (最初/最後に連結すると固定ブロックの一部になる。空シーンを挟んだ連結も維持)
  - 生成画面のプロンプトへ自動入力 / クリップボードにコピー
  - **レシピ**: 名前・レート (★1〜5)・お気に入り・コメント付きで SQLite に保存。下ペインの一覧から読み込み・編集・削除
- リロードしても実行中の生成を見失わない（実行中ジョブを記憶し、再訪時にポーリングを自動再開）
- 動画はビューポートに収まる表示。クリックでモーダル再生、ダウンロードボタン付き
- ⌘+Enter で生成。**生成回数**（1〜10、ComfyUI の Batch Count 相当）を指定すると同じ設定で複数本をまとめてキューに積める（シードは毎回ランダムなので自然にバリエーションになる）
- **キュー管理**: 下ペインを「Recent / Queue」タブで切り替え。実行中・待機中のジョブを一覧表示し、個別キャンセルと全キャンセルが可能。実行中でも追加投入でき、リロードしても全ジョブのポーリングが自動再開する
- ComfyUI ホストは設定ダイアログで変更可能（既定: `http://localhost:8000/`）
- **API サーバーの切り替え**: 設定でデスクトップマシン (ComfyUI) と **RunPod Serverless** をセレクトボックスで選択可能
  - RunPod には `{input:{workflow}}` 形式でワークフローを送信し、`/status` をポーリング。完了時は `output.images[].data` (base64) の動画を `data/videos/` に保存してアプリから配信する
  - API キーは設定画面には置かず、**環境変数 `RUNPOD_API_KEY`** で渡す（`.env.example` をコピーして `.env` を作成。開発サーバーは自動で読み込む。本番は `node --env-file=.env build`）。未設定のまま生成すると画面にその旨のエラーが出る
  - Endpoint ID は設定ダイアログで変更可能（既定: `your-runpod-endpoint-id`）
  - RunPod ワーカーは動画のみを返すため、最終プロンプト（日本語/英語）の表示は RunPod 生成では取得できない（履歴には入力プロンプトが表示される）
  - **コスト概算表示**: RunPod 生成には円/ドルのコストを表示（出力ペイン・モーダル・ライブラリカード、ライブラリのヘッダーには表示中の合計）。単価（既定 $1.10/hr）とドル円レート（既定 165円）は設定ダイアログで変更でき、既存の履歴にも即座に反映される。RunPod が返す実行時間（`executionTime` = 課金対象）で計算し、取得できない場合は実測の経過秒数で概算する
- **ボスが来たモード**: 左上のロゴをクリックすると ON になり、すべての動画 (出力・履歴・ライブラリ・モーダル) がグレーのプレースホルダーになる。メニューの「生成」をクリックすると OFF。リロードしても状態は維持される

## 起動 (開発)

```sh
npm install
npm run dev
```

http://localhost:5173 で開く。DB は `data/dev.sqlite` が使われる。

## 本番環境のビルドと実行

[adapter-node](https://svelte.dev/docs/kit/adapter-node) でビルドし、Node サーバーとして実行する。

```sh
npm ci
npm run build
node --env-file=.env build
```

RunPod を使わない場合は `node build` のままでよい。`.env` は `.env.example` をコピーして作成する。

http://localhost:3000 で起動する (`Listening on http://0.0.0.0:3000`)。

- **DB は `data/prod.sqlite`** が自動的に使われる (開発の `dev.sqlite` とは完全分離。
  初回起動時に自動作成される)。⚠️ 本番 DB には機密情報が載るため AI に読ませないこと
- 環境変数:
  - `PORT` — 待ち受けポート (既定 3000)。例: `PORT=8080 node build`
  - `HOST` — バインドアドレス (既定 0.0.0.0)
  - `VIDEO_GEN_DB_PATH` — DB ファイルパスの明示指定 (別ディレクトリから起動する場合は
    絶対パス推奨。未指定時は **カレントディレクトリ**の `data/` に作られるため、
    必ずプロジェクトルートから `node build` を実行すること)
  - `ORIGIN` — リバースプロキシ配下などで公開 URL が異なる場合に指定
    (例: `ORIGIN=http://192.168.1.10:3000`)
- 実行時にも `node_modules` が必要 (better-sqlite3 のネイティブモジュールのため、
  `build/` ディレクトリ単体では動かない)。別マシンへ配置する場合はプロジェクト一式を
  コピーして `npm ci --omit=dev` を実行する
- コード更新時は `git pull && npm ci && npm run build` して `node build` を再起動

ComfyUI 側には次のカスタムノードが必要:
ResolutionSelector / DPRandomGenerator / GFDeepTranslate / M_ShowText / RestoreDialogTags / SpectrumApplyMiniMaxH3 ほか（ワークフロー JSON 参照）。

## 実装メモ

- ComfyUI への通信はすべて SvelteKit サーバールート `/api/*` で中継し CORS を回避（`/api/view` は Range リクエスト対応で動画をストリーミング中継）
- 送信するワークフローはノイズシードとランダムプロンプトのシードを毎回ランダム化
- `<video>` の後始末は [src/lib/media.ts](src/lib/media.ts) の action で行う。DOM から外れただけの動画は再生状態やデコーダを保持し、AirPods の着脱やメディアキーの再生信号で裏側から鳴り出して止められなくなるため、プレビュー用は `use:previewVideo` (再生されたら即停止 + `disableRemotePlayback`)、モーダルの再生用は `use:playableVideo` を付け、破棄時に `pause()` → `src` 除去 → `load()` で確実に解放する
- 整形後の日本語プロンプトを取得するため、`DPRandomGenerator` 出力に `M_ShowText` ノード (ID `990`) を注入して history から回収（`M_ShowText` は `text` ではなく `text_display` キーで出力する点に注意）
- 履歴・レシピは SQLite (better-sqlite3) に保存。**開発と本番で DB は完全分離**: 開発 (`npm run dev`) は `data/dev.sqlite`、本番は `data/prod.sqlite`、環境変数 `VIDEO_GEN_DB_PATH` で上書き可。⚠️ 本番 DB には機密情報が含まれるため AI エージェントは読み取り禁止 ([CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) 参照)
- 入力パラメータ・設定・実行中ジョブは localStorage。動画ファイル自体は ComfyUI サーバー側に保存されたものを参照
- 全ページ CSR (`ssr = false`) のローカルツール構成

## 今後の予定

- (v2 予定だったプロンプトエディタは `/builder` として実装済み)
