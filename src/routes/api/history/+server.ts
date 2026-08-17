import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listHistory, insertHistory } from '$lib/server/db';
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
