// 24-hour ("14:05") or 12-hour ("2:05pm") times on the screen. Like the language and the
// temperature unit, a module-level setting that renderLayout() switches on for one render.
import { isJa } from './i18n';

export type Clock = '24' | '12';
export const isClock = (v: unknown): v is Clock => v === '24' || v === '12';

let current: Clock = '24';
export const getClock = (): Clock => current;
export function setClock(c: Clock): void {
	current = c;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// A time of day: "14:05" / "2:05pm" (Japanese: "午後2:05")
export function timeText(hour: number, min: number): string {
	hour = ((hour % 24) + 24) % 24;
	if (current === '24') return `${pad2(hour)}:${pad2(min)}`;
	const h = hour % 12 || 12;
	if (isJa()) return `${hour < 12 ? '午前' : '午後'}${h}:${pad2(min)}`;
	return `${h}:${pad2(min)}${hour < 12 ? 'am' : 'pm'}`;
}

// Just the clock digits, no am/pm: "14:05" / "2:05". For places the label already says it
// (Sunrise, Sunset), where the full 12-hour time doesn't fit.
export function shortTime(hour: number, min: number): string {
	hour = ((hour % 24) + 24) % 24;
	return current === '24' ? `${pad2(hour)}:${pad2(min)}` : `${hour % 12 || 12}:${pad2(min)}`;
}

const split = (m: number) => {
	m = ((Math.round(m) % 1440) + 1440) % 1440;
	return [Math.floor(m / 60), m % 60] as const;
};

// Minutes since midnight as a time: 845 -> "14:05" / "2:05pm"
export const minutesText = (m: number): string => timeText(...split(m));
export const minutesShort = (m: number): string => shortTime(...split(m));

// A span of time: "14:00 - 15:00" / "2:00 - 3:00pm" (am/pm once when both halves share it)
export function rangeText(a: number, b: number): string {
	const [ah, am] = split(a);
	const [bh, bm] = split(b);
	if (current === '24' || ah < 12 !== bh < 12) return `${timeText(ah, am)} - ${timeText(bh, bm)}`;
	if (isJa()) return `${timeText(ah, am)}-${shortTime(bh, bm)}`;
	return `${shortTime(ah, am)} - ${timeText(bh, bm)}`;
}

// An hour on a time axis: "14:00" / "2pm". In Japanese "2時", with 午前/午後 only on the
// first label and at noon and midnight (`first`), so the labels stay narrow.
export function hourText(hour: number, first = false): string {
	hour = ((hour % 24) + 24) % 24;
	if (current === '24') return `${pad2(hour)}:00`;
	const h = hour % 12 || 12;
	if (isJa()) return `${first || hour % 12 === 0 ? (hour < 12 ? '午前' : '午後') : ''}${h}時`;
	return `${h}${hour < 12 ? 'am' : 'pm'}`;
}
