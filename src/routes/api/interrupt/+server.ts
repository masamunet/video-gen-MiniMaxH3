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
		// jobId 指定時: 実行中なら /interrupt、キュー待ちなら /queue から削除する
		if (jobId) {
			let running = false;
			try {
				const q = await fetch(comfyUrl(host, '/queue')).then((r) => r.json());
				running = (q.queue_running ?? []).some((item: unknown[]) => item[1] === jobId);
			} catch {
				running = true; // 判定できないときは実行中とみなす
			}
			if (running) {
				await fetch(comfyUrl(host, '/interrupt'), { method: 'POST' });
			} else {
				await fetch(comfyUrl(host, '/queue'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ delete: [jobId] })
				});
			}
			return json({ ok: true });
		}

		await fetch(comfyUrl(host, '/interrupt'), { method: 'POST' });
		return json({ ok: true });
	} catch {
		return json({ error: 'ComfyUI に接続できません' }, { status: 502 });
	}
};
