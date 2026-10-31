// The customise-display page's API: read and save how one device's screen looks
// (layout, font, dark mode, and the Agenda's picture). Everything is checked
// against the logged-in user, so you can only touch your own devices.
import { isStyleId, DEFAULT_STYLE } from '../../../data/calendarStyles';
import { isFamily } from '../../../lib/eink/fonts';
import { b64ToBytes, CORNER_BYTES, cleanSettings } from '../../../lib/eink/image';
export const prerender = false;

const MAX_SRC = 280_000; // characters in the stored photo (a small JPEG data URL)

async function owner(request: Request, locals: any, deviceId: string) {
	const db = locals.runtime?.env?.DB;
	if (!db) return { error: json({ error: 'Server is not fully configured yet.' }, 500) } as const;
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return { error: json({ error: 'Not logged in.' }, 401) } as const;
	const dev = await db.prepare('SELECT id, name, calendar_style, dark_mode, refresh_interval_sec FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	if (!dev) return { error: json({ error: 'Device not found.' }, 404) } as const;
	return { db, userId, dev } as const;
}

export async function GET({ request, locals }) {
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const { db, userId, dev } = o;

	const user = await db.prepare('SELECT calendar_style FROM users WHERE id = ?').bind(userId).first();
	const style = isStyleId(dev.calendar_style) ? dev.calendar_style : isStyleId(user?.calendar_style) ? user.calendar_style : DEFAULT_STYLE;

	let extra: any = {};
	let migrated = true;
	try {
		extra = (await db.prepare('SELECT layout_font, corner_mode, corner_src, corner_cfg, battery_mv, battery_at FROM devices WHERE id = ?').bind(deviceId).first()) ?? {};
	} catch {
		migrated = false; // schema-display.sql hasn't been run yet
	}
	let hasWeather = false;
	try {
		const w = await db.prepare('SELECT weather_lat FROM devices WHERE id = ?').bind(deviceId).first();
		hasWeather = w?.weather_lat !== null && w?.weather_lat !== undefined;
	} catch {}
	let cfg: unknown = null;
	try {
		cfg = extra.corner_cfg ? JSON.parse(extra.corner_cfg) : null;
	} catch {}

	return json(
		{
			migrated,
			name: dev.name || '',
			style,
			dark: dev.dark_mode === 1,
			font: isFamily(extra.layout_font) ? extra.layout_font : null,
			cornerMode: extra.corner_mode === 'image' ? 'image' : 'calendar',
			cornerSrc: extra.corner_src || null,
			cornerCfg: cfg,
			hasWeather,
			batteryMv: extra.battery_mv ?? null,
			batteryAt: extra.battery_at ?? null,
		},
		200
	);
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

	if (body.style !== undefined && !isStyleId(body.style)) return json({ error: 'Unknown layout.' }, 400);
	if (body.font !== undefined && body.font !== null && !isFamily(body.font)) return json({ error: 'Unknown font.' }, 400);
	if (body.dark !== undefined && typeof body.dark !== 'boolean') return json({ error: 'Invalid dark mode value.' }, 400);

	const sets: string[] = [];
	const vals: unknown[] = [];
	if (body.style !== undefined) {
		sets.push('calendar_style = ?');
		vals.push(body.style);
	}
	if (body.dark !== undefined) {
		sets.push('dark_mode = ?');
		vals.push(body.dark ? 1 : 0);
	}
	if (body.font !== undefined) {
		sets.push('layout_font = ?');
		vals.push(body.font);
	}

	const c = body.corner;
	if (c !== undefined) {
		if (c?.mode !== 'calendar' && c?.mode !== 'image') return json({ error: 'Invalid picture option.' }, 400);
		sets.push('corner_mode = ?');
		vals.push(c.mode);
		if (c.mode === 'image') {
			// bits / src / cfg are only sent when the picture itself changed
			if (c.bits !== undefined) {
				const bytes = typeof c.bits === 'string' ? b64ToBytes(c.bits) : null;
				if (!bytes || bytes.length !== CORNER_BYTES) return json({ error: 'That picture is the wrong size.' }, 400);
				sets.push('corner_bits = ?');
				vals.push(c.bits);
			}
			if (c.src !== undefined) {
				if (typeof c.src !== 'string' || !c.src.startsWith('data:image/jpeg;base64,') || c.src.length > MAX_SRC) {
					return json({ error: 'That photo is too large to store. Try a smaller one.' }, 400);
				}
				sets.push('corner_src = ?');
				vals.push(c.src);
			}
			if (c.cfg !== undefined) {
				sets.push('corner_cfg = ?');
				vals.push(JSON.stringify(cleanSettings(c.cfg)));
			}
		}
	}

	if (!sets.length) return json({ ok: true }, 200);
	try {
		await db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, deviceId, o.userId).run();
	} catch {
		return json({ error: 'Display options are not enabled on the server yet (run schema-display.sql).' }, 500);
	}
	return json({ ok: true }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
