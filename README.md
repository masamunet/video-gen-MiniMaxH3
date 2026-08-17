# MiniMax H3 Video Studio

ComfyUI の MiniMax H3 T2V ワークフロー (`video_minimax_h3_t2v-upscale-api.json`) をブラウザから実行する Web アプリ。

SvelteKit (Svelte 5 runes) + Tailwind CSS v4 + bits-ui + Lucide アイコンで構築。

## 機能

- **3ペインのメイン画面** — 左: 入力 / 右: 出力 / 下: 直近履歴
- **入力**: プロンプト・アスペクト比・メガピクセル・duration (既定 5)・steps (既定 4)。すべて localStorage に自動保存され、次回起動時に復元
- アスペクト比とメガピクセルの選択肢は ComfyUI 本体の `/object_info` から取得するため、ワークフロー JSON と必ず一致（接続不可時はフォールバック選択肢）
- **出力**: 生成された動画・最終的に実行されたプロンプトの日本語版（ランダムプロンプト整形後）・英語版・所要秒数
- **履歴 / ライブラリ**: 直近履歴を下ペインに表示、`/library` で全履歴を検索・閲覧・削除。履歴はサーバー側の SQLite (`data/history.sqlite`) に保存
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
- ⌘+Enter で生成、実行中は中断可能（キュー待ち順表示付き）
- ComfyUI ホストは設定ダイアログで変更可能（既定: `http://localhost:8000/`）

## 起動

```sh
npm install
npm run dev
```

ComfyUI 側には次のカスタムノードが必要:
ResolutionSelector / DPRandomGenerator / GFDeepTranslate / M_ShowText / RestoreDialogTags / SpectrumApplyMiniMaxH3 ほか（ワークフロー JSON 参照）。

## 実装メモ

- ComfyUI への通信はすべて SvelteKit サーバールート `/api/*` で中継し CORS を回避（`/api/view` は Range リクエスト対応で動画をストリーミング中継）
- 送信するワークフローはノイズシードとランダムプロンプトのシードを毎回ランダム化
- 整形後の日本語プロンプトを取得するため、`DPRandomGenerator` 出力に `M_ShowText` ノード (ID `990`) を注入して history から回収（`M_ShowText` は `text` ではなく `text_display` キーで出力する点に注意）
- 履歴は SQLite (`data/history.sqlite`, better-sqlite3) に保存。入力パラメータ・設定・実行中ジョブは localStorage。動画ファイル自体は ComfyUI サーバー側に保存されたものを参照
- 全ページ CSR (`ssr = false`) のローカルツール構成

## 今後の予定

- (v2 予定だったプロンプトエディタは `/builder` として実装済み)
