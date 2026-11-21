// Repeating reminders: bin day, recycling every other week, rent on the 1st. Kept on the calendar
// (devices.reminders, schema-reminders.sql), so they don't need to be in Google Calendar.
//
// A reminder repeats either on some days of the week (every 1 to 4 weeks), or on a day of the month.
export interface Reminder {
	text: string;
	kind: 'week' | 'month';
	days: number; // weekly: bit 0 = Sunday ... bit 6 = Saturday
	every: number; // weekly: every 1, 2, 3 or 4 weeks
	start: string; // weekly, every 2+ weeks: a date (YYYY-MM-DD) in a week it happens
	mday: number; // monthly: 1-31 (31 = the last day in shorter months)
}

export const MAX_REMINDERS = 12;
export const MAX_REMINDER_TEXT = 40;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const dayOf = (iso: string): number | null => {
	if (!DATE.test(iso)) return null;
	const ms = Date.parse(iso + 'T00:00:00Z');
	return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
};
const isoOf = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);

export function sanitizeReminders(raw: unknown): Reminder[] {
	let v: unknown = raw;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(v)) return [];
	const out: Reminder[] = [];
	for (const r of v) {
		if (!r || typeof r !== 'object') continue;
		const o = r as Record<string, unknown>;
		const text = String(o.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_REMINDER_TEXT);
		const kind = o.kind === 'month' ? 'month' : 'week';
		const days = Math.max(0, Math.min(127, Math.floor(Number(o.days) || 0)));
		const every = [1, 2, 3, 4].includes(Number(o.every)) ? Number(o.every) : 1;
		const start = typeof o.start === 'string' && dayOf(o.start) !== null ? o.start : '';
		const mday = Math.max(1, Math.min(31, Math.floor(Number(o.mday) || 1)));
		out.push({ text, kind, days, every, start, mday });
		if (out.length >= MAX_REMINDERS) break;
	}
	return out;
}

// Does it happen on this day (days since 1970)?
export function occursOn(r: Reminder, day: number): boolean {
	if (!r.text) return false;
	const t = new Date(day * 86400000);
	if (r.kind === 'month') {
		const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
		return t.getUTCDate() === Math.min(r.mday, last);
	}
	if (!(r.days & (1 << t.getUTCDay()))) return false;
	if (r.every <= 1) return true;
	const anchor = dayOf(r.start);
	if (anchor === null) return true;
	// weeks counted Sunday to Saturday (1 Jan 1970 was a Thursday)
	const wk = (d: number) => Math.floor((d + 4) / 7);
	return (((wk(day) - wk(anchor)) % r.every) + r.every) % r.every === 0;
}

// What's coming up from `today`, over the next `days` days (today included), soonest first.
export function upcoming(list: Reminder[] | null | undefined, today: number, days = 14): { day: number; text: string }[] {
	const out: { day: number; text: string }[] = [];
	for (let d = today; d < today + days; d++) for (const r of list ?? []) if (occursOn(r, d)) out.push({ day: d, text: r.text });
	return out;
}

// "Every Tue", "Every 2 weeks: Mon, Thu", "1st of the month" (for the dashboard)
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function repeatText(r: Reminder): string {
	if (r.kind === 'month') {
		const n = r.mday;
		const sfx = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
		return n === 31 ? 'Last day of the month' : `${n}${sfx} of the month`;
	}
	const ds = DAY3.filter((_, i) => r.days & (1 << i)).join(', ') || 'no days';
	return r.every === 1 ? `Every ${ds}` : `Every ${r.every} weeks: ${ds}`;
}
export { isoOf as reminderIso };

// Examples for previews when none are set yet: bins tomorrow, recycling in three days.
export function sampleReminders(nowLocal: number, lang?: string): Reminder[] {
	const wd = (n: number) => 1 << ((Math.floor(nowLocal / 86400) + 4 + n) % 7);
	const ja = lang === 'ja';
	return [
		{ text: ja ? 'ゴミ出し' : 'Bins out', kind: 'week', days: wd(1), every: 1, start: '', mday: 1 },
		{ text: ja ? '資源ごみ' : 'Recycling', kind: 'week', days: wd(3), every: 1, start: '', mday: 1 },
		{ text: ja ? '植物に水やり' : 'Water the plants', kind: 'week', days: wd(0) | wd(5), every: 1, start: '', mday: 1 },
	];
}
