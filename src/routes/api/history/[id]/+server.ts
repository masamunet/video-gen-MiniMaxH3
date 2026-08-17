import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteHistory } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params }) => {
	deleteHistory(params.id);
	return json({ ok: true });
};
