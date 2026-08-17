import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteDeck } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params }) => {
	deleteDeck(params.id);
	return json({ ok: true });
};
