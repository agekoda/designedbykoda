// Waiting room: who's being seen now and who's next, from appointment titles.
// Booking systems write titles like "Sam Kowalski - Physio follow-up", "Appt: Sam Kowalski" or
// "Kowalski, Sam (New patient)". On a screen in a waiting room the full name shouldn't show, so
// by default this keeps the first name and the first letter of the surname: "Sam K.".

export type NameStyle = 'short' | 'first' | 'full';

// words that are the kind of appointment, not part of a name
const PREFIX = /^(appointment|appt|booking|consult(ation)?|session|visit|new patient|follow[- ]?up|review|check[- ]?up)\s*[:\-–—]\s*/i;
const TITLES = /^(mr|mrs|ms|miss|mx|dr|prof)\.?\s+/i;

export function personName(title: string, style: NameStyle = 'short'): string {
	let t = String(title ?? '').trim();
	t = t.replace(PREFIX, '');
	// the details after the name: "Sam Kowalski - Physio", "Sam Kowalski (new)", "Sam Kowalski | Room 2"
	t = t.split(/\s+[-–—|·]\s+|\s*[(\[]/)[0].trim();
	t = t.replace(/\s*[:;,]\s*$/, '');
	if (style === 'full') return t;
	// "Kowalski, Sam" is surname first
	const comma = t.match(/^([^,]+),\s*(.+)$/);
	let words = comma ? [...comma[2].split(/\s+/), ...comma[1].split(/\s+/)] : t.split(/\s+/);
	words = words.filter(Boolean);
	const titled = words.length && TITLES.test(words[0] + ' ');
	if (titled) words = words.slice(1);
	if (!words.length) return t;
	const first = words[0][0].toUpperCase() + words[0].slice(1);
	if (words.length === 1 || style === 'first') return first;
	return `${first} ${words[words.length - 1][0].toUpperCase()}.`;
}
