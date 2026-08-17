import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listHistory, insertHistory, deleteHistoryMany } from '$lib/server/db';
import type { HistoryRecord } from '$lib/stores.svelte';

function toRecord(row: ReturnType<typeof listHistory>[number]): HistoryRecord {
	return {
		id: row.id,
		date: row.date,
		params: JSON.parse(row.params),
		jpPrompt: row.jpPrompt,
		enPrompt: row.enPrompt,
		seconds: row.seconds,
		video: row.video ? JSON.parse(row.video) : null
	};
}

export const GET: RequestHandler = async () => {
	return json(listHistory().map(toRecord));
};

export const POST: RequestHandler = async ({ request }) => {
	const rec: HistoryRecord = await request.json();
	if (!rec?.id) return json({ error: 'id が必要です' }, { status: 400 });
	insertHistory({
		id: rec.id,
		date: rec.date ?? Date.now(),
		params: JSON.stringify(rec.params ?? {}),
		jpPrompt: rec.jpPrompt ?? '',
		enPrompt: rec.enPrompt ?? '',
		seconds: rec.seconds ?? 0,
		video: rec.video ? JSON.stringify(rec.video) : null
	});
	return json({ ok: true });
};

// 一括削除。{ ids: string[] } を受け取る (ComfyUI 上の動画ファイルは消さない)
export const DELETE: RequestHandler = async ({ request }) => {
	const { ids } = await request.json();
	if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
		return json({ error: 'ids (string[]) が必要です' }, { status: 400 });
	}
	return json({ ok: true, deleted: deleteHistoryMany(ids) });
};
