// Real data for the builder's connection widgets (YouTube, headlines, GitHub, prices, tides, UV),
// so typing a channel shows its real count. Same fetching and the same shared cache as the calendar.
import { connectFor } from '../../../lib/connect';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals }: any) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request.' }, 400);
	}
	const widgets = (Array.isArray(body?.widgets) ? body.widgets : [])
		.filter((w: any) => w && typeof w.t === 'string' && w.o && typeof w.o === 'object')
		.slice(0, 30)
		.map((w: any) => ({ t: w.t, o: w.o }));
	let place: { lat: number; lon: number } | null = null;
	try {
		const r: any = await db.prepare('SELECT weather_lat, weather_lon FROM devices WHERE id = ? AND user_id = ?').bind(String(body?.deviceId ?? ''), userId).first();
		if (r && r.weather_lat != null && r.weather_lon != null) place = { lat: r.weather_lat, lon: r.weather_lon };
	} catch {}
	return json({ ok: true, connect: await connectFor(widgets, place, env) });
}
