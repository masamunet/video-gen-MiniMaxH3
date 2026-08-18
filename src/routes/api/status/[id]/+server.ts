import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';
import {
	NO_KEY_ERROR,
	runpodHeaders,
	runpodKey,
	runpodUrl,
	saveVideoFromBase64
} from '$lib/server/runpod';

// 生成状況を返す: queued(待ち順) / running / done(outputs付き) / error
export const GET: RequestHandler = async ({ params, url }) => {
	const host = url.searchParams.get('host');
	const id = params.id;

	// ── RunPod Serverless ──
	if (url.searchParams.get('backend') === 'runpod') {
		const endpointId = url.searchParams.get('endpointId') ?? '';
		const key = runpodKey();
		if (!key) return json({ state: 'error', message: NO_KEY_ERROR });
		try {
			const res = await fetch(runpodUrl(endpointId, `status/${encodeURIComponent(id)}`), {
				headers: runpodHeaders(key)
			});
			if (!res.ok) return json({ state: 'unknown' });
			const d = await res.json();
			switch (d.status) {
				case 'IN_QUEUE':
					return json({ state: 'queued', position: 0 });
				case 'IN_PROGRESS':
					return json({ state: 'running' });
				case 'COMPLETED': {
					// output.images[] の base64 動画をローカルに保存し、
					// ComfyUI history と同じ形の outputs に変換して返す
					const images: Array<{ filename?: string; data?: string }> = d.output?.images ?? [];
					const files = images
						.filter((im) => im?.data)
						.map((im) => ({
							filename: saveVideoFromBase64(id, im.filename ?? 'output.mp4', im.data!),
							subfolder: '',
							type: 'local'
						}));
					// executionTime はワーカーの実行時間 (ms) = 課金対象時間
					return json({
						state: 'done',
						outputs: { '150': { images: files } },
						execSeconds: typeof d.executionTime === 'number' ? d.executionTime / 1000 : null
					});
				}
				case 'FAILED':
				case 'CANCELLED':
				case 'TIMED_OUT': {
					const raw = typeof d.error === 'string' ? d.error : '';
					// 実行時間オーバーは原因と対処が分かる日本語に置き換える
					const timedOut = d.status === 'TIMED_OUT' || /executionTimeout/i.test(raw);
					return json({
						state: 'error',
						message: timedOut
							? '実行時間が上限を超えました。設定の「実行タイムアウト」を延ばすか、メガピクセル / duration / steps を下げてください'
							: raw || `RunPod ジョブが ${d.status} になりました`
					});
				}
				default:
					return json({ state: 'unknown' });
			}
		} catch {
			return json({ error: 'RunPod に接続できません' }, { status: 502 });
		}
	}

	// ── デスクトップの ComfyUI ──
	try {
		const historyRes = await fetch(comfyUrl(host, `/history/${id}`));
		if (historyRes.ok) {
			const data = await historyRes.json();
			const entry = data?.[id];
			if (entry) {
				const statusStr = entry.status?.status_str;
				if (statusStr === 'error') {
					const msgs: [string, Record<string, string>][] = entry.status?.messages ?? [];
					// ComfyUI は中断されたジョブも status_str='error' として記録するため、
					// 実行エラーとは区別して返す
					if (msgs.some((m) => m[0] === 'execution_interrupted')) {
						return json({ state: 'cancelled' });
					}
					const messages = msgs
						.filter((m) => m[0] === 'execution_error')
						.map((m) => [m[1]?.node_type, m[1]?.exception_message].filter(Boolean).join(': '))
						.join(' / ');
					return json({ state: 'error', message: messages || '実行中にエラーが発生しました' });
				}
				if (entry.status?.completed || entry.outputs) {
					// 実際にこのジョブの生成にかかった時間 (キュー待ちを含まない)。
					// 連続投入時は送信時刻からの経過だと前のジョブの時間まで含んでしまう
					const msgs: [string, Record<string, number>][] = entry.status?.messages ?? [];
					const stamp = (name: string) =>
						msgs.find((m) => m[0] === name)?.[1]?.timestamp;
					const startedAt = stamp('execution_start');
					const finishedAt = stamp('execution_success');
					const execSeconds =
						startedAt && finishedAt && finishedAt >= startedAt
							? (finishedAt - startedAt) / 1000
							: null;
					return json({ state: 'done', outputs: entry.outputs ?? {}, execSeconds });
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
