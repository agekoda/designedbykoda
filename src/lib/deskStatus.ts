// A status for the desk name plate, set from your phone: "In a meeting", "Back at 2", "Do not disturb".
// Each calendar can have one private link (/desk/<token>). Opening it, or an iPhone Shortcut
// calling /api/desk/<token>?text=…&mins=…, sets what the "Free or busy" part of the sign says
// until the time runs out, or until it's cleared. The calendar looks for a new status every so often
// during the day (check_sec), the same way the message board looks for new messages.
// The table is made the first time it's needed.

export const STATUS_MAX = 30;
export const STATUS_PRESETS = ['In a meeting', 'On a call', 'Back soon', 'Out for lunch', 'Do not disturb', 'Working from home'];
export const STATUS_CHECKS = [600, 900, 1800, 3600]; // how often the calendar looks, in seconds
export const STATUS_CHECK_DEFAULT = 900;

export interface DeviceStatus {
	token: string;
	text: string | null;
	until: number | null; // unix seconds; null = until it's cleared
	setAt: number | null;
	check: number;
}

async function ensure(db: any) {
	await db
		.prepare('CREATE TABLE IF NOT EXISTS device_status (device_id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, text TEXT, until INTEGER, set_at INTEGER, check_sec INTEGER NOT NULL DEFAULT 900)')
		.run();
}

const row = (r: any): DeviceStatus | null =>
	r ? { token: r.token, text: r.text ?? null, until: r.until ?? null, setAt: r.set_at ?? null, check: STATUS_CHECKS.includes(r.check_sec) ? r.check_sec : STATUS_CHECK_DEFAULT } : null;

export async function getStatus(db: any, deviceId: string): Promise<DeviceStatus | null> {
	try {
		return row(await db.prepare('SELECT * FROM device_status WHERE device_id = ?').bind(deviceId).first());
	} catch {
		return null; // no table yet: nobody has made a link
	}
}

export async function statusByToken(db: any, token: string): Promise<(DeviceStatus & { deviceId: string }) | null> {
	if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
	try {
		const r = await db.prepare('SELECT * FROM device_status WHERE token = ?').bind(token).first();
		return r ? { ...row(r)!, deviceId: r.device_id } : null;
	} catch {
		return null;
	}
}

// Showing now? (Not cleared, and not run out.)
export function activeStatus(s: DeviceStatus | null, nowUnix: number): { text: string; until: number | null } | null {
	if (!s?.text) return null;
	if (s.until !== null && s.until <= nowUnix) return null;
	return { text: s.text, until: s.until };
}

export function cleanStatusText(v: unknown): string {
	return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, STATUS_MAX) : '';
}

function newToken(): string {
	const b = new Uint8Array(18);
	crypto.getRandomValues(b);
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Make the link (or a new one, which stops the old one working).
export async function makeLink(db: any, deviceId: string): Promise<DeviceStatus> {
	await ensure(db);
	const token = newToken();
	await db
		.prepare('INSERT INTO device_status (device_id, token, check_sec) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET token = excluded.token')
		.bind(deviceId, token, STATUS_CHECK_DEFAULT)
		.run();
	return (await getStatus(db, deviceId))!;
}

export async function removeLink(db: any, deviceId: string) {
	try {
		await db.prepare('DELETE FROM device_status WHERE device_id = ?').bind(deviceId).run();
	} catch {}
}

export async function setCheck(db: any, deviceId: string, check: number) {
	if (!STATUS_CHECKS.includes(check)) return;
	await db.prepare('UPDATE device_status SET check_sec = ? WHERE device_id = ?').bind(check, deviceId).run();
}

// text '' clears it. mins: how long it lasts (null = until it's cleared).
export async function setStatus(db: any, token: string, text: string, mins: number | null, nowUnix: number) {
	const t = cleanStatusText(text);
	const until = t && mins && mins > 0 ? nowUnix + Math.min(mins, 7 * 24 * 60) * 60 : null;
	await db.prepare('UPDATE device_status SET text = ?, until = ?, set_at = ? WHERE token = ?').bind(t || null, until, nowUnix, token).run();
}
