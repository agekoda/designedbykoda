// What a layout gets to work with, plus the small date helpers every layout
// needs. Everything is "local wall-clock seconds": the real instant shifted by
// the user's timezone offset and then read with the UTC getters, so no Intl
// calls are needed (they're comparatively slow on a Worker).
import type { Family } from './fonts';

export interface CalEvent {
	title: string;
	startLocal: number; // local wall-clock seconds (all-day events: that date's midnight)
	allDay: boolean;
}

export interface LayoutCtx {
	nowLocal: number; // local wall-clock seconds
	events: CalEvent[]; // soonest first
	weather: { high: number; low: number } | null;
	vbat: number | null; // volts, as reported by the device
	dark: boolean;
	family: Family; // which font family this layout draws with
	// Optional 1-bit picture (see image.ts) for layouts that have a picture spot. 1 = dark dot.
	cornerImage?: Uint8Array | null;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface Tm {
	year: number; // full year, e.g. 2026
	mon: number; // 0-11
	mday: number; // 1-31
	wday: number; // 0 = Sunday
	hour: number;
	min: number;
}

export function tmOf(localSec: number): Tm {
	const d = new Date(localSec * 1000);
	return { year: d.getUTCFullYear(), mon: d.getUTCMonth(), mday: d.getUTCDate(), wday: d.getUTCDay(), hour: d.getUTCHours(), min: d.getUTCMinutes() };
}

export const dayIdx = (localSec: number) => Math.floor(localSec / 86400);
// Noon on a given day number (safe for weekday / date / month lookups).
export const tmFromDayIdx = (idx: number) => tmOf(idx * 86400 + 43200);

export const dayName = (t: Tm) => DAY_NAMES[t.wday];
export const dayShort = (t: Tm) => DAY_NAMES[t.wday].slice(0, 3);
export const monthName = (t: Tm) => MONTH_NAMES[t.mon];
export const monthShort = (t: Tm) => MONTH_NAMES[t.mon].slice(0, 3);

export function daysInMonth(year: number, mon: number): number {
	if (mon === 1) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
	return 31 - (mon === 3 || mon === 5 || mon === 8 || mon === 10 ? 1 : 0);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export function evTimeStr(e: CalEvent): string {
	if (e.allDay) return 'All day';
	const t = tmOf(e.startLocal);
	return `${pad2(t.hour)}:${pad2(t.min)}`;
}

// printf("%.0f") rounds exact halves to the nearest even number; do the same so
// temperatures read exactly as they did when the firmware formatted them.
export function round0(x: number): string {
	let r = Math.round(x);
	if (Math.abs(x % 1) === 0.5) r = 2 * Math.round(x / 2);
	return String(r === 0 ? 0 : r);
}

export function batteryText(v: number | null): string | null {
	return v === null ? null : `${v.toFixed(2)}V`;
}

// "High 19C  Low 12C"; `sep` is the gap between the two halves.
export function hiLoText(ctx: LayoutCtx, sep: string): string {
	if (!ctx.weather) return '---';
	return `High ${round0(ctx.weather.high)}C${sep}Low ${round0(ctx.weather.low)}C`;
}

// n-th upcoming event (0 = next), counting events from today onwards by DAY.
export function upcoming(ctx: LayoutCtx, n: number): CalEvent | null {
	const today = dayIdx(ctx.nowLocal);
	let seen = 0;
	for (const e of ctx.events) {
		if (dayIdx(e.startLocal) < today) continue;
		if (seen === n) return e;
		seen++;
	}
	return null;
}

export function relDayText(evDay: number, today: number): string {
	const n = evDay - today;
	if (n <= 0) return 'Today';
	if (n === 1) return 'Tomorrow';
	return `in ${n} days`;
}
