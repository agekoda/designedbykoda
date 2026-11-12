// Copies one calendar's display settings to another of the same account: the screen, look,
// schedule, signs, reminders, pictures and Your designs (and, if asked, its calendars and weather).
// The other calendar's own versions of these are replaced. Its name, messages and pairing stay.
import { markSaved } from '../../../../lib/screens';
import { newDesignId } from '../../../../lib/designs';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Columns, grouped by the migration that added them, so a missing migration only skips its group.
const GROUPS: string[][] = [
	['calendar_style', 'refresh_interval_sec'],
	['dark_mode'],
	['layout_font', 'corner_mode', 'corner_bits', 'corner_src', 'corner_cfg'],
	['countdown_title', 'countdown_date'],
	['frame_bits', 'frame_src', 'frame_cfg'],
	['custom_layout'],
	['language'],
	['schedule', 'temp_unit', 'sign_cfg'],
	['reminders'],
];
const CALENDARS: string[][] = [['selected_calendar_ids'], ['weather_name', 'weather_lat', 'weather_lon']];

export async function POST({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const from = String(body?.from ?? '');
	const to = String(body?.to ?? '');
	if (!from || !to || from === to) return json({ error: 'Pick another calendar to copy to.' }, 400);
	const both = await db.prepare('SELECT id FROM devices WHERE user_id = ? AND id IN (?, ?)').bind(userId, from, to).all();
	if ((both.results ?? []).length !== 2) return json({ error: 'Device not found.' }, 404);

	// Your designs first, so the screen and the schedule can point at the copies.
	const idMap = new Map<string, string>();
	try {
		const ds = await db.prepare('SELECT id, name, layout FROM designs WHERE device_id = ? ORDER BY created_at').bind(from).all();
		const now = Math.floor(Date.now() / 1000);
		const stmts = [db.prepare('DELETE FROM designs WHERE device_id = ?').bind(to)];
		try {
			await db.prepare('DELETE FROM shared_designs WHERE device_id = ?').bind(to).run(); // their old designs' links stop working
		} catch {}
		let i = 0;
		for (const d of ds.results ?? []) {
			const nid = newDesignId();
			idMap.set(d.id, nid);
			stmts.push(db.prepare('INSERT INTO designs (id, device_id, name, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(nid, to, d.name, d.layout, now + i, now + i));
			i++;
		}
		await db.batch(stmts);
	} catch {} // schema-designs.sql not run: nothing to copy
	const remap = (v: unknown) => {
		if (typeof v !== 'string') return v;
		let out = v;
		for (const [a, b] of idMap) out = out.split('design:' + a).join('design:' + b);
		return out;
	};

	let copied = 0;
	for (const cols of [...GROUPS, ...(body?.calendars ? CALENDARS : [])]) {
		try {
			const row = await db.prepare(`SELECT ${cols.join(', ')} FROM devices WHERE id = ?`).bind(from).first();
			if (!row) continue;
			const vals = cols.map((c) => (c === 'calendar_style' || c === 'schedule' ? remap(row[c]) : row[c]) ?? null);
			await db.prepare(`UPDATE devices SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, to, userId).run();
			copied++;
		} catch {} // that migration isn't run on this server
	}
	if (!copied) return json({ error: 'Could not copy the settings.' }, 500);
	await markSaved(db, to);
	return json({ ok: true });
}
