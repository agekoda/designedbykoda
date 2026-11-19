// Birthdays for the Birthdays widget: Google Calendar keeps your contacts' birthdays as events of
// type "birthday" in your main calendar. Any event with "birthday" in its name (all day or not), from
// any calendar the screen reads (a family calendar, a timetable or calendar link), counts too.
import type { CalEvent } from './eink/context';

export interface Birthday { name: string; dayLocal: number } // dayLocal: local midnight, in "local seconds"

// "Sam Kowalski's birthday", "Birthday: Sam", "Sam's Birthday 🎂" -> "Sam Kowalski" / "Sam"
export function birthdayName(title: string): string {
	let t = String(title ?? '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').trim();
	t = t.replace(/^(happy\s+)?birthday\s*[:\-–—]?\s*/i, '');
	t = t.replace(/[’']s?\s+(\d+(st|nd|rd|th)\s+)?birthday.*$/i, '');
	t = t.replace(/\s+birthday.*$/i, '');
	return t.trim() || String(title ?? '').trim();
}

// One calendar's birthdays: Google's own contact birthdays (eventTypes=birthday, main calendar
// only), or a search for events with "birthday" in them, timed or all day (q=birthday).
async function fetchOne(accessToken: string, calId: string, how: 'contacts' | 'search', fromMs: number, days: number, offsetSec: number): Promise<Birthday[]> {
	try {
		const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
		if (how === 'contacts') url.searchParams.set('eventTypes', 'birthday');
		else url.searchParams.set('q', 'birthday');
		url.searchParams.set('singleEvents', 'true');
		url.searchParams.set('orderBy', 'startTime');
		url.searchParams.set('timeMin', new Date(fromMs - 86400000).toISOString());
		url.searchParams.set('timeMax', new Date(fromMs + days * 86400000).toISOString());
		url.searchParams.set('maxResults', '50');
		const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
		if (!res.ok) {
			console.error(`Birthdays fetch failed: HTTP ${res.status}`);
			return [];
		}
		const data: any = await res.json();
		const out: Birthday[] = [];
		for (const e of data.items ?? []) {
			if (how === 'search' && !/birthday/i.test(e.summary ?? '')) continue; // q also matches descriptions
			const d = e.start?.date;
			if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
				const [y, m, dd] = d.split('-').map(Number);
				out.push({ name: birthdayName(e.summary ?? ''), dayLocal: Date.UTC(y, m - 1, dd) / 1000 });
			} else if (typeof e.start?.dateTime === 'string') {
				// a timed "Elaine birthday": the day it starts on, in the calendar's own time
				const local = Math.floor(Date.parse(e.start.dateTime) / 1000) + offsetSec;
				if (Number.isFinite(local)) out.push({ name: birthdayName(e.summary ?? ''), dayLocal: Math.floor(local / 86400) * 86400 });
			}
		}
		return out;
	} catch (err) {
		console.error('Birthdays fetch failed', err);
		return [];
	}
}

// Contact birthdays from the main calendar, and a search of every Google calendar the screen reads,
// so a birthday weeks away isn't crowded out of the screen's usual short list of events.
export async function fetchBirthdays(accessToken: string, calIds: string[], fromMs: number, days: number, offsetSec: number): Promise<Birthday[]> {
	const jobs = [fetchOne(accessToken, 'primary', 'contacts', fromMs, days, offsetSec), ...calIds.slice(0, 8).map((c) => fetchOne(accessToken, c, 'search', fromMs, days, offsetSec))];
	return (await Promise.all(jobs)).flat();
}

// Google's, plus any "… birthday" all-day events already on the screen; one each, soonest first.
export function mergeBirthdays(google: Birthday[], events: CalEvent[]): Birthday[] {
	const all = [...google];
	for (const e of events) if (/birthday/i.test(e.title)) all.push({ name: birthdayName(e.title), dayLocal: Math.floor(e.startLocal / 86400) * 86400 });
	const seen = new Set<string>();
	return all
		.filter((b) => {
			const k = b.name.toLowerCase() + '|' + b.dayLocal;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		})
		.sort((a, b) => a.dayLocal - b.dayLocal);
}
