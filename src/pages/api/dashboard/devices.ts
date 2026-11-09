// The logged-in user's paired devices: list them, and edit one device's
// name / layout / calendars. Everything is checked against the session's
// user, so you can only ever see or change your own devices.
import { sanitizeSchedule, activeStyle } from '../../../lib/eink/schedule';
import { sanitizeReminders } from '../../../lib/eink/reminders';
import { sanitizeCfg, utcOffset } from '../../../lib/messages';
import { listDesigns } from '../../../lib/designs';
import { isStyleId, DEFAULT_STYLE } from '../../../data/calendarStyles';
import { sanitizeLayout, sanitizeSign } from '../../../lib/eink/builder/model';
import { cornerPlain } from '../../../lib/eink/image';
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
			extra.set(e.id, { batteryMv: e.battery_mv ?? null, batteryAt: e.battery_at ?? null, font: e.layout_font ?? null, cornerMode: e.corner_mode === 'image' ? 'image' : 'calendar', cornerBits: e.corner_mode === 'image' ? cornerPlain(e.corner_bits) : null });
		}
	} catch {}

	// Photo frame picture and Countdown, from schema-layouts.sql (separate query, so a missing column changes nothing else).
	const more = new Map<string, { frameBits: string | null; countdown: { title: string; date: string } | null }>();
	try {
		const mr = await db.prepare('SELECT id, frame_bits, countdown_title, countdown_date FROM devices WHERE user_id = ?').bind(userId).all();
		for (const e of mr.results ?? []) more.set(e.id, { frameBits: e.frame_bits ?? null, countdown: e.countdown_title && e.countdown_date ? { title: e.countdown_title, date: e.countdown_date } : null });
	} catch {}

	// Each device's own design from the layout builder (schema-builder.sql, its own query for the same reason).
	const customs = new Map<string, unknown>();
	try {
		const cr = await db.prepare('SELECT id, custom_layout FROM devices WHERE user_id = ? AND custom_layout IS NOT NULL').bind(userId).all();
		for (const e of cr.results ?? []) customs.set(e.id, sanitizeLayout(e.custom_layout));
	} catch {}

	// When it was (last) paired, from schema-paired-at.sql. Falls back to the
	// row's creation date for devices paired before that column existed.
	const pairedAt = new Map<string, number>();
	try {
		const pr = await db.prepare('SELECT id, paired_at FROM devices WHERE user_id = ? AND paired_at IS NOT NULL').bind(userId).all();
		for (const r of pr.results ?? []) pairedAt.set(r.id, r.paired_at);
	} catch {}

	// Schedule, °C/°F, what's on screen now and battery history, from schema-screens.sql (own query, same reason).
	const scr = new Map<string, { sign: unknown; schedule: any; unit: string; shownStyle: string | null; anchorMv: number | null; anchorAt: number | null; override: string | null }>();
	let tz: string | null = null;
	try {
		tz = ((await db.prepare('SELECT timezone FROM users WHERE id = ?').bind(userId).first()) as any)?.timezone ?? null;
	} catch {}
	const nowUnix = Math.floor(Date.now() / 1000);
	const nowLocal = nowUnix + utcOffset(tz);
	try {
		const sr = await db.prepare('SELECT id, schedule, temp_unit, shown_style, battery_anchor_mv, battery_anchor_at, sign_cfg, screen_override, override_until FROM devices WHERE user_id = ?').bind(userId).all();
		for (const e of sr.results ?? [])
			scr.set(e.id, {
				sign: sanitizeSign(e.sign_cfg),
				schedule: sanitizeSchedule(e.schedule, isStyleId),
				unit: e.temp_unit === 'f' ? 'f' : 'c',
				shownStyle: isStyleId(e.shown_style) ? e.shown_style : null,
				anchorMv: e.battery_anchor_mv ?? null,
				anchorAt: e.battery_anchor_at ?? null,
				// a screen picked with the button, still showing (until the schedule changes, or the next press)
				override: isStyleId(e.screen_override) && (e.override_until == null || e.override_until > nowUnix) ? e.screen_override : null,
			});
	} catch {}

	// Message board (schema-messages.sql): how often each checks, and how many messages are showing.
	const msg = new Map<string, { check: number; count: number }>();
	try {
		const nowS = Math.floor(Date.now() / 1000);
		const mr = await db
			.prepare('SELECT d.id, d.msg_cfg, (SELECT COUNT(*) FROM messages m WHERE m.device_id = d.id AND m.removed = 0 AND (m.expires_at IS NULL OR m.expires_at > ?)) AS n FROM devices d WHERE d.user_id = ?')
			.bind(nowS, userId)
			.all();
		for (const e of mr.results ?? []) msg.set(e.id, { check: sanitizeCfg(e.msg_cfg).check, count: e.n ?? 0 });
	} catch {}

	// Repeating reminders (schema-reminders.sql), for the previews.
	const rems = new Map<string, unknown>();
	try {
		const rr = await db.prepare('SELECT id, reminders FROM devices WHERE user_id = ?').bind(userId).all();
		for (const e of rr.results ?? []) rems.set(e.id, sanitizeReminders(e.reminders));
	} catch {}

	// Your designs and when each calendar next wakes (schema-designs.sql / schema-screens.sql).
	const designsOf = new Map<string, unknown>();
	for (const d of rows.results ?? []) designsOf.set(d.id, (await listDesigns(db, d.id))?.map((x) => ({ id: x.id, name: x.name, layout: x.layout })) ?? null);
	const wake = new Map<string, number>();
	try {
		const wr = await db.prepare('SELECT id, next_wake_at FROM devices WHERE user_id = ? AND next_wake_at IS NOT NULL').bind(userId).all();
		for (const w of wr.results ?? []) wake.set(w.id, w.next_wake_at);
	} catch {}

	const devices = (rows.results ?? []).map((d: any) => {
		const style = isStyleId(d.calendar_style) ? d.calendar_style : isStyleId(user?.calendar_style) ? user.calendar_style : DEFAULT_STYLE;
		const s = scr.get(d.id);
		// what the next update will show: a button pick, else the schedule, else the main screen
		const nextStyle = s?.override ?? (s?.schedule ? activeStyle(s.schedule, style, nowLocal) : style);
		return {
		id: d.id,
		name: d.name || '',
		style,
		nextStyle,
		reminders: rems.get(d.id) ?? [],
		calendarIds: parseIds(d.selected_calendar_ids) ?? parseIds(user?.selected_calendar_ids) ?? [],
		lastSeenAt: d.last_seen_at ?? null,
		createdAt: pairedAt.get(d.id) ?? d.created_at ?? null,
		refreshIntervalSec: d.refresh_interval_sec || 86400,
		location: locs.get(d.id) ?? null,
		dark: dark.has(d.id),
		batteryMv: extra.get(d.id)?.batteryMv ?? null,
		batteryAt: extra.get(d.id)?.batteryAt ?? null,
		font: extra.get(d.id)?.font ?? null,
		cornerMode: extra.get(d.id)?.cornerMode ?? 'calendar',
		cornerBits: extra.get(d.id)?.cornerBits ?? null,
		frameBits: more.get(d.id)?.frameBits ?? null,
		countdown: more.get(d.id)?.countdown ?? null,
		custom: customs.get(d.id) ?? null,
		schedule: scr.get(d.id)?.schedule ?? null,
		sign: scr.get(d.id)?.sign ?? null,
		msgCheck: msg.get(d.id)?.check ?? 0,
		msgCount: msg.get(d.id)?.count ?? 0,
		designs: designsOf.get(d.id) ?? null,
		nextWakeAt: wake.get(d.id) ?? null,
		unit: scr.get(d.id)?.unit ?? 'c',
		shownStyle: scr.get(d.id)?.shownStyle ?? null,
		batteryAnchorMv: scr.get(d.id)?.anchorMv ?? null,
		batteryAnchorAt: scr.get(d.id)?.anchorAt ?? null,
		};
	});
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
