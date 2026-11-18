// Calendars from outside Google: a school timetable (Compass, SEQTA), Outlook, iCloud, or any
// .ics link or file. Small, dependency-free iCalendar reader: events, all-day events, time zones
// (IANA names, Windows names, UTC, floating), and the repeat rules calendars really use (daily,
// weekly, monthly, yearly; INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH; EXDATE; moved
// single instances via RECURRENCE-ID). Repeats are expanded only inside the window asked for.

export interface IcsEvent {
	title: string;
	ms: number; // the start, as a real instant (all-day: that date's midnight UTC)
	allDay: boolean;
	dateOnly?: string; // all-day: YYYY-MM-DD
	endMs?: number;
	endDateOnly?: string; // all-day: the day after the last day
}

// ---- time zones ----
const WINDOWS_TZ: Record<string, string> = {
	'W. Australia Standard Time': 'Australia/Perth',
	'AUS Eastern Standard Time': 'Australia/Sydney',
	'E. Australia Standard Time': 'Australia/Brisbane',
	'Cen. Australia Standard Time': 'Australia/Adelaide',
	'AUS Central Standard Time': 'Australia/Darwin',
	'Tasmania Standard Time': 'Australia/Hobart',
	'New Zealand Standard Time': 'Pacific/Auckland',
	'GMT Standard Time': 'Europe/London',
	'W. Europe Standard Time': 'Europe/Berlin',
	'Romance Standard Time': 'Europe/Paris',
	'Central Europe Standard Time': 'Europe/Budapest',
	'Pacific Standard Time': 'America/Los_Angeles',
	'Mountain Standard Time': 'America/Denver',
	'Central Standard Time': 'America/Chicago',
	'Eastern Standard Time': 'America/New_York',
	'Tokyo Standard Time': 'Asia/Tokyo',
	'Singapore Standard Time': 'Asia/Singapore',
	'China Standard Time': 'Asia/Shanghai',
	'India Standard Time': 'Asia/Kolkata',
	'UTC': 'UTC',
};
const tzOk = new Map<string, boolean>();
function validTz(tz: string): boolean {
	let ok = tzOk.get(tz);
	if (ok === undefined) {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: tz });
			ok = true;
		} catch {
			ok = false;
		}
		tzOk.set(tz, ok);
	}
	return ok;
}
function resolveTz(tzid: string | undefined, fallback: string): string {
	if (!tzid) return fallback;
	let t = tzid.replace(/^"|"$/g, '').trim();
	if (WINDOWS_TZ[t]) return WINDOWS_TZ[t];
	t = t.replace(/^\/+/, '');
	if (validTz(t)) return t;
	// "/mozilla.org/20050126_1/Australia/Perth" and the like: try the last two parts
	const parts = t.split('/');
	if (parts.length > 2) {
		const tail = parts.slice(-2).join('/');
		if (validTz(tail)) return tail;
	}
	return fallback;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function offsetSec(tz: string, ms: number): number {
	if (tz === 'UTC') return 0;
	let f = fmtCache.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
		fmtCache.set(tz, f);
	}
	const p: Record<string, string> = {};
	for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
	return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / 1000);
}
// A wall-clock time in a zone (given as if it were UTC) to the real instant.
function localToMs(localAsUtcMs: number, tz: string): number {
	if (tz === 'UTC') return localAsUtcMs;
	let ms = localAsUtcMs - offsetSec(tz, localAsUtcMs) * 1000;
	ms = localAsUtcMs - offsetSec(tz, ms) * 1000; // again, in case a daylight-saving change sits between
	return ms;
}

// ---- reading the text ----
interface Prop {
	name: string;
	params: Record<string, string>;
	value: string;
}
function parseLine(line: string): Prop | null {
	let i = 0;
	let inQ = false;
	for (; i < line.length; i++) {
		const c = line[i];
		if (c === '"') inQ = !inQ;
		else if (c === ':' && !inQ) break;
	}
	if (i >= line.length) return null;
	const head = line.slice(0, i);
	const value = line.slice(i + 1);
	const bits = head.split(';');
	const params: Record<string, string> = {};
	for (const b of bits.slice(1)) {
		const eq = b.indexOf('=');
		if (eq > 0) params[b.slice(0, eq).toUpperCase()] = b.slice(eq + 1);
	}
	return { name: bits[0].toUpperCase(), params, value };
}
const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();

// A DTSTART-style value: all-day, or a wall-clock time (as if UTC) plus the zone it's in.
interface When {
	allDay: boolean;
	local: number; // ms, wall-clock read as UTC (all-day: midnight)
	tz: string; // 'UTC' for ...Z values
}
function parseWhen(p: Prop, fallbackTz: string): When | null {
	const v = p.value.trim();
	let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
	if (m || p.params.VALUE === 'DATE') {
		m = m ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
		if (!m) return null;
		return { allDay: true, local: Date.UTC(+m[1], +m[2] - 1, +m[3]), tz: 'UTC' };
	}
	m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
	if (!m) return null;
	const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
	return { allDay: false, local, tz: m[7] ? 'UTC' : resolveTz(p.params.TZID, fallbackTz) };
}
const whenMs = (w: When) => (w.allDay ? w.local : localToMs(w.local, w.tz));

function parseDuration(s: string): number | null {
	const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim());
	if (!m) return null;
	const sec = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0);
	return (m[1] === '-' ? -1 : 1) * sec * 1000;
}

interface RawEvent {
	uid: string;
	title: string;
	start: When;
	end: When | null;
	durMs: number | null;
	rrule: Record<string, string> | null;
	exdates: number[]; // instants (ms)
	recurrenceId: number | null;
	cancelled: boolean;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ---- repeats ----
// The wall-clock starts (ms, as if UTC) of one repeating event inside [fromLocal, toLocal].
function expand(ev: RawEvent, fromLocal: number, toLocal: number, cap: number): number[] {
	const r = ev.rrule!;
	const freq = r.FREQ;
	const interval = Math.max(1, parseInt(r.INTERVAL || '1', 10) || 1);
	const count = r.COUNT ? parseInt(r.COUNT, 10) : null;
	let until: number | null = null;
	if (r.UNTIL) {
		const u = parseWhen({ name: 'UNTIL', params: {}, value: r.UNTIL }, ev.start.tz);
		if (u) until = u.allDay ? u.local + 86399000 : u.tz === 'UTC' && ev.start.tz !== 'UTC' ? u.local + offsetSec(ev.start.tz, u.local) * 1000 : u.local;
	}
	const s = new Date(ev.start.local);
	const sy = s.getUTCFullYear(), sm = s.getUTCMonth(), sd = s.getUTCDate(), swd = s.getUTCDay();
	const timeOfDay = ev.start.local - Date.UTC(sy, sm, sd);
	const startDay = Math.floor(Date.UTC(sy, sm, sd) / 86400000);
	const byday = (r.BYDAY || '').split(',').filter(Boolean).map((x) => {
		const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim().toUpperCase());
		return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: DAYS.indexOf(m[2]) } : null;
	}).filter((x): x is { n: number; wd: number } => !!x);
	const bymonthday = (r.BYMONTHDAY || '').split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n !== 0);
	const bymonth = (r.BYMONTH || '').split(',').map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 12);
	if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [];

	const weekIdx = (day: number) => Math.floor((day + 3) / 7); // weeks starting Monday (1 Jan 1970 was a Thursday)
	const matches = (day: number): boolean => {
		const t = new Date(day * 86400000);
		const y = t.getUTCFullYear(), mo = t.getUTCMonth(), d = t.getUTCDate(), wd = t.getUTCDay();
		const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
		const inMonthDay = () => (bymonthday.length ? bymonthday.some((n) => (n > 0 ? n === d : dim + n + 1 === d)) : true);
		const nthOk = (b: { n: number; wd: number }) => {
			if (b.wd !== wd) return false;
			if (!b.n) return true;
			const nth = Math.floor((d - 1) / 7) + 1;
			const fromEnd = Math.floor((dim - d) / 7) + 1;
			return b.n > 0 ? nth === b.n : fromEnd === -b.n;
		};
		if (freq === 'DAILY') {
			if ((day - startDay) % interval) return false;
			if (byday.length && !byday.some((b) => b.wd === wd)) return false;
			if (bymonth.length && !bymonth.includes(mo + 1)) return false;
			return inMonthDay();
		}
		if (freq === 'WEEKLY') {
			if ((weekIdx(day) - weekIdx(startDay)) % interval) return false;
			return byday.length ? byday.some((b) => b.wd === wd) : wd === swd;
		}
		if (freq === 'MONTHLY') {
			if (((y - sy) * 12 + (mo - sm)) % interval) return false;
			if (byday.length) return byday.some(nthOk) && inMonthDay();
			if (bymonthday.length) return inMonthDay();
			return d === sd;
		}
		// YEARLY
		if ((y - sy) % interval) return false;
		if (!(bymonth.length ? bymonth.includes(mo + 1) : mo === sm)) return false;
		if (byday.length) return byday.some(nthOk) && inMonthDay();
		if (bymonthday.length) return inMonthDay();
		return d === sd;
	};

	const out: number[] = [];
	const lastDay = Math.floor(Math.min(toLocal, until ?? Infinity) / 86400000);
	// With COUNT every instance from the start counts; otherwise jump straight to the window.
	let day = count !== null ? startDay : Math.max(startDay, Math.floor(fromLocal / 86400000) - 1);
	let n = 0;
	let steps = 0;
	for (; day <= lastDay && steps < 4000; day++, steps++) {
		if (!matches(day)) continue;
		const at = day * 86400000 + timeOfDay;
		if (at < ev.start.local) continue;
		if (until !== null && at > until) break;
		n++;
		if (at >= fromLocal && at <= toLocal) out.push(at);
		if (count !== null && n >= count) break;
		if (out.length >= cap) break;
	}
	return out;
}

// ---- the whole file ----
// Events overlapping [fromMs, toMs], soonest first, at most `max`.
export function parseIcs(text: string, fallbackTz: string, fromMs: number, toMs: number, max = 600): IcsEvent[] {
	const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
	const events: RawEvent[] = [];
	let cur: RawEvent | null = null;
	let depth = 0; // inside a VALARM or similar, inside the event
	for (const line of lines) {
		if (!line) continue;
		const up = line.toUpperCase();
		if (up === 'BEGIN:VEVENT') {
			cur = { uid: '', title: '', start: null as any, end: null, durMs: null, rrule: null, exdates: [], recurrenceId: null, cancelled: false };
			depth = 0;
			continue;
		}
		if (!cur) continue;
		if (up === 'END:VEVENT') {
			if (cur.start && cur.title) events.push(cur);
			cur = null;
			continue;
		}
		if (up.startsWith('BEGIN:')) {
			depth++;
			continue;
		}
		if (up.startsWith('END:')) {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth) continue;
		const p = parseLine(line);
		if (!p) continue;
		switch (p.name) {
			case 'UID':
				cur.uid = p.value.trim();
				break;
			case 'SUMMARY':
				cur.title = unescape(p.value).slice(0, 120);
				break;
			case 'DTSTART': {
				const w = parseWhen(p, fallbackTz);
				if (w) cur.start = w;
				break;
			}
			case 'DTEND': {
				const w = parseWhen(p, fallbackTz);
				if (w) cur.end = w;
				break;
			}
			case 'DURATION':
				cur.durMs = parseDuration(p.value);
				break;
			case 'RRULE': {
				const r: Record<string, string> = {};
				for (const kv of p.value.split(';')) {
					const eq = kv.indexOf('=');
					if (eq > 0) r[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
				}
				cur.rrule = r;
				break;
			}
			case 'EXDATE':
				for (const v of p.value.split(',')) {
					const w = parseWhen({ ...p, value: v }, fallbackTz);
					if (w) cur.exdates.push(whenMs(w));
				}
				break;
			case 'RECURRENCE-ID': {
				const w = parseWhen(p, fallbackTz);
				if (w) cur.recurrenceId = whenMs(w);
				break;
			}
			case 'STATUS':
				cur.cancelled = p.value.trim().toUpperCase() === 'CANCELLED';
				break;
		}
	}

	// moved or cancelled single instances of a repeating event
	const moved = new Map<string, Set<number>>();
	for (const e of events) if (e.recurrenceId !== null && e.uid) {
		if (!moved.has(e.uid)) moved.set(e.uid, new Set());
		moved.get(e.uid)!.add(e.recurrenceId);
	}

	const out: IcsEvent[] = [];
	const pad = 2 * 86400000; // wall-clock vs real time, and events that started just before
	for (const e of events) {
		if (e.cancelled) continue;
		const startMs = whenMs(e.start);
		// how long it lasts
		let len: number;
		if (e.durMs !== null) len = e.durMs;
		else if (e.end) len = e.start.allDay ? e.end.local - e.start.local : whenMs(e.end) - startMs;
		else len = e.start.allDay ? 86400000 : 0;
		if (!(len >= 0) || len > 400 * 86400000) len = e.start.allDay ? 86400000 : 0;
		const push = (localStart: number) => {
			const ms = e.start.allDay ? localStart : localToMs(localStart, e.start.tz);
			if (ms + Math.max(len, 1) < fromMs || ms > toMs) return;
			if (e.start.allDay) {
				const d0 = new Date(localStart).toISOString().slice(0, 10);
				const d1 = new Date(localStart + Math.max(86400000, len)).toISOString().slice(0, 10);
				out.push({ title: e.title, ms, allDay: true, dateOnly: d0, endDateOnly: d1 });
			} else out.push({ title: e.title, ms, allDay: false, endMs: len > 0 ? ms + len : undefined });
		};
		if (e.rrule && e.recurrenceId === null) {
			const skip = moved.get(e.uid);
			const ex = new Set(e.exdates);
			const tzOff = e.start.allDay ? 0 : offsetSec(e.start.tz, startMs) * 1000;
			for (const at of expand(e, fromMs + tzOff - pad - Math.max(0, len), toMs + tzOff + pad, max * 2)) {
				const real = e.start.allDay ? at : localToMs(at, e.start.tz);
				if (ex.has(real) || skip?.has(real)) continue;
				push(at);
			}
		} else push(e.start.local);
	}
	out.sort((a, b) => a.ms - b.ms);
	return out.slice(0, max);
}

export const looksLikeIcs = (text: string) => /BEGIN:VCALENDAR/i.test(text.slice(0, 2000));

// webcal://, plain http(s) links. Anything else is refused.
export function cleanFeedUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	let s = raw.trim();
	if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:\/\//i, 'https://');
	if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
	try {
		const u = new URL(s);
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
		if (!u.hostname.includes('.') || /^(\d+\.){3}\d+$/.test(u.hostname) || u.hostname.endsWith('.local') || u.hostname === 'localhost') return null;
		if (s.length > 1500) return null;
		return u.toString();
	} catch {
		return null;
	}
}
