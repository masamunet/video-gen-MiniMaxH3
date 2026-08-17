import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listDecks, upsertDeck } from '$lib/server/db';
import type { SavedDeck } from '$lib/stores.svelte';

export const GET: RequestHandler = async () => {
	return json(
		listDecks().map(
			(row): SavedDeck => ({
				id: row.id,
				name: row.name,
				cards: JSON.parse(row.data),
				createdAt: row.createdAt,
				updatedAt: row.updatedAt
			})
		)
	);
};

export const POST: RequestHandler = async ({ request }) => {
	const d: SavedDeck = await request.json();
	if (!d?.id || !Array.isArray(d.cards)) {
		return json({ error: 'id と cards が必要です' }, { status: 400 });
	}
	upsertDeck({
		id: d.id,
		name: d.name?.trim() || '無題デッキ',
		data: JSON.stringify(d.cards),
		createdAt: d.createdAt ?? Date.now(),
		updatedAt: d.updatedAt ?? Date.now()
	});
	return json({ ok: true });
};
