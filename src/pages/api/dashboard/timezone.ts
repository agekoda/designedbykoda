// Saves the logged-in user's real IANA timezone (e.g. "Australia/Perth"),
// detected client-side via the browser's Intl API — see setup.astro,
// which calls this automatically on page load. Kept as its own endpoint
// rather than folded into calendars.ts so it can't accidentally overwrite
// the calendar selection (or vice versa) if only one of the two changes.
export const prerender = false;

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);

	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);

	let timezone: string;
	try {
		const body = await request.json();
		timezone = typeof body.timezone === 'string' ? body.timezone.trim() : '';
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}

	// Sanity check rather than a full IANA validation — reject anything
	// obviously wrong without needing to bundle a full timezone database
	// just to validate a string we generated with Intl ourselves anyway.
	if (!timezone || timezone.length > 64 || !/^[A-Za-z0-9_+\-\/]+$/.test(timezone)) {
		return json({ error: 'Invalid timezone.' }, 400);
	}

	await db.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(timezone, userId).run();

	return json({ ok: true }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
