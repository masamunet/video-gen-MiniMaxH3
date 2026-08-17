// ComfyUI の ResolutionSelector と同じ計算で出力サイズを求める。
// 1.0 MP = 1024x1024 相当 (= 1048576 px) を基準に、
// アスペクト比から幅・高さを出して multiple の倍数へ丸める。

/** ワークフローの ResolutionSelector に渡している multiple */
export const RESOLUTION_MULTIPLE = 32;

const MP_UNIT = 1024 * 1024;

/** "16:9 (Widescreen)" のような表記から比率 (幅/高さ) を取り出す */
export function parseAspectRatio(label: string): number | null {
	const m = label.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
	if (!m) return null;
	const w = parseFloat(m[1]);
	const h = parseFloat(m[2]);
	if (!(w > 0) || !(h > 0)) return null;
	return w / h;
}

export interface Resolution {
	width: number;
	height: number;
}

/** 選択中のアスペクト比とメガピクセルから生成される動画サイズを求める */
export function computeResolution(
	aspectRatio: string,
	megapixels: number,
	multiple: number = RESOLUTION_MULTIPLE
): Resolution | null {
	const ratio = parseAspectRatio(aspectRatio);
	if (!ratio || !(megapixels > 0)) return null;

	const total = megapixels * MP_UNIT;
	const snap = (v: number) => Math.max(multiple, Math.round(v / multiple) * multiple);
	return {
		width: snap(Math.sqrt(total * ratio)),
		height: snap(Math.sqrt(total / ratio))
	};
}
