// Called from the (future) dashboard once a logged-in user enters the
// pairing code shown on their device's setup screen.
export const prerender = false;

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);

	const { getSessionUserId } = await import('../../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) {
		return json({ error: 'Not logged in.' }, 401);
	}

	let pairingCode: string;
	try {
		const body = await request.json();
		pairingCode = typeof body.pairingCode === 'string' ? body.pairingCode.trim().toUpperCase() : '';
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	if (!pairingCode) {
		return json({ error: 'pairingCode is required.' }, 400);
	}

	const now = Math.floor(Date.now() / 1000);
	const device = await db
		.prepare(
			`SELECT id, user_id, pairing_code_expires_at FROM devices WHERE pairing_code = ?`
		)
		.bind(pairingCode)
		.first();

	if (!device) {
		return json({ error: 'No device found with that pairing code.' }, 404);
	}
	if (device.user_id) {
		return json({ error: 'This device is already paired to an account.' }, 409);
	}
	if (!device.pairing_code_expires_at || device.pairing_code_expires_at < now) {
		return json(
			{ error: 'This pairing code has expired. Reset the device to get a new one.' },
			410
		);
	}

	// Claiming the device: link it to this user, and clear the pairing
	// code so it can never be reused or guessed after the fact.
	await db
		.prepare('UPDATE devices SET user_id = ?, pairing_code = NULL, pairing_code_expires_at = NULL WHERE id = ?')
		.bind(userId, device.id)
		.run();

	return json({ ok: true, deviceId: device.id }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
