# reference/

ComfyUI から書き出した API 形式ワークフローの参考コピー。
アプリの実行には使っておらず、[src/lib/workflow.ts](../src/lib/workflow.ts) の
`TEMPLATE` を読み解く / 突き合わせるための資料。
元ファイルはどちらも `/Volumes/cola_HDD/win11/` にある。

## video_minimax_h3_t2v-upscale-api.json (現行)

Latent Upscale の**バイパスを外した状態**の書き出し (2026-08-19)。アプリの
`buildWorkflow({ upscale: true })` はこのファイルの `105:129` 周りと同じ結線を作る。

- `105:129` `MiniMaxH3LatentUpscaleCombined`
  (custom_nodes/ComfyUI-MiniMaxH3_LatentUpscaler)
  - 入力: `samples` ← `105:104`[1] / `model` ← `105:127`[0] / `noise` ← `105:15`[0] /
    `sigmas` ← `105:9`[0] / `positive` ← `105:104`[0]、
    ウィジェットは `scale_by` `method`(nearest/bilinear/bicubic) `audio_denoise`
  - 出力: [0]=`latent` [1]=`positive` [2]=`negative`
  - 差し替え先は 2 箇所: `105:14.latent_image` ← [0]、**`105:16.conditioning` ← [1]**
    (ガイダーの conditioning もこのノード経由に変わる点に注意)

`TEMPLATE` との既知の差分 (どちらも生成結果には影響しない):

- steps がノード `151` `PrimitiveInt` に切り出され `105:9.steps` にリンクされている
  (`TEMPLATE` は `105:9.steps` に直接値を入れる)
- duration のノードIDが `152:122` / `152:123` (`TEMPLATE` は `122` / `123`)

## video_minimax_h3_t2v-upscale-api.bypassed-20260817.json (旧)

Latent Upscale が**バイパス中**だった頃の書き出し。ComfyUI の API 書き出しの仕様で
バイパス中のノードは現れず、パススルー後の結線
(`105:14.latent_image` = `["105:104", 1]` / `105:16.conditioning` = `["105:104", 0]`)
だけが残っている。アプリの `buildWorkflow({ upscale: false })` の出力がこれと同じ結線。

このときは翻訳ノードが `145:142` `GFDeepTranslate` だった
(現行とアプリはどちらも `145:155` `GoogleTranslateTextNode`)。
