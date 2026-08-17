// プロンプトビルダー: MiniMax H3 形式のプロンプトを組み立てる
// https://gist.github.com/Naxdy/43b7422a1e4a79fb8b0489c6c39eaace 参照

export interface BuilderData {
	/** 秒数計算用の duration (生成画面とは独立) */
	duration: number;
	/** [Shot] 群の前に置くテキスト (integrated_multimodal_description など) */
	prefix: string;
	/** [Shot] 群の後に置くテキスト (overall_soundscape など) */
	suffix: string;
	/** シーン本文。順番はシャッフルされうる */
	scenes: string[];
	/**
	 * links[i]: scenes[i] と scenes[i+1] が連結されているか。
	 * 連結された一続きのシーンはブロックとしてシャッフル時も順番・隣接が保たれる。
	 */
	links: boolean[];
	/**
	 * タイムラインのキーフレーム (progress 0〜1)。
	 * シーンとは独立で、シャッフル後の [Shot N] の位置 (スロット) に紐づく。
	 * timeline[0] は常に 0 (Shot 1 はタイムスタンプなし)。
	 */
	timeline: number[];
}

export const DEFAULT_BUILDER: BuilderData = {
	duration: 12,
	prefix: '',
	suffix: '',
	scenes: [''],
	links: [false],
	timeline: [0]
};

export interface Recipe {
	id: string;
	name: string;
	data: BuilderData;
	rating: number; // 0-5
	favorite: boolean;
	comment: string;
	createdAt: number;
	updatedAt: number;
}

/** 秒数を公式形式 "MM:SS.mmm" にする (例: 6 → "00:06.000") */
export function formatTimestamp(seconds: number): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const m = Math.floor(totalMs / 60000);
	const s = Math.floor(totalMs / 1000) % 60;
	const ms = totalMs % 1000;
	const p2 = (n: number) => String(n).padStart(2, '0');
	return `${p2(m)}:${p2(s)}.${String(ms).padStart(3, '0')}`;
}

function clamp01(v: number): number {
	return Math.min(1, Math.max(0, v));
}

/**
 * テキスト中の "[Shot 2:progress=0.5]" 表記を "[Shot 2] At MM:SS.mmm" に変換する。
 * Shot 番号は省略可 ("[Shot:progress=0.5]" → "[Shot] At …")。
 */
export function convertProgressTags(text: string, duration: number): string {
	return text.replace(
		/\[Shot(\s+\d+)?\s*:\s*progress\s*=\s*([0-9]*\.?[0-9]+)\s*\]/gi,
		(_m, num: string | undefined, prog: string) =>
			`[Shot${num ?? ''}] At ${formatTimestamp(clamp01(parseFloat(prog)) * duration)}`
	);
}

/**
 * タイムラインをシーン数に合わせて増減させる。
 * 追加分は「最後のキーフレームと 1.0 の中間」に置き、常に増加順を保つ。
 */
export function syncTimeline(tl: number[], count: number): number[] {
	const out = tl
		.slice(0, Math.max(count, 1))
		.map((v, i) => (i === 0 ? 0 : clamp01(Number(v) || 0)));
	if (out.length === 0) out.push(0);
	out[0] = 0;
	while (out.length < count) {
		const last = out[out.length - 1];
		out.push(clamp01(last + (1 - last) / 2));
	}
	for (let i = 1; i < out.length; i++) {
		if (out[i] <= out[i - 1]) out[i] = clamp01(out[i - 1] + 0.05);
	}
	return out;
}

/** 旧形式 (scenes が {text, progress}[] だった頃) の保存データも読めるようにする */
export function normalizeBuilder(raw: unknown): BuilderData {
	const r = (raw ?? {}) as Record<string, unknown>;
	let scenes: string[] = Array.isArray(r.scenes)
		? r.scenes.map((s) =>
				typeof s === 'string' ? s : String((s as { text?: string })?.text ?? '')
			)
		: [''];
	if (scenes.length === 0) scenes = [''];
	const duration =
		typeof r.duration === 'number' && isFinite(r.duration) && r.duration > 0 ? r.duration : 12;
	const timeline = syncTimeline(
		Array.isArray(r.timeline) ? r.timeline.map(Number) : [],
		scenes.length
	);
	const links = Array.from({ length: scenes.length }, (_, i) =>
		Array.isArray(r.links) ? Boolean(r.links[i]) : false
	);
	return {
		duration,
		prefix: String(r.prefix ?? ''),
		suffix: String(r.suffix ?? ''),
		scenes,
		links,
		timeline
	};
}

export function filledSceneCount(data: unknown): number {
	return normalizeBuilder(data).scenes.filter((s) => s.trim()).length;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** 連結情報から一続きのブロック (インデックスの並び) に分割する */
export function sceneBlocks(count: number, links: boolean[]): number[][] {
	const blocks: number[][] = [];
	let cur: number[] = [];
	for (let i = 0; i < count; i++) {
		cur.push(i);
		if (i === count - 1 || !links[i]) {
			blocks.push(cur);
			cur = [];
		}
	}
	return blocks;
}

export interface FilteredScenes {
	texts: string[];
	/** links[i]: texts[i] と texts[i+1] が連結されているか */
	links: boolean[];
}

/** 空シーンを除外し、連結情報を詰め直す (空シーンを挟んでいても連結は維持) */
export function filterScenes(data: BuilderData): FilteredScenes {
	const items: { text: string; idx: number }[] = [];
	data.scenes.forEach((s, i) => {
		if (s.trim()) items.push({ text: s.trim(), idx: i });
	});
	const links: boolean[] = [];
	for (let k = 0; k < items.length - 1; k++) {
		let linked = true;
		for (let g = items[k].idx; g < items[k + 1].idx; g++) {
			linked = linked && Boolean(data.links[g]);
		}
		links.push(linked);
	}
	return { texts: items.map((it) => it.text), links };
}

/** シャッフルで動かせる中間ブロック数 (2未満ならシャッフルしても並びは変わらない) */
export function middleBlockCount(data: BuilderData): number {
	const { texts, links } = filterScenes(data);
	if (texts.length <= 2) return 0;
	return Math.max(0, sceneBlocks(texts.length, links).length - 2);
}

/**
 * シーンの並び順を返す。
 * 2つ以下はそのまま。3つ以上は最初と最後 (を含むブロック) を固定し、
 * 中間をブロック単位でシャッフルする。連結ブロック内の順番・隣接は変わらない。
 */
export function sceneOrder(count: number, seed: number, links: boolean[] = []): number[] {
	const idx = Array.from({ length: count }, (_, i) => i);
	if (count <= 2) return idx;
	const blocks = sceneBlocks(count, links);
	if (blocks.length <= 2) return idx;
	const middle = blocks.slice(1, -1);
	const rnd = mulberry32(seed);
	for (let i = middle.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[middle[i], middle[j]] = [middle[j], middle[i]];
	}
	return [...blocks[0], ...middle.flat(), ...blocks[blocks.length - 1]];
}

/**
 * 前置 + [Shot 1..N] (中間ランダム) + 後置 を組み立てる。
 * タイムスタンプはタイムラインのキーフレームからスロット順に割り当てる
 * (Shot 1 はタイムスタンプなし)。
 */
export function buildPrompt(data: BuilderData, seed: number): string {
	const { texts, links } = filterScenes(data);
	const order = sceneOrder(texts.length, seed, links);
	const parts: string[] = [];

	if (data.prefix.trim()) parts.push(convertProgressTags(data.prefix.trim(), data.duration));

	order.forEach((sceneIdx, n) => {
		const at =
			n === 0
				? ''
				: ` At ${formatTimestamp(clamp01(data.timeline[n] ?? 0) * data.duration)}`;
		parts.push(`[Shot ${n + 1}]${at} ${convertProgressTags(texts[sceneIdx], data.duration)}`);
	});

	if (data.suffix.trim()) parts.push(convertProgressTags(data.suffix.trim(), data.duration));

	return parts.join('\n\n');
}
