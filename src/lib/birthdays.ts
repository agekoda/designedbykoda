// Birthdays for the Birthdays widget: Google Calendar keeps your contacts' birthdays as events of
// type "birthday" in your main calendar. Any all-day event with "birthday" in its name, from any
// calendar the screen reads (a family calendar, a feed), counts too.
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

export async function fetchBirthdays(accessToken: string, fromMs: number, days = 60): Promise<Birthday[]> {
	try {
		const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
		url.searchParams.set('eventTypes', 'birthday');
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
			const d = e.start?.date;
			if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
			const [y, m, dd] = d.split('-').map(Number);
			out.push({ name: birthdayName(e.summary ?? ''), dayLocal: Date.UTC(y, m - 1, dd) / 1000 });
		}
		return out;
	} catch (err) {
		console.error('Birthdays fetch failed', err);
		return [];
	}
}

// Google's, plus any "… birthday" all-day events already on the screen; one each, soonest first.
export function mergeBirthdays(google: Birthday[], events: CalEvent[]): Birthday[] {
	const all = [...google];
	for (const e of events) if (e.allDay && /birthday/i.test(e.title)) all.push({ name: birthdayName(e.title), dayLocal: Math.floor(e.startLocal / 86400) * 86400 });
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
