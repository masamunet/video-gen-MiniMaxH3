import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';

// ノード定義(選択肢など)を ComfyUI の /object_info から取得する
export const GET: RequestHandler = async ({ url }) => {
	const host = url.searchParams.get('host');
	const cls = url.searchParams.get('class');
	if (!cls) return json({ error: 'class が必要です' }, { status: 400 });

	try {
		const res = await fetch(comfyUrl(host, `/object_info/${encodeURIComponent(cls)}`));
		if (!res.ok) return json({ error: `取得に失敗しました (${res.status})` }, { status: 502 });
		return json(await res.json());
	} catch {
		return json({ error: 'ComfyUI に接続できません' }, { status: 502 });
	}
};
