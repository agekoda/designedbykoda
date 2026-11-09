// How long a charge lasts. Two answers:
//   - estimate(): from the settings (layout, refresh rate, schedule), using the numbers in BATTERY.
//   - measured(): from what this calendar's battery has actually done since its last charge.
// The dashboard shows the first while you change settings, and the second once there's enough data.
import { batteryPercent } from './battery';
import { activeStyle, changesPerDay, type Schedule } from './schedule';
import { checksPerDay } from '../messages';

// ---- tune these to the real hardware ----
// 102025 cell, rated 450 mAh; the cells measured hold 520-545 mAh, so 520 is used.
// Sleep current 100 uA. With these, a calendar that updates once a day lasts about 5 months,
// in line with the 5-6 months a charge lasts in real use.
// To retune: sleepMahPerDay = sleep current (mA) x 24, and
// wakeMah = average current while awake (mA) x seconds awake / 3600.
export const BATTERY = {
	capacityMah: 520,
	usable: 0.9, // the share of the capacity used before the calendar asks for a charge
	sleepMahPerDay: 2.4, // 100 uA asleep
	wakeMah: 0.3, // one wake: Wi-Fi, download, full e-ink refresh (~10 s at ~100 mA)
	pressesPerDay: 1, // button presses we assume, on average
	liveEdgesPerDay: 6, // extra wakes for a "Free or busy" screen (meetings starting and ending)
	timelineHours: 10, // hours a day an hourly Timeline is awake for (it sleeps overnight)
};

export interface UsageInput {
	style: string;
	refreshSec: number;
	schedule?: Schedule | null;
	live?: boolean; // the custom design has a "Free or busy" widget
	msgCheck?: number; // seconds between checks for new messages (0 / missing = none)
}

function wakesFor(style: string, refreshSec: number, live: boolean): number {
	let n = 1; // midnight
	if (style === 'timeline' && refreshSec < 86400) n += Math.ceil((BATTERY.timelineHours * 3600) / refreshSec);
	if ((style === 'custom' && live) || style === 'room' || style === 'nameplate') n += BATTERY.liveEdgesPerDay;
	return n;
}

export function wakesPerDay(u: UsageInput): number {
	const live = !!u.live;
	let n: number;
	if (u.schedule?.on && u.schedule.slots.length) {
		// weight each screen by how much of the week it is on, sampled every 15 minutes
		const share = new Map<string, number>();
		const base = Date.UTC(2026, 0, 4) / 1000; // a Sunday
		const steps = (7 * 24 * 60) / 15;
		for (let i = 0; i < steps; i++) {
			const s = activeStyle(u.schedule, u.style, base + i * 900);
			share.set(s, (share.get(s) ?? 0) + 1 / steps);
		}
		n = 0;
		for (const [s, f] of share) n += f * wakesFor(s, u.refreshSec, live);
		n += changesPerDay(u.schedule, u.style);
	} else n = wakesFor(u.style, u.refreshSec, live);
	return n + checksPerDay(u.msgCheck ?? 0) + BATTERY.pressesPerDay;
}

// Days a full charge lasts with these settings.
export function estimate(u: UsageInput): number {
	const perDay = BATTERY.sleepMahPerDay + wakesPerDay(u) * BATTERY.wakeMah;
	return (BATTERY.capacityMah * BATTERY.usable) / perDay;
}

// From real readings: days left, and days a full charge lasts at this rate. Needs two days and a
// 3% drop since the last charge, so a fresh charge doesn't give a silly answer.
export function measured(anchorMv: number | null, anchorAt: number | null, nowMv: number | null, nowAt: number | null): { left: number; full: number } | null {
	if (!anchorMv || !anchorAt || !nowMv || !nowAt) return null;
	const days = (nowAt - anchorAt) / 86400;
	const drop = batteryPercent(anchorMv / 1000) - batteryPercent(nowMv / 1000);
	if (days < 2 || drop < 3) return null;
	const perDay = drop / days;
	return { left: batteryPercent(nowMv / 1000) / perDay, full: 100 / perDay };
}

// "about 3 weeks", "about 7 months", "over a year"
export function lifeText(days: number): string {
	if (!Number.isFinite(days) || days <= 0) return 'less than a day';
	if (days < 1.5) return 'about a day';
	if (days < 13) return `about ${Math.round(days)} days`;
	if (days < 60) return `about ${Math.round(days / 7)} weeks`;
	if (days < 365) return `about ${Math.round(days / 30.4)} months`;
	return 'over a year';
}
