// The forecast for a calendar's weather place, for the Weather section in Settings.
// It reads the same shared cache the calendar does (src/lib/weather.ts), so looking at it
// doesn't add calls to the weather service or change what the calendar fetches.
import { getForecast } from '../../../lib/weather';
import { wxLabel } from '../../../lib/eink/weatherIcon';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function GET({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	let row: any = null;
	try {
		row = await db.prepare('SELECT weather_name, weather_lat, weather_lon FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	} catch {
		return json({ ok: true, days: [] }); // before schema-weather.sql
	}
	if (!row) return json({ error: 'Device not found.' }, 404);
	if (row.weather_lat == null || row.weather_lon == null) return json({ ok: true, days: [] });
	const f = await getForecast(db, row.weather_lat, row.weather_lon);
	if (!f) return json({ ok: false, error: 'The forecast isn’t available right now.' });
	const days = (f.days?.length ? f.days : [{ date: '', code: f.code ?? 3, high: f.high, low: f.low, rain: f.rain ?? null, wind: f.wind ?? null }]).map((d) => ({
		date: d.date,
		label: wxLabel(d.code),
		code: d.code,
		high: Math.round(d.high),
		low: Math.round(d.low),
		rain: d.rain ?? null,
		wind: d.wind ?? null,
	}));
	return json({ ok: true, name: row.weather_name ?? '', days });
}
