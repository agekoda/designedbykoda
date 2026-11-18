// A calendar's extra calendars: school timetables (Compass, SEQTA) and other .ics links or files,
// shown alongside its Google calendars. Two tables, made the first time someone adds one (so no
// migration to run):
//   device_feeds: which links / files each calendar has
//   ics_cache:    the events read from each, so a link is fetched at most every few hours rather
//                 than on every wake. An uploaded file is read once, when it is uploaded.
import { cleanFeedUrl, looksLikeIcs, parseIcs, type IcsEvent } from './ics';

export const MAX_FEEDS = 4;
export const MAX_FEED_NAME = 30;
const LINK_TTL = 3 * 3600; // seconds before a link is read again
const RETRY_TTL = 30 * 60; // after a failed read
const AHEAD_DAYS = 60; // how far ahead a link's events are kept
const FILE_AHEAD_DAYS = 400; // and a file's (it isn't read again)
const MAX_BYTES = 4_000_000;

export interface Feed {
	id: string;
	name: string;
	url: string | null; // null = an uploaded file
	createdAt: number;
}
export interface FeedStatus {
	id: string;
	name: string;
	kind: 'link' | 'file';
	host: string | null;
	count: number; // events coming up
	next: { title: string; ms: number; allDay: boolean } | null;
	error: string | null;
	checkedAt: number | null;
}

export async function ensureTables(db: any) {
	await db.batch([
		db.prepare('CREATE TABLE IF NOT EXISTS device_feeds (device_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT, url TEXT, created_at INTEGER, PRIMARY KEY (device_id, id))'),
		db.prepare('CREATE TABLE IF NOT EXISTS ics_cache (key TEXT PRIMARY KEY, fetched_at INTEGER, events TEXT, error TEXT)'),
	]);
}

export async function listFeeds(db: any, deviceId: string): Promise<Feed[]> {
	try {
		const r = await db.prepare('SELECT id, name, url, created_at FROM device_feeds WHERE device_id = ? ORDER BY created_at').bind(deviceId).all();
		return (r.results ?? []).map((x: any) => ({ id: x.id, name: x.name || 'Calendar', url: x.url ?? null, createdAt: x.created_at ?? 0 }));
	} catch {
		return []; // no feeds have ever been added
	}
}

async function sha(s: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(d).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Bump PARSER when ics.ts changes how events are read, so saved copies of links are read again at once.
const PARSER = 4;
const keyFor = async (deviceId: string, f: Feed, tz: string) => (f.url ? 'u:' + (await sha(f.url + '|' + tz + '|' + PARSER)) : `f:${deviceId}:${f.id}`);

// Events are stored small: [title, start ms, all-day 0/1, date, end ms, end date]
type Packed = [string, number, number, string | null, number | null, string | null];
const pack = (e: IcsEvent): Packed => [e.title, e.ms, e.allDay ? 1 : 0, e.dateOnly ?? null, e.endMs ?? null, e.endDateOnly ?? null];
const unpack = (p: Packed): IcsEvent => ({ title: p[0], ms: p[1], allDay: p[2] === 1, dateOnly: p[3] ?? undefined, endMs: p[4] ?? undefined, endDateOnly: p[5] ?? undefined });

// Reads a link. Returns the events, or a sentence saying what went wrong.
export async function fetchFeed(url: string, tz: string, nowMs: number): Promise<{ events: IcsEvent[] } | { error: string }> {
	let res: Response;
	try {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), 9000);
		res = await fetch(url, { headers: { Accept: 'text/calendar, */*', 'User-Agent': 'designedbykoda-calendar/1.0' }, signal: ctl.signal, redirect: 'follow' });
		clearTimeout(timer);
	} catch {
		return { error: 'The link didn’t answer.' };
	}
	if (res.status === 401 || res.status === 403) return { error: 'The link says it needs a password. Copy the private calendar link instead.' };
	if (res.status === 404) return { error: 'The link doesn’t exist any more. It may have been reset: copy a new one.' };
	if (!res.ok) return { error: `The link gave an error (${res.status}).` };
	const len = Number(res.headers.get('content-length') || 0);
	if (len > MAX_BYTES) return { error: 'That calendar is too big to read.' };
	const text = await res.text();
	if (text.length > MAX_BYTES) return { error: 'That calendar is too big to read.' };
	if (!looksLikeIcs(text)) return { error: 'That link opens a web page, not a calendar. Copy the calendar (iCal) link.' };
	return { events: parseIcs(text, tz, nowMs - 86400000, nowMs + AHEAD_DAYS * 86400000) };
}

export function parseFile(text: string, tz: string, nowMs: number): { events: IcsEvent[] } | { error: string } {
	if (text.length > MAX_BYTES) return { error: 'That file is too big.' };
	if (!looksLikeIcs(text)) return { error: 'That isn’t a calendar file. It should end in .ics.' };
	const events = parseIcs(text, tz, nowMs - 86400000, nowMs + FILE_AHEAD_DAYS * 86400000, 3000);
	return { events };
}

async function save(db: any, key: string, events: IcsEvent[] | null, error: string | null, now: number, keepOld = false) {
	try {
		if (events) await db.prepare('INSERT OR REPLACE INTO ics_cache (key, fetched_at, events, error) VALUES (?, ?, ?, NULL)').bind(key, now, JSON.stringify(events.map(pack))).run();
		else if (keepOld) await db.prepare('INSERT INTO ics_cache (key, fetched_at, events, error) VALUES (?, ?, NULL, ?) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, error = excluded.error').bind(key, now, error).run();
	} catch {}
}

// Saves events just read (a new link, or an uploaded file).
export async function storeEvents(db: any, deviceId: string, f: Feed, tz: string, events: IcsEvent[], now: number) {
	await save(db, await keyFor(deviceId, f, f.url ? tz : ''), events, null, now);
}

async function cached(db: any, key: string): Promise<{ at: number; events: IcsEvent[] | null; error: string | null } | null> {
	try {
		const r = await db.prepare('SELECT fetched_at, events, error FROM ics_cache WHERE key = ?').bind(key).first();
		if (!r) return null;
		let events: IcsEvent[] | null = null;
		try {
			events = r.events ? (JSON.parse(r.events) as Packed[]).map(unpack) : null;
		} catch {}
		return { at: r.fetched_at ?? 0, events, error: r.error ?? null };
	} catch {
		return null;
	}
}

// One feed's events, reading the link again when the copy we have is old.
export async function feedEvents(db: any, deviceId: string, f: Feed, tz: string, nowMs: number, force = false): Promise<{ events: IcsEvent[]; error: string | null; at: number | null }> {
	const now = Math.floor(nowMs / 1000);
	const key = await keyFor(deviceId, f, f.url ? tz : '');
	const c = await cached(db, key);
	if (!f.url) return { events: c?.events ?? [], error: c ? null : 'The file needs uploading again.', at: c?.at ?? null };
	const fresh = c && now - c.at < (c.error ? RETRY_TTL : LINK_TTL);
	if (fresh && !force) return { events: c!.events ?? [], error: c!.error, at: c!.at };
	const r = await fetchFeed(f.url, tz, nowMs);
	if ('events' in r) {
		await save(db, key, r.events, null, now);
		return { events: r.events, error: null, at: now };
	}
	// keep showing what we had last time, and try again a little later
	await save(db, key, null, r.error, now, true);
	return { events: c?.events ?? [], error: r.error, at: c?.at ?? null };
}

// Everything from all of a calendar's feeds, from `fromMs` on, in the shape today.ts collects
// Google's events in.
export async function allFeedEvents(db: any, deviceId: string, tz: string, nowMs: number, fromMs: number) {
	const feeds = await listFeeds(db, deviceId);
	if (!feeds.length) return [];
	const lists = await Promise.all(feeds.map((f) => feedEvents(db, deviceId, f, tz, nowMs).catch(() => ({ events: [] as IcsEvent[] }))));
	const out: { title: string; ms: number; allDay: boolean; dateOnly?: string; endMs?: number; endDateOnly?: string }[] = [];
	for (const l of lists)
		for (const e of l.events) {
			const end = e.allDay ? (e.endDateOnly ? Date.parse(e.endDateOnly + 'T00:00:00Z') : e.ms + 86400000) : e.endMs ?? e.ms;
			if (Math.max(end, e.ms + 1) <= fromMs) continue; // already over (ones still going count, as with Google)
			out.push(e);
		}
	out.sort((a, b) => a.ms - b.ms);
	return out.slice(0, 30);
}

export async function statusOf(db: any, deviceId: string, f: Feed, tz: string, nowMs: number, force = false): Promise<FeedStatus> {
	const r = await feedEvents(db, deviceId, f, tz, nowMs, force);
	const upcoming = r.events.filter((e) => (e.allDay ? Date.parse((e.endDateOnly ?? e.dateOnly) + 'T00:00:00Z') > nowMs : e.ms >= nowMs));
	let host: string | null = null;
	if (f.url) {
		try {
			host = new URL(f.url).hostname;
		} catch {}
	}
	const n = upcoming[0];
	return { id: f.id, name: f.name, kind: f.url ? 'link' : 'file', host, count: upcoming.length, next: n ? { title: n.title, ms: n.ms, allDay: n.allDay } : null, error: r.error, checkedAt: r.at };
}

export { cleanFeedUrl };
