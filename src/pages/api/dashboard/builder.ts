// The layout builder's API: read and save a device's own design ("Your own design").
// Everything is checked against the logged-in user, so you can only touch your own devices.
import { isFamily } from '../../../lib/eink/fonts';
import { cleanSettings } from '../../../lib/eink/image';
import { MAX_JSON, sanitizeLayout } from '../../../lib/eink/builder/model';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function owner(request: Request, locals: any, deviceId: string) {
	const db = locals.runtime?.env?.DB;
	if (!db) return { error: json({ error: 'Server is not fully configured yet.' }, 500) } as const;
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return { error: json({ error: 'Not logged in.' }, 401) } as const;
	const dev = await db.prepare('SELECT id, name, calendar_style, dark_mode FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	if (!dev) return { error: json({ error: 'Device not found.' }, 404) } as const;
	return { db, userId, dev } as const;
}

export async function GET({ request, locals }) {
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const { db, userId, dev } = o;

	let custom = null;
	let migrated = true;
	try {
		const r = await db.prepare('SELECT custom_layout FROM devices WHERE id = ?').bind(deviceId).first();
		custom = r?.custom_layout ? sanitizeLayout(r.custom_layout) : null;
	} catch {
		migrated = false; // schema-builder.sql hasn't been run yet
	}

	let font: string | null = null;
	let cornerBits: string | null = null;
	let cornerSrc: string | null = null;
	let cornerCfg: unknown = null;
	try {
		const x = await db.prepare("SELECT layout_font, CASE WHEN corner_mode = 'image' THEN corner_bits END AS bits, CASE WHEN corner_mode = 'image' THEN corner_src END AS src, CASE WHEN corner_mode = 'image' THEN corner_cfg END AS cfg FROM devices WHERE id = ?").bind(deviceId).first();
		font = isFamily(x?.layout_font) ? x.layout_font : null;
		cornerBits = x?.bits || null;
		cornerSrc = x?.src || null;
		try {
			cornerCfg = x?.cfg ? cleanSettings(JSON.parse(x.cfg)) : null;
		} catch {}
	} catch {}

	let lat: number | null = null;
	let lon: number | null = null;
	try {
		const w = await db.prepare('SELECT weather_lat, weather_lon FROM devices WHERE id = ?').bind(deviceId).first();
		if (w?.weather_lat !== null && w?.weather_lat !== undefined) {
			lat = w.weather_lat;
			lon = w.weather_lon;
		}
	} catch {}

	let countdown: { title: string; date: string } | null = null;
	try {
		const x = await db.prepare('SELECT countdown_title, countdown_date FROM devices WHERE id = ?').bind(deviceId).first();
		if (x?.countdown_title && x?.countdown_date) countdown = { title: x.countdown_title, date: x.countdown_date };
	} catch {}

	let tasksGranted = false;
	try {
		const u = await db.prepare('SELECT tasks_granted FROM users WHERE id = ?').bind(userId).first();
		tasksGranted = u?.tasks_granted === 1;
	} catch {}

	let devices: { id: string; name: string }[] = [];
	try {
		const r = await db.prepare('SELECT id, name FROM devices WHERE user_id = ? ORDER BY created_at').bind(userId).all();
		devices = (r.results ?? []).map((d: any) => ({ id: d.id, name: d.name || '' }));
	} catch {}

	return json({
		migrated,
		name: dev.name || '',
		style: dev.calendar_style || null,
		dark: dev.dark_mode === 1,
		font,
		custom,
		cornerBits,
		cornerSrc,
		cornerCfg,
		lat,
		lon,
		hasWeather: lat !== null,
		countdown,
		tasksGranted,
		devices,
	});
}

export async function POST({ request, locals }) {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const { db } = o;

	if (body.font !== undefined && body.font !== null && !isFamily(body.font)) return json({ error: 'Unknown font.' }, 400);
	if (body.dark !== undefined && typeof body.dark !== 'boolean') return json({ error: 'Invalid dark mode value.' }, 400);

	const layout = sanitizeLayout(body.custom);
	const text = JSON.stringify(layout);
	if (text.length > MAX_JSON) return json({ error: 'That design is too big to save. Try removing a few widgets.' }, 400);

	const sets = ['custom_layout = ?'];
	const vals: unknown[] = [text];
	if (body.activate === true) {
		sets.push('calendar_style = ?');
		vals.push('custom');
	}
	if (body.font !== undefined) {
		sets.push('layout_font = ?');
		vals.push(body.font);
	}
	if (body.dark !== undefined) {
		sets.push('dark_mode = ?');
		vals.push(body.dark ? 1 : 0);
	}
	try {
		await db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, deviceId, o.userId).run();
	} catch {
		return json({ error: 'The layout builder is not enabled on the server yet (run schema-builder.sql).' }, 500);
	}
	return json({ ok: true, widgets: layout.widgets.length });
}
