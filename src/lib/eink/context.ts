import { batteryPercent } from './battery';
// What a layout gets to work with, plus the small date helpers every layout
// needs. Everything is "local wall-clock seconds": the real instant shifted by
// the user's timezone offset and then read with the UTC getters, so no Intl
// calls are needed (they're comparatively slow on a Worker).
import type { Family } from './fonts';
import { isJa, tr, type Lang } from './i18n';

export interface CalEvent {
	title: string;
	startLocal: number; // local wall-clock seconds (all-day events: that date's midnight)
	allDay: boolean;
	endLocal?: number; // local wall-clock end (all-day events: the midnight after the last day)
}

// One day of the weather forecast (Open-Meteo weather code, temperatures in C, rain chance %, wind km/h).
export interface WxDay {
	date: string; // YYYY-MM-DD, the location's local date
	code: number;
	high: number;
	low: number;
	rain: number | null;
	wind: number | null;
}

export interface LayoutCtx {
	nowLocal: number; // local wall-clock seconds
	events: CalEvent[]; // soonest first
	weather: { high: number; low: number; code?: number; rain?: number | null; wind?: number | null; days?: WxDay[] } | null;
	vbat: number | null; // volts, as reported by the device
	dark: boolean;
	family: Family; // which font family this layout draws with
	// Optional 1-bit picture (see image.ts) for layouts that have a picture spot. 1 = dark dot.
	cornerImage?: Uint8Array | null;
	cornerSize?: { w: number; h: number } | null; // size of cornerImage when it isn't the classic corner box
	// How often the calendar wakes up, in seconds (86400 = once a day). Only the Timeline cares.
	refreshSec?: number;
	// Where the calendar lives (the weather location), for sunrise / sunset and which way up the Moon is.
	loc?: { lat: number; lon: number } | null;
	utcOffsetSec?: number; // seconds to add to UTC to get local time
	// The Countdown layout: a name and a date (YYYY-MM-DD).
	countdown?: { title: string; date: string } | null;
	// The Photo frame layout: a full-screen 1-bit picture (see image.ts, FRAME). 1 = dark dot.
	frameImage?: Uint8Array | null;
	// The To-do layout: tasks from Google Tasks, and whether we were allowed to read them.
	tasks?: TaskItem[] | null;
	tasksState?: 'ok' | 'needs_permission' | 'error';
	// Which language the screen is written in (default English). See i18n.ts.
	lang?: Lang;
	// The layout builder: the widgets of the person's own design (see builder/model.ts).
	custom?: import('./builder/model').CustomLayout | null;
}

export interface TaskItem {
	title: string;
	done: boolean;
	due?: string; // YYYY-MM-DD
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

const JA_DAYS = ['日', '月', '火', '水', '木', '金', '土'];

// Weekday and month names, in the screen's language. Japanese has no short and long month names: 11月 either way.
export const dayLong = (wday: number) => (isJa() ? JA_DAYS[wday] + '曜日' : DAY_NAMES[wday]);
export const dayAbbr = (wday: number) => (isJa() ? JA_DAYS[wday] : DAY_NAMES[wday].slice(0, 3));
export const dayLetter = (wday: number) => (isJa() ? JA_DAYS[wday] : DAY_NAMES[wday][0]);
export const monthLong = (mon: number) => (isJa() ? `${mon + 1}月` : MONTH_NAMES[mon]);
export const dayName = (t: Tm) => dayLong(t.wday);
export const dayShort = (t: Tm) => dayAbbr(t.wday);
export const monthName = (t: Tm) => monthLong(t.mon);
export const monthShort = (t: Tm) => (isJa() ? `${t.mon + 1}月` : MONTH_NAMES[t.mon].slice(0, 3));

// Whole dates. English: "Fri 6 Nov". Japanese: "11月6日(金)".
export const dateShort = (t: Tm) => (isJa() ? `${t.mon + 1}月${t.mday}日(${JA_DAYS[t.wday]})` : `${dayShort(t)} ${t.mday} ${monthShort(t)}`);
// "6 Nov" / "11月6日"
export const dayMonth = (t: Tm) => (isJa() ? `${t.mon + 1}月${t.mday}日` : `${t.mday} ${monthShort(t)}`);
// "November 2026" / "2026年11月", and the short form "Nov 2026" (same in Japanese)
export const monthYear = (t: Tm, short = false) => (isJa() ? `${t.year}年${t.mon + 1}月` : `${short ? monthShort(t) : monthName(t)} ${t.year}`);
// "Friday 6 November 2026" / "2026年11月6日 金曜日"
export const dateLong = (t: Tm) => (isJa() ? `${t.year}年${t.mon + 1}月${t.mday}日 ${dayLong(t.wday)}` : `${DAY_NAMES[t.wday]} ${t.mday} ${MONTH_NAMES[t.mon]} ${t.year}`);
// Column heads of a month grid, Monday first (or Sunday first).
export const weekLetters = (monFirst = true): string[] => {
	const order = monFirst ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
	return order.map((w) => (isJa() ? JA_DAYS[w] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'][w]));
};

export function daysInMonth(year: number, mon: number): number {
	if (mon === 1) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
	return 31 - (mon === 3 || mon === 5 || mon === 8 || mon === 10 ? 1 : 0);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export function evTimeStr(e: CalEvent): string {
	if (e.allDay) return tr('All day');
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

// "87%", or "Low 12%" once it is worth charging. Same voltage reading the device used.
export function batteryText(v: number | null): string | null {
	if (v === null) return null;
	const pct = batteryPercent(v);
	return pct <= 15 ? tr(`Low ${pct}%`) : `${pct}%`;
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
	if (n <= 0) return tr('Today');
	if (n === 1) return tr('Tomorrow');
	return tr(`in ${n} days`);
}
