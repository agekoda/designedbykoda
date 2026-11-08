// Which screen a device shows on this wake: its main layout, the schedule's choice, or a screen
// someone flipped to with the button. Also remembers what was shown and when the device should
// wake next, which is how a button press is recognised without any firmware change: a wake that
// comes well before the time the server asked for must have been the button (or a power-on).
//
// All columns come from schema-screens.sql. If it hasn't been run, every query here fails
// quietly and the device simply shows its main layout, exactly as before.
import { isStyleId } from '../data/calendarStyles';
import { activeStyle, cycleList, nextInCycle, sanitizeSchedule, secondsToNextChange, type Schedule } from './eink/schedule';

const EARLY = 90; // a wake this many seconds before the asked-for time counts as early
const RETRY = 20; // ...unless the last one was this recent (a quick retry after a failed download)

export interface ScreenPick {
	style: string;
	pressed: boolean;
	// seconds until the schedule (or a flipped-to screen running out) changes the picture, or null
	changeIn: number | null;
	save: (db: any, sleepSec: number) => Promise<void>;
}

export async function pickScreen(
	db: any,
	deviceId: string,
	mainStyle: string,
	nowLocal: number,
	nowUnix: number,
	wake: string | null // optional ?w= from newer firmware: 'b' button, 't' timer, 'p' power-on
): Promise<ScreenPick> {
	const plain: ScreenPick = { style: mainStyle, pressed: false, changeIn: null, save: async () => {} };
	let row: any;
	try {
		row = await db
			.prepare('SELECT schedule, screen_override, override_until, next_wake_at, shown_style, press_skip, last_seen_at FROM devices WHERE id = ?')
			.bind(deviceId)
			.first();
	} catch {
		return plain; // schema-screens.sql not run yet
	}
	if (!row) return plain;

	const sch: Schedule = sanitizeSchedule(row.schedule, isStyleId);
	const scheduled = activeStyle(sch, mainStyle, nowLocal);
	const pressed =
		wake === 'b' ||
		(wake === null &&
			typeof row.next_wake_at === 'number' &&
			nowUnix < row.next_wake_at - EARLY &&
			(typeof row.last_seen_at !== 'number' || nowUnix - row.last_seen_at > RETRY));

	let override: string | null = isStyleId(row.screen_override) ? row.screen_override : null;
	let until: number | null = typeof row.override_until === 'number' ? row.override_until : null;
	if (override && until !== null && nowUnix >= until) override = until = null; // ran out
	let skip = row.press_skip === 1;
	let style = override ?? scheduled;

	if (pressed && skip) {
		// The first press after saving in the dashboard shows the saved settings, not the next screen.
		skip = false;
		override = until = null;
		style = scheduled;
	} else if (pressed && sch.button === 'next') {
		const list = cycleList(sch, mainStyle);
		const from = isStyleId(row.shown_style) && list.includes(row.shown_style) ? row.shown_style : style;
		const next = nextInCycle(list, from);
		const changeSec = secondsToNextChange(sch, mainStyle, nowLocal);
		if (next === scheduled) override = until = null;
		else {
			override = next;
			// stays until the schedule next changes, or (with no schedule) until the next press
			until = changeSec !== null ? nowUnix + changeSec : null;
		}
		style = next;
	}

	const changeIn = override && until !== null ? until - nowUnix : override ? null : secondsToNextChange(sch, mainStyle, nowLocal);

	return {
		style,
		pressed,
		changeIn,
		save: async (dbx, sleepSec) => {
			try {
				await dbx
					.prepare('UPDATE devices SET shown_style = ?, next_wake_at = ?, screen_override = ?, override_until = ?, press_skip = ? WHERE id = ?')
					.bind(style, nowUnix + Math.max(30, Math.round(sleepSec)), override, until, skip ? 1 : 0, deviceId)
					.run();
			} catch {}
		},
	};
}

// The next time a meeting starts or ends (for the "Free or busy" widget), in seconds from now.
export function secondsToNextEventEdge(events: { startLocal: number; endLocal?: number; allDay: boolean }[], nowLocal: number): number | null {
	let best: number | null = null;
	for (const e of events) {
		if (e.allDay) continue;
		for (const t of [e.startLocal, e.endLocal ?? e.startLocal + 1800]) {
			const dt = t - nowLocal;
			if (dt > 30 && (best === null || dt < best)) best = dt;
		}
	}
	return best;
}

// After settings are saved in the dashboard: forget any screen flipped to with the button, and
// make the next press show the saved settings rather than flipping on.
export async function markSaved(db: any, deviceId: string): Promise<void> {
	try {
		await db.prepare('UPDATE devices SET press_skip = 1, screen_override = NULL, override_until = NULL WHERE id = ?').bind(deviceId).run();
	} catch {}
}
