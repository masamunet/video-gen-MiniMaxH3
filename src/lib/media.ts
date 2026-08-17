// <video> の後始末。
// DOM から外れただけの <video> は再生状態やデコーダを保持したままになることがあり、
// AirPods の着脱やメディアキーなどの再生信号で裏側で鳴り出すと止める手段がなくなる。
// そのためプレビュー用の動画は「再生されたら即止める」、
// 再生する動画は「破棄時に確実に解放する」ようにする。

function release(v: HTMLVideoElement) {
	try {
		v.pause();
		// src を外して load() すると、保持しているバッファ・デコーダが解放される
		v.removeAttribute('src');
		v.srcObject = null;
		v.load();
	} catch {
		// 解放できなくても致命的ではないので握りつぶす
	}
}

/**
 * サムネイルや出力ペインのプレビュー動画用。
 * ユーザー操作以外(メディアキー・デバイスの再生信号など)で再生が始まっても即座に止め、
 * 破棄時にリソースを解放する。
 */
export function previewVideo(node: HTMLVideoElement) {
	node.disableRemotePlayback = true;
	const stop = () => {
		// プレビューは再生しない要素なので、鳴り始めたら止める
		if (!node.paused) node.pause();
	};
	node.addEventListener('play', stop);
	return {
		destroy() {
			node.removeEventListener('play', stop);
			release(node);
		}
	};
}

/** モーダルなど実際に再生する動画用。破棄時に必ず停止・解放する */
export function playableVideo(node: HTMLVideoElement) {
	return {
		destroy() {
			release(node);
		}
	};
}
