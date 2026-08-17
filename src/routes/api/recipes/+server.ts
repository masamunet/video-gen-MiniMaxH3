import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listRecipes, upsertRecipe } from '$lib/server/db';
import type { Recipe } from '$lib/promptBuilder';

export const GET: RequestHandler = async () => {
	return json(
		listRecipes().map(
			(row): Recipe => ({
				id: row.id,
				name: row.name,
				data: JSON.parse(row.data),
				rating: row.rating,
				favorite: row.favorite === 1,
				comment: row.comment,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt
			})
		)
	);
};

export const POST: RequestHandler = async ({ request }) => {
	const rec: Recipe = await request.json();
	if (!rec?.id) return json({ error: 'id が必要です' }, { status: 400 });
	upsertRecipe({
		id: rec.id,
		name: rec.name ?? '無題レシピ',
		data: JSON.stringify(rec.data ?? {}),
		rating: rec.rating ?? 0,
		favorite: rec.favorite ? 1 : 0,
		comment: rec.comment ?? '',
		createdAt: rec.createdAt ?? Date.now(),
		updatedAt: rec.updatedAt ?? Date.now()
	});
	return json({ ok: true });
};
