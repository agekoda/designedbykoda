// Detaches one device from the logged-in account. The device row stays (it
// still has its own secret) but loses its owner and settings, and gets a
// fresh pairing code, so on its next refresh it shows the pairing screen
// again (see the not_paired branch in /api/device/{id}/today).
export const prerender = false;

export async function POST({ request, locals }) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);

	let deviceId = '';
	try {
		const body = await request.json();
		deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}

	const { releaseDevice } = await import('../../../../lib/unpair');
	const ok = await releaseDevice(db, deviceId, userId);
	if (!ok) return json({ error: 'Device not found.' }, 404);
	return json({ ok: true }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
