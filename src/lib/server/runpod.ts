// RunPod Serverless との通信ヘルパー。
// API キーは環境変数 RUNPOD_API_KEY で渡す (ファイルや設定 UI には置かない)。
import { env } from '$env/dynamic/private';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const VIDEOS_DIR = path.resolve('data', 'videos');
mkdirSync(VIDEOS_DIR, { recursive: true });

export function runpodKey(): string | null {
	return env.RUNPOD_API_KEY || null;
}

export const NO_KEY_ERROR =
	'RUNPOD_API_KEY が設定されていません。サーバーを RUNPOD_API_KEY=... を付けて起動してください';

export function runpodUrl(endpointId: string, apiPath: string): string {
	return `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/${apiPath}`;
}

export function runpodHeaders(key: string): Record<string, string> {
	return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
}

/**
 * base64 の動画を data/videos に保存し、保存ファイル名を返す。
 * ジョブ ID をプレフィックスにして衝突を防ぐ (同一ジョブの再保存はスキップ)。
 */
export function saveVideoFromBase64(jobId: string, filename: string, b64: string): string {
	const safe = path.basename(filename || 'output.mp4');
	const stored = `${jobId}_${safe}`.replace(/[^\w.-]/g, '_');
	const full = path.join(VIDEOS_DIR, stored);
	if (!existsSync(full)) writeFileSync(full, Buffer.from(b64, 'base64'));
	return stored;
}
