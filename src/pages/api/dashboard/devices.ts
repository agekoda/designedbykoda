// The logged-in user's paired devices: list them, and edit one device's
// name / layout / calendars. Everything is checked against the session's
// user, so you can only ever see or change your own devices.
import { isStyleId, DEFAULT_STYLE } from '../../../data/calendarStyles';
export const prerender = false;

function parseIds(raw: unknown): string[] | null {
	if (typeof raw !== 'string' || !raw) return null;
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) && v.length ? v.filter((x) => typeof x === 'string') : null;
	} catch {
		return null;
	}
}

export async function GET({ request, locals }) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);

	const user = await db
		.prepare('SELECT selected_calendar_ids, calendar_style FROM users WHERE id = ?')
		.bind(userId)
		.first();
	const rows = await db
		.prepare(
			`SELECT id, name, calendar_style, selected_calendar_ids, last_seen_at, created_at, refresh_interval_sec
			 FROM devices WHERE user_id = ? ORDER BY created_at`
		)
		.bind(userId)
		.all();
	// Weather location lives in columns from schema-weather.sql; read
	// separately so the dashboard still loads before that migration is run.
	const locs = new Map<string, { name: string; lat: number; lon: number }>();
	const dark = new Set<string>();
	try {
		const dr = await db.prepare('SELECT id FROM devices WHERE user_id = ? AND dark_mode = 1').bind(userId).all();
		for (const d of dr.results ?? []) dark.add(d.id);
	} catch {} // dark_mode column comes from schema-darkmode.sql
	try {
		const lr = await db
			.prepare('SELECT id, weather_name, weather_lat, weather_lon FROM devices WHERE user_id = ? AND weather_lat IS NOT NULL')
			.bind(userId)
			.all();
		for (const l of lr.results ?? []) locs.set(l.id, { name: l.weather_name || '', lat: l.weather_lat, lon: l.weather_lon });
	} catch {}

	// Battery + chosen font, from schema-display.sql (also read separately, same reason).
	const extra = new Map<string, { batteryMv: number | null; batteryAt: number | null; font: string | null; cornerMode: string; cornerBits: string | null }>();
	try {
		const er = await db.prepare("SELECT id, battery_mv, battery_at, layout_font, corner_mode, CASE WHEN corner_mode = 'image' THEN corner_bits END AS corner_bits FROM devices WHERE user_id = ?").bind(userId).all();
		for (const e of er.results ?? []) {
			extra.set(e.id, { batteryMv: e.battery_mv ?? null, batteryAt: e.battery_at ?? null, font: e.layout_font ?? null, cornerMode: e.corner_mode === 'image' ? 'image' : 'calendar', cornerBits: e.corner_mode === 'image' ? e.corner_bits ?? null : null });
		}
	} catch {}

	const devices = (rows.results ?? []).map((d: any) => ({
		id: d.id,
		name: d.name || '',
		style: isStyleId(d.calendar_style) ? d.calendar_style : isStyleId(user?.calendar_style) ? user.calendar_style : DEFAULT_STYLE,
		calendarIds: parseIds(d.selected_calendar_ids) ?? parseIds(user?.selected_calendar_ids) ?? [],
		lastSeenAt: d.last_seen_at ?? null,
		createdAt: d.created_at ?? null,
		refreshIntervalSec: d.refresh_interval_sec || 86400,
		location: locs.get(d.id) ?? null,
		dark: dark.has(d.id),
		batteryMv: extra.get(d.id)?.batteryMv ?? null,
		batteryAt: extra.get(d.id)?.batteryAt ?? null,
		font: extra.get(d.id)?.font ?? null,
		cornerMode: extra.get(d.id)?.cornerMode ?? 'calendar',
		cornerBits: extra.get(d.id)?.cornerBits ?? null,
	}));
	return json({ devices }, 200);
}

export async function POST({ request, locals }) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
	const owned = await db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	if (!owned) return json({ error: 'Device not found.' }, 404);

	const sets: string[] = [];
	const vals: unknown[] = [];
	if (body.name !== undefined) {
		const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
		sets.push('name = ?');
		vals.push(name || null);
	}
	if (body.style !== undefined) {
		if (!isStyleId(body.style)) return json({ error: 'Unknown style.' }, 400);
		sets.push('calendar_style = ?');
		vals.push(body.style);
	}
	if (body.calendarIds !== undefined) {
		if (!Array.isArray(body.calendarIds)) return json({ error: 'Invalid calendars.' }, 400);
		const ids = body.calendarIds.filter((x: unknown) => typeof x === 'string').slice(0, 50);
		sets.push('selected_calendar_ids = ?');
		vals.push(JSON.stringify(ids));
	}
	if (body.location !== undefined) {
		// null clears it; otherwise { name, lat, lon } from the city search.
		const loc = body.location;
		if (loc === null) {
			sets.push('weather_name = NULL', 'weather_lat = NULL', 'weather_lon = NULL');
		} else {
			const lat = Number(loc?.lat);
			const lon = Number(loc?.lon);
			const name = typeof loc?.name === 'string' ? loc.name.trim().slice(0, 80) : '';
			if (!name || !(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) {
				return json({ error: 'Invalid location.' }, 400);
			}
			sets.push('weather_name = ?', 'weather_lat = ?', 'weather_lon = ?');
			vals.push(name, lat, lon);
		}
	}
	if (sets.length) {
		try {
			await db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, deviceId, userId).run();
		} catch {
			return json({ error: 'Device settings are not enabled on the server yet.' }, 500);
		}
	}
	// Dark mode has its own column/migration, so a missing one only fails this part.
	if (body.dark !== undefined) {
		if (typeof body.dark !== 'boolean') return json({ error: 'Invalid dark mode value.' }, 400);
		try {
			await db.prepare('UPDATE devices SET dark_mode = ? WHERE id = ? AND user_id = ?').bind(body.dark ? 1 : 0, deviceId, userId).run();
		} catch {
			return json({ error: 'Dark mode is not enabled on the server yet.' }, 500);
		}
	}
	return json({ ok: true }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
