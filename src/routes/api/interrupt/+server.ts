import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';
import { runpodHeaders, runpodKey, runpodUrl } from '$lib/server/runpod';

// 実行中の生成を中断する
export const POST: RequestHandler = async ({ request }) => {
	const { host, backend, endpointId, jobId } = await request.json();

	if (backend === 'runpod') {
		const key = runpodKey();
		if (!key || !endpointId || !jobId) return json({ ok: false });
		try {
			await fetch(runpodUrl(endpointId, `cancel/${encodeURIComponent(jobId)}`), {
				method: 'POST',
				headers: runpodHeaders(key)
			});
			return json({ ok: true });
		} catch {
			return json({ error: 'RunPod に接続できません' }, { status: 502 });
		}
	}

	try {
		await fetch(comfyUrl(host, '/interrupt'), { method: 'POST' });
		return json({ ok: true });
	} catch {
		return json({ error: 'ComfyUI に接続できません' }, { status: 502 });
	}
};
