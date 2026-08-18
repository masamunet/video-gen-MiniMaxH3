import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';
import {
	NO_KEY_ERROR,
	execTimeoutMs,
	runpodHeaders,
	runpodKey,
	runpodUrl
} from '$lib/server/runpod';

export const POST: RequestHandler = async ({ request }) => {
	const { host, workflow, backend, endpointId, executionTimeoutMin } = await request.json();

	// ── RunPod Serverless ──
	if (backend === 'runpod') {
		const key = runpodKey();
		if (!key) return json({ error: NO_KEY_ERROR }, { status: 400 });
		if (!endpointId) return json({ error: 'RunPod の Endpoint ID が設定されていません' }, { status: 400 });

		let res: Response;
		try {
			res = await fetch(runpodUrl(endpointId, 'run'), {
				method: 'POST',
				headers: runpodHeaders(key),
				// policy.executionTimeout でジョブ単位の実行タイムアウトを指定する。
				// 付けないとエンドポイント既定の10分で打ち切られ、重い設定の生成が
				// "executionTimeout exceeded" で失敗する
				body: JSON.stringify({
					input: { workflow },
					policy: { executionTimeout: execTimeoutMs(executionTimeoutMin) }
				})
			});
		} catch {
			return json({ error: 'RunPod に接続できません' }, { status: 502 });
		}
		const data = await res.json().catch(() => null);
		if (!res.ok || !data?.id) {
			return json(
				{ error: data?.error ?? `RunPod がエラーを返しました (${res.status})` },
				{ status: 502 }
			);
		}
		return json({ prompt_id: data.id });
	}

	// ── デスクトップの ComfyUI ──
	const url = comfyUrl(host, '/prompt');

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() })
		});
	} catch {
		return json({ error: `ComfyUI (${url.origin}) に接続できません` }, { status: 502 });
	}

	const data = await res.json().catch(() => null);
	if (!res.ok) {
		// ComfyUI はワークフロー検証エラーを {error, node_errors} で返す
		const detail =
			data?.error?.message ??
			(typeof data?.error === 'string' ? data.error : null) ??
			`ComfyUI がエラーを返しました (${res.status})`;
		const nodes = data?.node_errors ? Object.keys(data.node_errors).join(', ') : '';
		return json(
			{ error: nodes ? `${detail} [ノード: ${nodes}]` : detail },
			{ status: 502 }
		);
	}
	return json({ prompt_id: data.prompt_id });
};
