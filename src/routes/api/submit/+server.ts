import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { comfyUrl } from '$lib/server/comfy';

export const POST: RequestHandler = async ({ request }) => {
	const { host, workflow } = await request.json();
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
