// Class names for a calendar's school timetables (src/lib/classes.ts): the codes found in its
// calendar links and files, with any names, rooms and things to bring; and saving them.
import { classCodes, loadClasses, saveClasses } from '../../../lib/classes';
import { rawFeedEvents } from '../../../lib/feeds';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function owner(request: Request, locals: any, deviceId: string) {
	const db = locals.runtime?.env?.DB;
	if (!db) return { error: json({ error: 'Server is not fully configured yet.' }, 500) } as const;
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return { error: json({ error: 'Not logged in.' }, 401) } as const;
	const dev = await db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	if (!dev) return { error: json({ error: 'Device not found.' }, 404) } as const;
	let tz = 'UTC';
	try {
		const u = await db.prepare('SELECT timezone FROM users WHERE id = ?').bind(userId).first();
		if (u?.timezone) {
			new Intl.DateTimeFormat('en-US', { timeZone: u.timezone });
			tz = u.timezone;
		}
	} catch {}
	return { db, tz } as const;
}

export async function GET({ request, locals }: any) {
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const events = await rawFeedEvents(o.db, deviceId, o.tz, Date.now());
	const { names, opts } = await loadClasses(o.db, deviceId);
	const codes = classCodes(events);
	// names saved for codes that aren't in the timetable right now are kept too
	for (const [code] of names) if (!codes.some((c) => c.code === code)) codes.push({ code, count: 0, room: '' });
	return json({
		classes: codes.map((c) => ({ ...c, name: names.get(c.code)?.name ?? '', bring: names.get(c.code)?.bring ?? '' })),
		opts,
	});
}

export async function POST({ request, locals }: any) {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const r = await saveClasses(o.db, deviceId, body.classes, body.opts);
	return json({ ok: true, saved: r.rows.length, opts: r.opts });
}
