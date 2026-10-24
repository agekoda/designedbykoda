// Deletes the logged-in person's account and everything we hold for it:
// every device is unpaired (and left ready to be paired again), their
// Google connection is revoked and the stored token deleted, and the user
// row and all sessions are removed.
export const prerender = false;

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);

	// Best effort: tell Google to revoke the access we were given.
	try {
		const user = await db.prepare('SELECT encrypted_refresh_token FROM users WHERE id = ?').bind(userId).first();
		if (user?.encrypted_refresh_token && env.TOKEN_ENCRYPTION_KEY) {
			const { decryptToken } = await import('../../../../lib/crypto');
			const token = await decryptToken(user.encrypted_refresh_token, env.TOKEN_ENCRYPTION_KEY);
			await fetch('https://oauth2.googleapis.com/revoke', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ token }),
			});
		}
	} catch {
		/* revoking is a courtesy; deleting our copy below is what matters */
	}

	const { releaseDevice } = await import('../../../../lib/unpair');
	const devices = await db.prepare('SELECT id FROM devices WHERE user_id = ?').bind(userId).all();
	for (const d of devices.results ?? []) await releaseDevice(db, d.id, userId);

	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
	await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
		},
	});
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
