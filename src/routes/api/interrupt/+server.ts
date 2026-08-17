import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';

// 実行中の生成を中断する
export const POST: RequestHandler = async ({ request }) => {
	const { host } = await request.json();
	try {
		await fetch(comfyUrl(host, '/interrupt'), { method: 'POST' });
		return json({ ok: true });
	} catch {
		return json({ error: 'ComfyUI に接続できません' }, { status: 502 });
	}
};
