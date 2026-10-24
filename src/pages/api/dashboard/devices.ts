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

	const devices = (rows.results ?? []).map((d: any) => ({
		id: d.id,
		name: d.name || '',
		style: isStyleId(d.calendar_style) ? d.calendar_style : isStyleId(user?.calendar_style) ? user.calendar_style : DEFAULT_STYLE,
		calendarIds: parseIds(d.selected_calendar_ids) ?? parseIds(user?.selected_calendar_ids) ?? [],
		lastSeenAt: d.last_seen_at ?? null,
		createdAt: d.created_at ?? null,
		refreshIntervalSec: d.refresh_interval_sec || 86400,
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
	if (!sets.length) return json({ ok: true }, 200);

	try {
		await db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, deviceId, userId).run();
	} catch {
		return json({ error: 'Device settings are not enabled on the server yet.' }, 500);
	}
	return json({ ok: true }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
