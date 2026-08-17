import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteRecipe } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params }) => {
	deleteRecipe(params.id);
	return json({ ok: true });
};
