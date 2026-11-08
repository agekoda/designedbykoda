// Screen schedules: show a different layout at different times ("Photo frame on weekday
// evenings, Month on weekends"), and what the calendar's button does (refresh, or flip to the
// next screen). Pure data and maths, shared by the server (to pick the screen and the next wake)
// and the dashboard (to edit it and draw the week overview).
//
// Times are minutes after local midnight. A slot whose end is earlier than its start runs past
// midnight (18:00 to 07:00). Start == end means all day. `days` is a bitmask, bit 0 = Sunday,
// and refers to the day the slot STARTS on. When two slots overlap, the one higher in the list wins.
// Outside every slot, the device shows its main layout.

export const MAX_SLOTS = 12;
export const ALL_DAYS = 0b1111111;
export const WEEKDAYS = 0b0111110;
export const WEEKEND = 0b1000001;

export interface Slot {
	style: string;
	days: number;
	from: number; // minutes, 0..1439
	to: number; // minutes, 0..1439
}

export type ButtonMode = 'refresh' | 'next';

export interface Schedule {
	v: 1;
	on: boolean;
	slots: Slot[];
	button: ButtonMode;
	cycle: string[]; // screens the button flips through, in order (the main layout is always first)
}

export const EMPTY_SCHEDULE: Schedule = { v: 1, on: false, slots: [], button: 'refresh', cycle: [] };

const DAY = 1440;
const int = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def);

// Whatever came in (the database, a request), made safe. `isStyle` says which layout ids exist.
export function sanitizeSchedule(input: unknown, isStyle: (id: unknown) => boolean): Schedule {
	let raw: any = input;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return { ...EMPTY_SCHEDULE };
		}
	}
	if (!raw || typeof raw !== 'object') return { ...EMPTY_SCHEDULE };
	const slots: Slot[] = [];
	for (const s of Array.isArray(raw.slots) ? raw.slots.slice(0, MAX_SLOTS) : []) {
		if (!s || !isStyle(s.style)) continue;
		const days = int(s.days, 0, ALL_DAYS, ALL_DAYS);
		if (!days) continue;
		slots.push({ style: s.style, days, from: int(s.from, 0, DAY - 1, 0), to: int(s.to, 0, DAY - 1, 0) });
	}
	const cycle: string[] = [];
	for (const c of Array.isArray(raw.cycle) ? raw.cycle.slice(0, 16) : []) if (isStyle(c) && !cycle.includes(c)) cycle.push(c);
	return { v: 1, on: raw.on === true, slots, button: raw.button === 'next' ? 'next' : 'refresh', cycle };
}

// Does this slot cover minute `m` of a day whose weekday is `wday`?
function covers(s: Slot, wday: number, m: number): boolean {
	const today = (s.days >> wday) & 1;
	const yday = (s.days >> ((wday + 6) % 7)) & 1;
	if (s.from === s.to) return !!today; // all day
	if (s.from < s.to) return !!today && m >= s.from && m < s.to;
	// runs past midnight: the evening part belongs to today's start, the morning part to yesterday's
	return (!!today && m >= s.from) || (!!yday && m < s.to);
}

// Which slot (if any) is on at this local time. nowLocal = local wall-clock seconds.
export function activeSlot(sch: Schedule | null | undefined, nowLocal: number): Slot | null {
	if (!sch?.on) return null;
	const wday = new Date(nowLocal * 1000).getUTCDay();
	const m = Math.floor((((nowLocal % 86400) + 86400) % 86400) / 60);
	for (const s of sch.slots) if (covers(s, wday, m)) return s;
	return null;
}

export function activeStyle(sch: Schedule | null | undefined, mainStyle: string, nowLocal: number): string {
	return activeSlot(sch, nowLocal)?.style ?? mainStyle;
}

// Seconds from nowLocal until the scheduled screen next changes (looking up to 8 days ahead),
// or null if it never will. Checks every slot edge rather than every minute.
export function secondsToNextChange(sch: Schedule | null | undefined, mainStyle: string, nowLocal: number): number | null {
	if (!sch?.on || !sch.slots.length) return null;
	const edges = new Set<number>();
	for (const s of sch.slots) {
		edges.add(s.from);
		edges.add(s.to);
	}
	edges.add(0);
	const sorted = [...edges].sort((a, b) => a - b);
	const cur = activeStyle(sch, mainStyle, nowLocal);
	const dayStart = Math.floor(nowLocal / 86400) * 86400;
	for (let d = 0; d <= 8; d++) {
		for (const e of sorted) {
			const t = dayStart + d * 86400 + e * 60;
			if (t <= nowLocal + 30) continue;
			if (activeStyle(sch, mainStyle, t) !== cur) return t - nowLocal;
		}
	}
	return null;
}

// The screens the button flips through: the main layout first, then the chosen ones
// (or, if none were chosen, every layout in the schedule).
export function cycleList(sch: Schedule | null | undefined, mainStyle: string): string[] {
	const out = [mainStyle];
	const extra = sch?.cycle?.length ? sch.cycle : (sch?.slots ?? []).map((s) => s.style);
	for (const s of extra) if (!out.includes(s)) out.push(s);
	return out;
}

export function nextInCycle(list: string[], current: string): string {
	const i = list.indexOf(current);
	return list[(i + 1) % list.length] ?? list[0];
}

// ---- words and numbers for the dashboard ----
const pad2 = (n: number) => String(n).padStart(2, '0');
export const minutesToHHMM = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
export function hhmmToMinutes(s: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
	if (!m) return null;
	const h = +m[1];
	const min = +m[2];
	return h < 24 && min < 60 ? h * 60 + min : null;
}

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function daysText(mask: number): string {
	if (mask === ALL_DAYS) return 'Every day';
	if (mask === WEEKDAYS) return 'Weekdays';
	if (mask === WEEKEND) return 'Weekends';
	const order = [1, 2, 3, 4, 5, 6, 0];
	return order.filter((d) => (mask >> d) & 1).map((d) => SHORT[d]).join(', ');
}

// How many times a day, on average, the schedule wakes the calendar to change screen.
export function changesPerDay(sch: Schedule | null | undefined, mainStyle: string): number {
	if (!sch?.on || !sch.slots.length) return 0;
	let n = 0;
	// count changes over one whole week, minute by minute at every edge
	const base = Date.UTC(2026, 0, 4) / 1000; // a Sunday, local midnight
	let prev = activeStyle(sch, mainStyle, base - 60);
	const edges = new Set<number>([0]);
	for (const s of sch.slots) edges.add(s.from).add(s.to);
	const sorted = [...edges].sort((a, b) => a - b);
	for (let d = 0; d < 7; d++)
		for (const e of sorted) {
			const st = activeStyle(sch, mainStyle, base + d * 86400 + e * 60);
			if (st !== prev) n++;
			prev = st;
		}
	return n / 7;
}

// Ready-made schedules for the "quick start" buttons.
export const SCHEDULE_PRESETS: { id: string; label: string; note: string; slots: (main: string) => Slot[] }[] = [
	{
		id: 'evening',
		label: 'Photo in the evening',
		note: 'Your photo from 6pm to 7am',
		slots: () => [{ style: 'frame', days: ALL_DAYS, from: 18 * 60, to: 7 * 60 }],
	},
	{
		id: 'weekend',
		label: 'Different on weekends',
		note: 'The month on Saturdays and Sundays',
		slots: () => [{ style: 'month', days: WEEKEND, from: 0, to: 0 }],
	},
	{
		id: 'workday',
		label: 'Work hours',
		note: 'Timeline 8am to 6pm on weekdays',
		slots: () => [{ style: 'timeline', days: WEEKDAYS, from: 8 * 60, to: 18 * 60 }],
	},
];
