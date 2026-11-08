// The message board: short notes sent to a calendar from the dashboard, or by anyone with the
// calendar's shared link. Shared by the server (storing, the device endpoint)
// and the dashboard pages. Tables and columns come from schema-messages.sql; until it's run every
// read here quietly returns nothing, so the calendar works exactly as before.
import { cleanText } from './eink/draw';

export const MAX_BODY = 140;
export const MAX_AUTHOR = 20;
export const MAX_ACTIVE = 20; // messages showing at once, per calendar
export const LINK_PER_DAY = 25; // messages per calendar per day through the shared link

// Messages show on the Message board layout, or a Messages widget in your own design.
export interface MsgCfg {
	check: number; // seconds between checks for new messages during the day (0 = only when it wakes anyway)
}
export const DEFAULT_CFG: MsgCfg = { check: 0 };
export const CHECK_CHOICES = [
	{ sec: 0, label: 'When I press the button' },
	{ sec: 7200, label: 'Every 2 hours' },
	{ sec: 3600, label: 'Every hour' },
	{ sec: 1800, label: 'Every 30 minutes' },
];
// Checks only happen while people are up: 7am to 10pm, the calendar's local time.
export const DAY_FROM = 7;
export const DAY_TO = 22;

export function sanitizeCfg(input: unknown): MsgCfg {
	let raw: any = input;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			raw = null;
		}
	}
	return { check: CHECK_CHOICES.some((c) => c.sec === raw?.check) ? raw.check : 0 };
}

// How long a message lasts.
export type Expiry = '1h' | 'tonight' | '1d' | '1w' | 'never';
export const EXPIRY_CHOICES: { id: Expiry; label: string }[] = [
	{ id: '1h', label: '1 hour' },
	{ id: 'tonight', label: 'Until midnight' },
	{ id: '1d', label: '1 day' },
	{ id: '1w', label: '1 week' },
	{ id: 'never', label: 'Until removed' },
];
export const isExpiry = (v: unknown): v is Expiry => EXPIRY_CHOICES.some((c) => c.id === v);

// Unix seconds the message disappears at (null = never). utcOffsetSec is the calendar's timezone.
export function expiresAt(e: Expiry, nowUnix: number, utcOffsetSec: number): number | null {
	if (e === '1h') return nowUnix + 3600;
	if (e === '1d') return nowUnix + 86400;
	if (e === '1w') return nowUnix + 7 * 86400;
	if (e === 'never') return null;
	const local = nowUnix + utcOffsetSec;
	return Math.floor(local / 86400) * 86400 + 86400 - utcOffsetSec; // next local midnight
}

// Text made safe to draw (plain letters, plus Japanese the screen fonts have), one line.
export const cleanBody = (s: unknown) => cleanText(String(s ?? ''), false).replace(/\s+/g, ' ').trim().slice(0, MAX_BODY);
export const cleanAuthor = (s: unknown) => cleanText(String(s ?? ''), false).replace(/\s+/g, ' ').trim().slice(0, MAX_AUTHOR);

export interface Msg {
	id: string;
	author: string;
	body: string;
	createdAt: number;
	expiresAt: number | null;
	via: 'owner' | 'link';
}

export async function activeMessages(db: any, deviceId: string, nowUnix: number, limit = MAX_ACTIVE): Promise<Msg[]> {
	try {
		const r = await db
			.prepare('SELECT id, author, body, created_at, expires_at, via FROM messages WHERE device_id = ? AND removed = 0 AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT ?')
			.bind(deviceId, nowUnix, limit)
			.all();
		return (r.results ?? []).map((m: any) => ({ id: m.id, author: m.author ?? '', body: m.body, createdAt: m.created_at, expiresAt: m.expires_at ?? null, via: m.via === 'link' ? 'link' : 'owner' }));
	} catch {
		return []; // schema-messages.sql not run yet
	}
}

export async function addMessage(db: any, deviceId: string, m: { author: string; body: string; expiresAt: number | null; via: 'owner' | 'link' }, nowUnix: number): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	if (!m.body) return { ok: false, error: 'Type a message first.' };
	try {
		const active = await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE device_id = ? AND removed = 0 AND (expires_at IS NULL OR expires_at > ?)').bind(deviceId, nowUnix).first();
		if ((active?.n ?? 0) >= MAX_ACTIVE)
			return { ok: false, error: m.via === 'link' ? `This calendar is full (${MAX_ACTIVE} messages). Ask whoever shared the link to clear some.` : `This calendar already has ${MAX_ACTIVE} messages. Remove some first.` };
		if (m.via === 'link') {
			const today = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE device_id = ? AND via = 'link' AND created_at > ?").bind(deviceId, nowUnix - 86400).first();
			if ((today?.n ?? 0) >= LINK_PER_DAY) return { ok: false, error: `This link has sent ${LINK_PER_DAY} messages in the last 24 hours, which is the most it can. Try again later.` };
		}
		const id = newId();
		await db
			.prepare('INSERT INTO messages (id, device_id, author, body, created_at, expires_at, removed, via) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
			.bind(id, deviceId, m.author || null, m.body, nowUnix, m.expiresAt, m.via)
			.run();
		return { ok: true, id };
	} catch {
		return { ok: false, error: 'Messages need a one-off database update on the server (schema-messages.sql).' };
	}
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function newId(): string {
	return b64url(crypto.getRandomValues(new Uint8Array(9)));
}
// 128 random bits: the secret in a shared link.
export function newToken(): string {
	return b64url(crypto.getRandomValues(new Uint8Array(16)));
}
export const isToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{20,32}$/.test(t);

// Seconds until the next message check (on the hour / half hour, 7am-10pm local), or null if it doesn't check.
export function secondsToNextCheck(check: number, nowLocal: number): number | null {
	if (!check) return null;
	const s = ((nowLocal % 86400) + 86400) % 86400;
	for (let t = DAY_FROM * 3600; t <= DAY_TO * 3600; t += check) if (t > s + 60) return t - s;
	return 86400 - s + DAY_FROM * 3600; // first check tomorrow morning
}
export const checksPerDay = (check: number) => (check ? Math.floor(((DAY_TO - DAY_FROM) * 3600) / check) + 1 : 0);

// Seconds from now until the soonest message runs out (so the screen can drop it), or null.
export function secondsToNextExpiry(msgs: Msg[], nowUnix: number): number | null {
	let best: number | null = null;
	for (const m of msgs) if (m.expiresAt !== null && m.expiresAt > nowUnix && (best === null || m.expiresAt - nowUnix < best)) best = m.expiresAt - nowUnix;
	return best;
}

// Seconds to add to UTC for this IANA timezone right now (for "until midnight").
export function utcOffset(timeZone: string | null | undefined, at = new Date()): number {
	try {
		const p = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
			.formatToParts(at)
			.reduce((a: any, x) => ((a[x.type] = x.value), a), {});
		// whole minutes: real offsets always are, and this keeps "until midnight" exactly on midnight
		return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime()) / 60000) * 60;
	} catch {
		return 0;
	}
}
