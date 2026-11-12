// The layout builder's API: read and save a calendar's designs (Your designs), each with a name.
// Everything is checked against the logged-in user, so you can only touch your own devices.
import { isFamily } from '../../../lib/eink/fonts';
import { sanitizeReminders } from '../../../lib/eink/reminders';
import { cleanSettings } from '../../../lib/eink/image';
import { MAX_JSON, sanitizeLayout } from '../../../lib/eink/builder/model';
import { markSaved } from '../../../lib/screens';
import { refreshShare, shareDesign, sharesForDevice, stopSharing } from '../../../lib/designShare';
import { cleanName, designIdOf, designStyle, getDesign, listDesigns, MAX_DESIGNS, newDesignId } from '../../../lib/designs';
import { isStyleId } from '../../../data/calendarStyles';
import { sanitizeSchedule } from '../../../lib/eink/schedule';
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

export async function GET({ request, locals }: any) {
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
	// Your designs (schema-designs.sql). Which one to open: the one asked for (?design=), else the
	// one on the screen, else the first. ?design=new opens a blank new one.
	const designs = await listDesigns(db, deviceId);
	let designId: string | null = null;
	let designName = '';
	if (designs) {
		const want = new URL(request.url).searchParams.get('design');
		const pick = want === 'new' ? null : designs.find((d) => d.id === want) ?? designs.find((d) => d.id === designIdOf(dev.calendar_style)) ?? designs[0] ?? null;
		designId = pick?.id ?? null;
		designName = pick?.name ?? '';
		custom = pick?.layout ?? null;
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

	let lang = 'en';
	try {
		const lq = await db.prepare('SELECT language FROM devices WHERE id = ?').bind(deviceId).first();
		lang = lq?.language === 'ja' ? 'ja' : 'en';
	} catch {}
	let unit = 'c';
	try {
		const uq = await db.prepare('SELECT temp_unit FROM devices WHERE id = ?').bind(deviceId).first();
		unit = uq?.temp_unit === 'f' ? 'f' : 'c';
	} catch {} // temp_unit comes from schema-screens.sql
	let clock = '24';
	try {
		const cq = await db.prepare('SELECT clock FROM devices WHERE id = ?').bind(deviceId).first();
		clock = cq?.clock === '12' ? '12' : '24';
	} catch {} // schema-clock.sql

	let lat: number | null = null;
	let lon: number | null = null;
	try {
		const w = await db.prepare('SELECT weather_lat, weather_lon FROM devices WHERE id = ?').bind(deviceId).first();
		if (w?.weather_lat !== null && w?.weather_lat !== undefined) {
			lat = w.weather_lat;
			lon = w.weather_lon;
		}
	} catch {}

	let reminders: unknown = [];
	try {
		const rq = await db.prepare('SELECT reminders FROM devices WHERE id = ?').bind(deviceId).first();
		reminders = sanitizeReminders(rq?.reminders);
	} catch {} // schema-reminders.sql
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
		lang,
		unit,
		clock,
		font,
		custom,
		cornerBits,
		cornerSrc,
		cornerCfg,
		lat,
		lon,
		hasWeather: lat !== null,
		countdown,
		reminders,
		tasksGranted,
		devices,
		designs: designs ? designs.map((d) => ({ id: d.id, name: d.name })) : null,
		shares: designs ? await sharesForDevice(db, deviceId) : {},
		designId,
		designName,
		onScreen: designIdOf(dev.calendar_style),
	});
}

export async function POST({ request, locals }: any) {
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

	const now = Math.floor(Date.now() / 1000);
	const designs = await listDesigns(db, deviceId);

	// Share a design (a link anyone can open to copy it), or stop sharing it.
	if (body.action === 'share') {
		if (!designs) return json({ error: 'Not available yet.' }, 400);
		const d = designs.find((x) => x.id === String(body.designId ?? ''));
		if (!d) return json({ error: 'Save the design first.' }, 404);
		if (body.stop === true) {
			await stopSharing(db, d.id);
			return json({ ok: true, token: null });
		}
		let font: string | null = null;
		try {
			const f = await db.prepare('SELECT layout_font FROM devices WHERE id = ?').bind(deviceId).first();
			font = isFamily(f?.layout_font) ? f.layout_font : null;
		} catch {}
		const token = await shareDesign(db, deviceId, d.id, d.name, d.layout, font);
		if (!token) return json({ error: 'Sharing isn\'t set up yet (schema-shared-designs.sql).' }, 500);
		return json({ ok: true, token });
	}

	// Delete a design. If the screen (or the schedule) used it, those go back to the Agenda.
	if (body.action === 'delete') {
		if (!designs) return json({ error: 'Not available yet.' }, 400);
		const id = String(body.designId ?? '');
		if (!designs.some((d) => d.id === id)) return json({ error: 'Design not found.' }, 404);
		await db.prepare('DELETE FROM designs WHERE id = ? AND device_id = ?').bind(id, deviceId).run();
		await stopSharing(db, id);
		const style = designStyle(id);
		if (o.dev.calendar_style === style) await db.prepare("UPDATE devices SET calendar_style = 'agenda' WHERE id = ?").bind(deviceId).run();
		try {
			const r = await db.prepare('SELECT schedule FROM devices WHERE id = ?').bind(deviceId).first();
			if (r?.schedule && String(r.schedule).includes(style)) {
				const sch = sanitizeSchedule(r.schedule, isStyleId);
				sch.slots = sch.slots.filter((x) => x.style !== style);
				sch.cycle = sch.cycle.filter((x) => x !== style);
				await db.prepare('UPDATE devices SET schedule = ? WHERE id = ?').bind(JSON.stringify(sch), deviceId).run();
			}
		} catch {}
		await markSaved(db, deviceId);
		return json({ ok: true });
	}

	const layout = sanitizeLayout(body.custom);
	const text = JSON.stringify(layout);
	if (text.length > MAX_JSON) return json({ error: 'That design is too big to save. Try removing a few widgets.' }, 400);

	// Your designs: save into the named design (or a new one), and put it on the screen if asked.
	let savedId: string | null = null;
	if (designs) {
		const name = cleanName(body.name);
		const existing = typeof body.designId === 'string' && designs.some((d) => d.id === body.designId) ? body.designId : null;
		if (existing) {
			await db.prepare('UPDATE designs SET name = ?, layout = ?, updated_at = ? WHERE id = ? AND device_id = ?').bind(name, text, now, existing, deviceId).run();
			savedId = existing;
			// a shared design's link always shows the latest saved version
			let font: string | null = body.font !== undefined ? body.font : null;
			if (body.font === undefined) {
				try {
					const f = await db.prepare('SELECT layout_font FROM devices WHERE id = ?').bind(deviceId).first();
					font = isFamily(f?.layout_font) ? f.layout_font : null;
				} catch {}
			}
			await refreshShare(db, existing, name, layout, font);
		} else {
			if (designs.length >= MAX_DESIGNS) return json({ error: `You can keep up to ${MAX_DESIGNS} designs. Delete one first.` }, 400);
			savedId = newDesignId();
			await db.prepare('INSERT INTO designs (id, device_id, name, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(savedId, deviceId, name, text, now, now).run();
		}
	}

	const sets: string[] = [];
	const vals: unknown[] = [];
	if (!designs) {
		sets.push('custom_layout = ?');
		vals.push(text);
	}
	if (body.activate === true) {
		sets.push('calendar_style = ?');
		vals.push(savedId ? designStyle(savedId) : 'custom');
	}
	if (body.font !== undefined) {
		sets.push('layout_font = ?');
		vals.push(body.font);
	}
	if (body.dark !== undefined) {
		sets.push('dark_mode = ?');
		vals.push(body.dark ? 1 : 0);
	}
	if (sets.length) {
		try {
			await db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, deviceId, o.userId).run();
		} catch {
			return json({ error: 'The layout builder is not enabled on the server yet (run schema-builder.sql).' }, 500);
		}
	}
	await markSaved(db, deviceId);
	return json({ ok: true, widgets: layout.widgets.length, designId: savedId });
}
