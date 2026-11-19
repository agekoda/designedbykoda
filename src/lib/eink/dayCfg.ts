// Away mode and quiet hours, set on the dashboard (devices.day_cfg, schema-school.sql).
//   away:  until a date the screen says "Away until Mon 12 Jan" and the calendar only checks in
//          every two days (the longest the firmware sleeps), saving the battery.
//   quiet: no timed updates between two times (22:00 to 06:00, say). The button still works.
export interface DayCfg {
	away: { until: string; note: string } | null; // until = the day it's back, YYYY-MM-DD
	quiet: { on: boolean; from: number; to: number }; // minutes after midnight
}
export const DEFAULT_DAYCFG: DayCfg = { away: null, quiet: { on: false, from: 22 * 60, to: 6 * 60 } };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const mins = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1439, Math.max(0, Math.round(v))) : def);

export function sanitizeDayCfg(raw: unknown): DayCfg {
	let v: any = raw;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			v = null;
		}
	}
	if (!v || typeof v !== 'object') return structuredClone(DEFAULT_DAYCFG);
	const a = v.away;
	const away = a && typeof a.until === 'string' && DATE.test(a.until) ? { until: a.until, note: typeof a.note === 'string' ? a.note.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) : '' } : null;
	const q = v.quiet ?? {};
	return { away, quiet: { on: q.on === true, from: mins(q.from, 22 * 60), to: mins(q.to, 6 * 60) } };
}

const dayOf = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);

// Is it away now? (until the start of the `until` day, local time)
export const isAway = (c: DayCfg, nowLocal: number) => !!c.away && Math.floor(nowLocal / 86400) < dayOf(c.away.until);

// Seconds until the `until` day starts.
export const secondsUntilBack = (c: DayCfg, nowLocal: number) => (c.away ? Math.max(60, dayOf(c.away.until) * 86400 - nowLocal + 60) : 86400);

function inQuiet(c: DayCfg, m: number): boolean {
	const { from, to } = c.quiet;
	if (from === to) return false;
	return from < to ? m >= from && m < to : m >= from || m < to;
}

// A wake that would land in quiet hours moves to the end of them.
export function quietSleep(c: DayCfg, nowLocal: number, sleepSec: number): number {
	if (!c.quiet.on) return sleepSec;
	const at = nowLocal + sleepSec;
	const m = Math.floor((((at % 86400) + 86400) % 86400) / 60);
	if (!inQuiet(c, m)) return sleepSec;
	let wait = (c.quiet.to - m + 1440) % 1440; // minutes from the wake to the end of quiet hours
	if (wait === 0) wait = 1440;
	const secIntoMin = (((at % 60) + 60) % 60);
	return sleepSec + wait * 60 - secIntoMin + 30;
}
