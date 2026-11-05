// The customise-display page's API: read and save how one device's screen looks
// (layout, font, dark mode, and the Agenda's picture). Everything is checked
// against the logged-in user, so you can only touch your own devices.
import { isStyleId, isRefreshSec, DEFAULT_STYLE } from '../../../data/calendarStyles';
import { isFamily } from '../../../lib/eink/fonts';
import { b64ToBytes, decodePic, FRAME_BYTES, cleanSettings } from '../../../lib/eink/image';
import { toAscii } from '../../../lib/eink/draw';
import { sanitizeLayout } from '../../../lib/eink/builder/model';
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

	// Layout extras from schema-layouts.sql: where the calendar is (Moon & Sun), the Countdown, the
	// Photo frame picture, and whether Google Tasks is connected (To-do). Missing columns mean "not set".
	let lat: number | null = null;
	let lon: number | null = null;
	let countdown: { title: string; date: string } | null = null;
	let frameSrc: string | null = null;
	let frameCfg: unknown = null;
	let tasksGranted = false;
	try {
		const w = await db.prepare('SELECT weather_lat, weather_lon FROM devices WHERE id = ?').bind(deviceId).first();
		if (w?.weather_lat !== null && w?.weather_lat !== undefined) {
			lat = w.weather_lat;
			lon = w.weather_lon;
		}
	} catch {}
	try {
		const x = await db.prepare('SELECT countdown_title, countdown_date, frame_src, frame_cfg FROM devices WHERE id = ?').bind(deviceId).first();
		if (x?.countdown_title && x?.countdown_date) countdown = { title: x.countdown_title, date: x.countdown_date };
		frameSrc = x?.frame_src || null;
		frameCfg = x?.frame_cfg ? JSON.parse(x.frame_cfg) : null;
	} catch {}
	try {
		const u = await db.prepare('SELECT tasks_granted FROM users WHERE id = ?').bind(userId).first();
		tasksGranted = u?.tasks_granted === 1;
	} catch {}

	let custom: unknown = null;
	try {
		const c = await db.prepare('SELECT custom_layout FROM devices WHERE id = ?').bind(deviceId).first();
		custom = c?.custom_layout ? sanitizeLayout(JSON.parse(c.custom_layout)) : null;
	} catch {}

	return json(
		{
			migrated,
			custom,
			name: dev.name || '',
			style,
			dark: dev.dark_mode === 1,
			refreshSec: isRefreshSec(dev.refresh_interval_sec) ? dev.refresh_interval_sec : 86400,
			font: isFamily(extra.layout_font) ? extra.layout_font : null,
			cornerMode: extra.corner_mode === 'image' ? 'image' : 'calendar',
			cornerSrc: extra.corner_src || null,
			cornerCfg: cfg,
			hasWeather,
			lat,
			lon,
			countdown,
			frameSrc,
			frameCfg,
			tasksGranted,
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
	if (body.refreshSec !== undefined && !isRefreshSec(body.refreshSec)) return json({ error: 'Unknown refresh option.' }, 400);
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
	if (body.refreshSec !== undefined) {
		sets.push('refresh_interval_sec = ?');
		vals.push(body.refreshSec);
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
				if (!decodePic(c.bits)) return json({ error: 'That picture is the wrong size.' }, 400);
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

	// Countdown: a name and a date.
	const cd = body.countdown;
	if (cd !== undefined) {
		const title = typeof cd?.title === 'string' ? toAscii(cd.title, true).slice(0, 40) : '';
		const date = typeof cd?.date === 'string' ? cd.date : '';
		if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')))) return json({ error: 'That date is not valid.' }, 400);
		sets.push('countdown_title = ?', 'countdown_date = ?');
		vals.push(title || null, date || null);
	}

	// Photo frame picture (full screen).
	const fr = body.frame;
	if (fr !== undefined) {
		if (fr.bits !== undefined) {
			const bytes = typeof fr.bits === 'string' ? b64ToBytes(fr.bits) : null;
			if (!bytes || bytes.length !== FRAME_BYTES) return json({ error: 'That picture is the wrong size.' }, 400);
			sets.push('frame_bits = ?');
			vals.push(fr.bits);
		}
		if (fr.src !== undefined) {
			if (typeof fr.src !== 'string' || !fr.src.startsWith('data:image/jpeg;base64,') || fr.src.length > MAX_SRC) {
				return json({ error: 'That photo is too large to store. Try a smaller one.' }, 400);
			}
			sets.push('frame_src = ?');
			vals.push(fr.src);
		}
		if (fr.cfg !== undefined) {
			sets.push('frame_cfg = ?');
			vals.push(JSON.stringify(cleanSettings(fr.cfg)));
		}
	}

	if (!sets.length) return json({ ok: true }, 200);
	try {
		await db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, deviceId, o.userId).run();
	} catch {
		return json({ error: 'Display options are not enabled on the server yet (run schema-display.sql and schema-layouts.sql).' }, 500);
	}
	return json({ ok: true }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
