// A calendar's extra calendars (school timetables and other .ics links or files): list, add a
// link, upload a file, remove. Only the owner of the calendar can touch them. Links are never sent
// back to the browser in full (they're private), only the website they're on.
import { MAX_FEEDS, MAX_FEED_NAME, cleanFeedUrl, ensureTables, fetchFeed, listFeeds, setFeedOff, parseFile, statusOf, storeEvents, type Feed } from '../../../lib/feeds';
import { cleanText } from '../../../lib/eink/draw';
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
	return { db, userId, tz } as const;
}

const cleanName = (v: unknown, fallback: string) => {
	const s = typeof v === 'string' ? cleanText(v, true).replace(/\s+/g, ' ').trim().slice(0, MAX_FEED_NAME) : '';
	return s || fallback;
};
const newId = () => 'f' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export async function GET({ request, locals }: any) {
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const now = Date.now();
	const feeds = await listFeeds(o.db, deviceId);
	const out = await Promise.all(feeds.map((f) => statusOf(o.db, deviceId, f, o.tz, now)));
	return json({ feeds: out, max: MAX_FEEDS });
}

export async function POST({ request, locals }: any) {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'That file is too big, or the request was cut off.' }, 400);
	}
	const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const { db, tz } = o;
	const now = Date.now();
	const action = body.action;

	if (action === 'remove') {
		const id = String(body.id ?? '');
		try {
			await db.prepare('DELETE FROM device_feeds WHERE device_id = ? AND id = ?').bind(deviceId, id).run();
			await db.prepare('DELETE FROM ics_cache WHERE key = ?').bind(`f:${deviceId}:${id}`).run();
		} catch {}
		return json({ ok: true });
	}

	if (action === 'switch') {
		const id = String(body.id ?? '');
		if (!(await listFeeds(db, deviceId)).some((x) => x.id === id)) return json({ error: 'That calendar isn’t there any more.' }, 404);
		try {
			await setFeedOff(db, deviceId, id, body.on === false);
		} catch {
			return json({ error: 'Could not save that.' }, 500);
		}
		return json({ ok: true });
	}

	if (action === 'refresh') {
		const f = (await listFeeds(db, deviceId)).find((x) => x.id === body.id);
		if (!f) return json({ error: 'That calendar isn’t there any more.' }, 404);
		return json({ ok: true, feed: await statusOf(db, deviceId, f, tz, now, true) });
	}

	if (action !== 'link' && action !== 'file') return json({ error: 'Invalid request.' }, 400);
	await ensureTables(db);
	const have = await listFeeds(db, deviceId);
	if (have.length >= MAX_FEEDS) return json({ error: `A calendar can have up to ${MAX_FEEDS} of these. Remove one first.` }, 400);

	if (action === 'link') {
		const url = cleanFeedUrl(body.url);
		if (!url) return json({ error: 'That doesn’t look like a link. Paste the whole calendar link.' }, 400);
		if (have.some((f) => f.url === url)) return json({ error: 'That calendar is already added.' }, 400);
		// read it now, so a wrong link is caught here rather than on the screen
		const r = await fetchFeed(url, tz, now);
		if ('error' in r) return json({ error: r.error }, 400);
		const f: Feed = { id: newId(), name: cleanName(body.name, guessName(url)), url, createdAt: Math.floor(now / 1000) };
		await db.prepare('INSERT INTO device_feeds (device_id, id, name, url, created_at) VALUES (?, ?, ?, ?, ?)').bind(deviceId, f.id, f.name, f.url, f.createdAt).run();
		await storeEvents(db, deviceId, f, tz, r.events, f.createdAt);
		return json({ ok: true, feed: await statusOf(db, deviceId, f, tz, now) });
	}

	// an uploaded .ics file: read once, now
	const text = typeof body.ics === 'string' ? body.ics : '';
	const r = parseFile(text, tz, now);
	if ('error' in r) return json({ error: r.error }, 400);
	if (!r.events.length) return json({ error: 'That file has nothing in it from today on.' }, 400);
	const f: Feed = { id: newId(), name: cleanName(body.name, 'Timetable'), url: null, createdAt: Math.floor(now / 1000) };
	await db.prepare('INSERT INTO device_feeds (device_id, id, name, url, created_at) VALUES (?, ?, ?, NULL, ?)').bind(deviceId, f.id, f.name, f.createdAt).run();
	await storeEvents(db, deviceId, f, tz, r.events, f.createdAt);
	return json({ ok: true, feed: await statusOf(db, deviceId, f, tz, now) });
}

function guessName(url: string): string {
	try {
		const h = new URL(url).hostname;
		if (h.includes('compass.education')) return 'Compass';
		if (h.includes('seqta')) return 'SEQTA';
		if (h.includes('outlook') || h.includes('office365') || h.includes('live.com')) return 'Outlook';
		if (h.includes('icloud')) return 'iCloud';
	} catch {}
	return 'Calendar';
}
