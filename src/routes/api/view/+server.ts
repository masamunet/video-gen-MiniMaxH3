import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';
import { VIDEOS_DIR } from '$lib/server/runpod';
import { promises as fsp, existsSync } from 'node:fs';
import path from 'node:path';

const MIME: Record<string, string> = {
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mov': 'video/quicktime',
	'.gif': 'image/gif',
	'.png': 'image/png',
	'.jpg': 'image/jpeg'
};

// ComfyUI の /view の中継、または data/videos のローカルファイル配信 (Range 対応)
export const GET: RequestHandler = async ({ url, request }) => {
	const host = url.searchParams.get('host');
	const filename = url.searchParams.get('filename');
	if (!filename) throw error(400, 'filename が必要です');

	// ── ローカル保存ファイル (RunPod 生成) ──
	if (url.searchParams.get('type') === 'local') {
		const safe = path.basename(filename);
		const full = path.join(VIDEOS_DIR, safe);
		if (!existsSync(full)) throw error(404, 'ファイルが見つかりません');
		const buf = await fsp.readFile(full);

		const headers = new Headers();
		headers.set('content-type', MIME[path.extname(safe).toLowerCase()] ?? 'application/octet-stream');
		headers.set('accept-ranges', 'bytes');
		if (url.searchParams.get('download')) {
			headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`);
		}

		const range = request.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
		if (range && (range[1] || range[2])) {
			const start = range[1] ? parseInt(range[1]) : Math.max(0, buf.length - parseInt(range[2]));
			const end = range[1] && range[2] ? Math.min(parseInt(range[2]), buf.length - 1) : buf.length - 1;
			if (start >= buf.length || start > end) throw error(416, 'Range が不正です');
			headers.set('content-range', `bytes ${start}-${end}/${buf.length}`);
			headers.set('content-length', String(end - start + 1));
			return new Response(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers });
		}
		headers.set('content-length', String(buf.length));
		return new Response(new Uint8Array(buf), { status: 200, headers });
	}

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
