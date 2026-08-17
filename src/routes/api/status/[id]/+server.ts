import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';

// 生成状況を返す: queued(待ち順) / running / done(outputs付き) / error
export const GET: RequestHandler = async ({ params, url }) => {
	const host = url.searchParams.get('host');
	const id = params.id;

	try {
		const historyRes = await fetch(comfyUrl(host, `/history/${id}`));
		if (historyRes.ok) {
			const data = await historyRes.json();
			const entry = data?.[id];
			if (entry) {
				const statusStr = entry.status?.status_str;
				if (statusStr === 'error') {
					const messages = (entry.status?.messages ?? [])
						.filter((m: [string, unknown]) => m[0] === 'execution_error')
						.map((m: [string, { exception_message?: string; node_type?: string }]) =>
							[m[1]?.node_type, m[1]?.exception_message].filter(Boolean).join(': ')
						)
						.join(' / ');
					return json({ state: 'error', message: messages || '実行中にエラーが発生しました' });
				}
				if (entry.status?.completed || entry.outputs) {
					return json({ state: 'done', outputs: entry.outputs ?? {} });
				}
			}
		}

		const queueRes = await fetch(comfyUrl(host, '/queue'));
		if (queueRes.ok) {
			const queue = await queueRes.json();
			const running: unknown[][] = queue.queue_running ?? [];
			const pending: unknown[][] = queue.queue_pending ?? [];
			if (running.some((item) => item[1] === id)) return json({ state: 'running' });
			const pos = pending.findIndex((item) => item[1] === id);
			if (pos >= 0) return json({ state: 'queued', position: pos + 1 });
		}

		return json({ state: 'unknown' });
	} catch {
		return json({ error: 'ComfyUI に接続できません' }, { status: 502 });
	}
};
