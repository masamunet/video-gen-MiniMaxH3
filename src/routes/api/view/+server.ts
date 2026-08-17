import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';

// ComfyUI の /view を同一オリジンで中継する(動画ストリーミング + Range 対応)
export const GET: RequestHandler = async ({ url, request }) => {
	const host = url.searchParams.get('host');
	const filename = url.searchParams.get('filename');
	if (!filename) throw error(400, 'filename が必要です');

	const target = comfyUrl(host, '/view');
	target.searchParams.set('filename', filename);
	target.searchParams.set('subfolder', url.searchParams.get('subfolder') ?? '');
	target.searchParams.set('type', url.searchParams.get('type') ?? 'output');

	const headers: Record<string, string> = {};
	const range = request.headers.get('range');
	if (range) headers['range'] = range;

	let res: Response;
	try {
		res = await fetch(target, { headers });
	} catch {
		throw error(502, 'ComfyUI に接続できません');
	}
	if (!res.ok && res.status !== 206) throw error(res.status, 'ファイルを取得できません');

	const out = new Headers();
	for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
		const v = res.headers.get(h);
		if (v) out.set(h, v);
	}
	if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
	if (url.searchParams.get('download')) {
		out.set(
			'content-disposition',
			`attachment; filename*=UTF-8''${encodeURIComponent(filename.split('/').pop() ?? filename)}`
		);
	}

	return new Response(res.body, { status: res.status, headers: out });
};
