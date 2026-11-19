// School-day helpers: which events are tests and assignments ("Due soon"), and the events of one day.
import { dayIdx, type CalEvent } from './context';

// Words that mark a test, exam or piece of work that's due.
const DUE_WORDS = /\b(tests?|exams?|quiz(zes)?|assessments?|assignments?|due|validation|investigation|essay|presentation|in-?class task|ext(ended)? response|practical|prac)\b/i;
export const isDue = (e: CalEvent) => DUE_WORDS.test(e.name ?? e.title);

// Due-type events from today on, within `days`, at most `max` (one per title per day).
export function dueSoon(events: CalEvent[], nowLocal: number, days = 14, max = 6): CalEvent[] {
	const today = dayIdx(nowLocal);
	const seen = new Set<string>();
	const out: CalEvent[] = [];
	for (const e of [...events].sort((a, b) => a.startLocal - b.startLocal)) {
		const d = dayIdx(e.startLocal);
		if (d < today || d > today + days || !isDue(e)) continue;
		if (!e.allDay && (e.endLocal ?? e.startLocal) < nowLocal) continue;
		const key = d + '|' + (e.name ?? e.title);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(e);
		if (out.length >= max) break;
	}
	return out;
}

// Events on day `day` (all-day ones that cover it, and timed ones that start on it).
export function eventsOn(events: CalEvent[], day: number): { allDay: CalEvent[]; timed: CalEvent[] } {
	const allDay: CalEvent[] = [];
	const timed: CalEvent[] = [];
	for (const e of events) {
		if (e.allDay) {
			const a = dayIdx(e.startLocal);
			const b = e.endLocal ? dayIdx(e.endLocal) : a + 1;
			if (day >= a && day < b) allDay.push(e);
		} else if (dayIdx(e.startLocal) === day) timed.push(e);
	}
	timed.sort((a, b) => a.startLocal - b.startLocal);
	return { allDay, timed };
}

// "Today", "Tomorrow", "Fri", "in 9 days"
export function whenShort(day: number, today: number, dayAbbr: (wday: number) => string): string {
	const n = day - today;
	if (n === 0) return 'Today';
	if (n === 1) return 'Tomorrow';
	if (n < 7) return dayAbbr(new Date(day * 86400000 + 43200000).getUTCDay());
	return `in ${n} days`;
}
