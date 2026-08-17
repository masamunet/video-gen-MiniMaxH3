// ComfyUI との通信ヘルパー(すべて同一オリジンのプロキシ /api/* 経由でCORSを回避)
import { EN_FINAL_ID, JP_CAPTURE_ID, SAVE_VIDEO_ID } from './workflow';
import type { VideoFile } from './stores.svelte';

export interface SubmitResult {
	prompt_id?: string;
	error?: string;
}

export async function submitWorkflow(
	host: string,
	workflow: Record<string, unknown>
): Promise<SubmitResult> {
	const res = await fetch('/api/submit', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ host, workflow })
	});
	const data = await res.json();
	if (!res.ok) return { error: data.error ?? `送信に失敗しました (${res.status})` };
	return data;
}

export type PollState =
	| { state: 'queued'; position: number }
	| { state: 'running' }
	| { state: 'done'; outputs: Record<string, Record<string, unknown>> }
	| { state: 'error'; message: string }
	| { state: 'unknown' };

export async function pollStatus(host: string, promptId: string): Promise<PollState> {
	const res = await fetch(`/api/status/${encodeURIComponent(promptId)}?host=${encodeURIComponent(host)}`);
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		return { state: 'error', message: data.error ?? `状態取得に失敗しました (${res.status})` };
	}
	return res.json();
}

export async function interrupt(host: string): Promise<void> {
	await fetch('/api/interrupt', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ host })
	}).catch(() => {});
}

export interface ParsedOutputs {
	video: VideoFile | null;
	jpPrompt: string;
	enPrompt: string;
}

const VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi|gif)$/i;

/** history の outputs から動画ファイルと最終プロンプト(日/英)を取り出す */
export function parseOutputs(outputs: Record<string, Record<string, unknown>>): ParsedOutputs {
	let video: VideoFile | null = null;
	const texts: Record<string, string> = {};

	for (const [nodeId, out] of Object.entries(outputs)) {
		// ShowText 系ノードはノードにより text / text_display のどちらかで出力する
		const textArr = out.text ?? out.text_display;
		if (Array.isArray(textArr)) {
			texts[nodeId] = (textArr as unknown[]).map(String).join('\n');
		}
		for (const key of ['images', 'gifs', 'videos', 'video']) {
			const arr = out[key];
			if (!Array.isArray(arr)) continue;
			for (const item of arr as Array<Record<string, unknown>>) {
				const filename = String(item.filename ?? '');
				if (!filename) continue;
				const file: VideoFile = {
					filename,
					subfolder: String(item.subfolder ?? ''),
					type: String(item.type ?? 'output')
				};
				// SaveVideo ノードの出力を最優先、それ以外は拡張子で判定
				if (nodeId === SAVE_VIDEO_ID) video = video ?? file;
				else if (VIDEO_EXT.test(filename)) video = video ?? file;
			}
		}
	}

	return {
		video,
		jpPrompt: texts[JP_CAPTURE_ID] ?? '',
		enPrompt: texts[EN_FINAL_ID] ?? ''
	};
}

export function videoUrl(host: string, file: VideoFile, download = false): string {
	const q = new URLSearchParams({
		host,
		filename: file.filename,
		subfolder: file.subfolder,
		type: file.type
	});
	if (download) q.set('download', '1');
	return `/api/view?${q}`;
}

export interface ResolutionOptions {
	aspectRatios: string[];
	fromServer: boolean;
}

/** ResolutionSelector の選択肢を ComfyUI の /object_info から取得する */
export async function fetchResolutionOptions(host: string): Promise<ResolutionOptions | null> {
	try {
		const res = await fetch(
			`/api/objectinfo?host=${encodeURIComponent(host)}&class=${encodeURIComponent('ResolutionSelector')}`
		);
		if (!res.ok) return null;
		const data = await res.json();
		const input = data?.ResolutionSelector?.input;
		const required = { ...(input?.required ?? {}), ...(input?.optional ?? {}) };

		// 選択肢は旧形式 [["a","b"], {...}] と新形式 ["COMBO", {options: [...]}] の両方に対応
		let aspectRatios: string[] = [];
		const ar = required.aspect_ratio;
		if (Array.isArray(ar)) {
			if (Array.isArray(ar[0])) aspectRatios = ar[0].map(String);
			else if (ar[0] === 'COMBO' && Array.isArray(ar[1]?.options))
				aspectRatios = ar[1].options.map(String);
		}

		// メガピクセルはアプリ側で実用域 (0.1〜2.0) に固定しているため取得しない
		if (aspectRatios.length === 0) return null;
		return { aspectRatios, fromServer: true };
	} catch {
		return null;
	}
}

export function fmtSeconds(s: number): string {
	if (s >= 60) {
		const m = Math.floor(s / 60);
		return `${m}分${Math.round(s % 60)}秒`;
	}
	return `${s.toFixed(1)}秒`;
}
