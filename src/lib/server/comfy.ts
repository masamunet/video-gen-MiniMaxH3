import { error } from '@sveltejs/kit';

/** 設定値のホストを正規化して ComfyUI のエンドポイント URL を作る */
export function comfyUrl(host: string | null, path: string): URL {
	if (!host) throw error(400, 'host が指定されていません');
	let base = host.trim();
	if (!/^https?:\/\//.test(base)) base = `http://${base}`;
	if (!base.endsWith('/')) base += '/';
	try {
		return new URL(path.replace(/^\//, ''), base);
	} catch {
		throw error(400, `不正なホストです: ${host}`);
	}
}
