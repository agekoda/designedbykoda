// Battery history for one calendar: the readings from the last 60 days, for the graph on My devices.
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function GET({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	const dev = await db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	if (!dev) return json({ error: 'Device not found.' }, 404);
	const since = Math.floor(Date.now() / 1000) - 60 * 86400;
	try {
		const r = await db.prepare('SELECT at, mv FROM battery_log WHERE device_id = ? AND at >= ? ORDER BY at').bind(deviceId, since).all();
		return json({ ok: true, points: (r.results ?? []).map((p: any) => [p.at, p.mv]) });
	} catch {
		return json({ ok: false, error: 'Battery history needs a one-off database update on the server (schema-battery.sql).' });
	}
}
