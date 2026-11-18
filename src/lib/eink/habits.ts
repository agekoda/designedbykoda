// Habits: a few things to do every day (read, gym, water), ticked off in Customize display.
// Kept on the calendar (devices.habits, schema-habits.sql). Each habit remembers the days it
// was done, as dates (YYYY-MM-DD) in the calendar's own time zone, and the screen draws a streak
// and a grid of the last few weeks from them.
export interface Habit {
	name: string;
	done: string[]; // the days it was done, newest first
}

export const MAX_HABITS = 4;
export const MAX_HABIT_NAME = 24;
export const KEEP_DAYS = 120; // days of history kept per habit
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const dayOfIso = (iso: string): number | null => {
	if (!DATE.test(iso)) return null;
	const ms = Date.parse(iso + 'T00:00:00Z');
	return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
};
export const isoOfDay = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);

export function sanitizeHabits(raw: unknown): Habit[] {
	let v: unknown = raw;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(v)) return [];
	const out: Habit[] = [];
	for (const h of v) {
		if (!h || typeof h !== 'object') continue;
		const o = h as Record<string, unknown>;
		const name = String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_HABIT_NAME);
		const days = new Set<number>();
		if (Array.isArray(o.done)) for (const d of o.done) if (typeof d === 'string') {
			const n = dayOfIso(d);
			if (n !== null) days.add(n);
		}
		const done = [...days].sort((a, b) => b - a).slice(0, KEEP_DAYS).map(isoOfDay);
		out.push({ name, done });
		if (out.length >= MAX_HABITS) break;
	}
	return out;
}

export const doneSet = (h: Habit) => new Set(h.done.map(dayOfIso).filter((n): n is number => n !== null));

// Days in a row it has been done, up to today. A habit not done yet today keeps yesterday's streak
// (the day isn't over), so the screen doesn't say 0 every morning.
export function streak(h: Habit, today: number): number {
	const s = doneSet(h);
	let d = s.has(today) ? today : today - 1;
	let n = 0;
	while (s.has(d)) {
		n++;
		d--;
	}
	return n;
}

// "12 days in a row", "Done today", "Not started"
export function streakText(h: Habit, today: number): string {
	const n = streak(h, today);
	if (n === 0) return 'Start today';
	return n === 1 ? '1 day' : `${n} days`;
}

// Examples for previews: a long streak, a short one, and a patchy one.
export function sampleHabits(nowLocal: number): Habit[] {
	const today = Math.floor(nowLocal / 86400);
	const days = (fn: (i: number) => boolean) => {
		const out: string[] = [];
		for (let i = 0; i < 60; i++) if (fn(i)) out.push(isoOfDay(today - i));
		return out;
	};
	return [
		{ name: 'Read 20 pages', done: days((i) => i < 23 || (i > 24 && i % 3 !== 0)) },
		{ name: 'Gym', done: days((i) => i > 0 && i % 7 !== 3 && i % 7 !== 6 && i < 40) },
		{ name: 'Drink water', done: days((i) => i < 5 || (i > 6 && i % 2 === 0)) },
	];
}
