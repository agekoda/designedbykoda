// The endpoint a device hits on every wake cycle. Handles: verifying the
// device's own secret, refreshing the user's Google access token if
// needed, computing "today" correctly in the user's actual timezone
// (handling DST automatically via Intl, which an ESP32 could never do on
// its own), and returning a small, pre-formatted payload.
import { viewForStyle, LIVE_STYLES, isRefreshSec, renderStyleOf } from '../../../../data/calendarStyles';
import { sanitizeReminders, type Reminder } from '../../../../lib/eink/reminders';
import { sanitizeHabits, type Habit } from '../../../../lib/eink/habits';
import { isAway, quietSleep, sanitizeDayCfg, secondsUntilBack } from '../../../../lib/eink/dayCfg';
import { dueSoon } from '../../../../lib/eink/school';
import { designIdOf, getDesign } from '../../../../lib/designs';
import { timelineSleep } from '../../../../lib/eink/layouts/timeline';
import { getForecast, type Forecast } from '../../../../lib/weather';
import { renderLayout } from '../../../../lib/eink/layouts';
import { b64ToBytes, decodePic, FRAME_BYTES } from '../../../../lib/eink/image';
import { fetchTasks } from '../../../../lib/tasks';
import { isSignStyle, builtinLayout, layoutNeeds, LIVE_SIGNS, CAL_SIGNS, sanitizeSign, sanitizeLayout, type CustomLayout } from '../../../../lib/eink/builder/model';
import { pickScreen, secondsToNextEventEdge } from '../../../../lib/screens';
import { activeMessages, sanitizeCfg, secondsToNextCheck, secondsToNextExpiry } from '../../../../lib/messages';
export const prerender = false;
import { NO_GOOGLE } from '../../../../lib/googleCals';
import { sanitizeDeco, type FrameDeco } from '../../../../lib/eink/festive';
import { getStatus, activeStatus } from '../../../../lib/deskStatus';
import { fetchBirthdays, mergeBirthdays, type Birthday } from '../../../../lib/birthdays';
import { connectFor, type Connected } from '../../../../lib/connect';

function getCookielessAuthSecret(request: Request): string | null {
	const header = request.headers.get('Authorization') || '';
	const match = header.match(/^Bearer (.+)$/);
	return match ? match[1] : null;
}

// How many seconds to add to UTC to get local time in this IANA timezone,
// for a specific instant — computed via Intl rather than a bundled tz
// database, so DST is handled correctly automatically.
function getUtcOffsetSeconds(timeZone: string, date: Date): number {
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	const parts = dtf.formatToParts(date).reduce((acc: any, p) => {
		acc[p.type] = p.value;
		return acc;
	}, {});
	const asUTC = Date.UTC(
		+parts.year,
		+parts.month - 1,
		+parts.day,
		+parts.hour,
		+parts.minute,
		+parts.second
	);
	return Math.round((asUTC - date.getTime()) / 1000);
}

// Returns the UTC instant for local midnight "today" (in the given
// timezone) through the following midnight — this is what gets sent to
// Google Calendar as timeMin/timeMax.
function getTodayRangeUTC(timeZone: string, now: Date) {
	const offsetSec = getUtcOffsetSeconds(timeZone, now);
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const parts = dtf.formatToParts(now).reduce((acc: any, p) => {
		acc[p.type] = p.value;
		return acc;
	}, {});
	// Local wall-clock midnight, converted to the UTC instant it actually
	// represents (local = UTC + offset, so UTC = local - offset).
	const localMidnightUTCMs =
		Date.UTC(+parts.year, +parts.month - 1, +parts.day, 0, 0, 0) - offsetSec * 1000;
	return {
		start: new Date(localMidnightUTCMs),
		end: new Date(localMidnightUTCMs + 24 * 60 * 60 * 1000),
		offsetSec,
	};
}

// Seconds until the next refresh boundary (top of the hour for hourly devices,
// local midnight otherwise), in the user's own timezone. The firmware used to
// work this out itself from an NTP clock; now the server does, which saves the
// device a network round trip on every wake. Never less than 30s so a device
// that wakes a moment early can't loop.
function secondsUntilNextRefresh(nowLocal: number, intervalSec: number): number {
	const secsIntoDay = ((nowLocal % 86400) + 86400) % 86400;
	const raw = intervalSec <= 3600 ? 3600 - (secsIntoDay % 3600) : 86400 - secsIntoDay;
	return Math.max(30, raw);
}

// School week: once a day at midnight, or every 1 / 2 / 4 / 12 hours from 7 am to 5 pm (the "now"
// bar moves), asleep overnight apart from the midnight wake.
function timetableSleep(nowLocal: number, intervalSec: number): number {
	const s = ((nowLocal % 86400) + 86400) % 86400;
	const toMidnight = 86400 - s;
	if (intervalSec >= 86400) return Math.max(30, toMidnight);
	const start = 7 * 3600, end = 17 * 3600;
	if (s < start) return Math.max(30, start - s);
	if (s >= end) return Math.max(30, toMidnight);
	const next = start + (Math.floor((s - start) / intervalSec) + 1) * intervalSec;
	return Math.max(30, Math.min(next, end) - s);
}

export async function GET({ params, request, locals }) {
	const env = locals.runtime?.env ?? {};
	const reqUrl = new URL(request.url);
	// ?p=2 means the firmware draws whatever list the server sends (see
	// src/lib/eink/draw.ts). Without it, the older JSON reply below is sent, so
	// devices still on the old firmware keep working.
	const proto = reqUrl.searchParams.get('p');
	const db = env.DB;
	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	const encryptionKey = env.TOKEN_ENCRYPTION_KEY;
	if (!db || !clientId || !clientSecret || !encryptionKey) {
		return json({ error: 'Server is not fully configured yet.' }, 500);
	}

	const deviceId = params.id;
	const providedSecret = getCookielessAuthSecret(request);
	if (!deviceId || !providedSecret) {
		return json({ error: 'Missing device credentials.' }, 401);
	}

	const { hashSecret, decryptToken } = await import('../../../../lib/crypto');
	const providedHash = await hashSecret(providedSecret);

	const device = await db
		.prepare(
			`SELECT id, device_secret_hash, user_id, refresh_interval_sec, cached_access_token, cached_token_expiry
			 FROM devices WHERE id = ?`
		)
		.bind(deviceId)
		.first();

	if (!device || device.device_secret_hash !== providedHash) {
		return json({ error: 'Invalid device credentials.' }, 401);
	}
	if (!device.user_id) {
		// A specific, distinct error the firmware can check for — this is
		// the "show the pairing code again" case, not a generic failure.
		// Also sends the code the device should be showing: after an
		// unpair, or once the original code has expired, the device's own
		// stored copy is stale, so it gets a current one here.
		let pairingCode: string | null = null;
		try {
			const nowS = Math.floor(Date.now() / 1000);
			const row = await db
				.prepare('SELECT pairing_code, pairing_code_expires_at FROM devices WHERE id = ?')
				.bind(deviceId)
				.first();
			// A calendar waiting to be paired only checks in about once a day, so the code it shows
			// must last until its next check-in: hand it a fresh one once there are under 30 hours left (a day, plus room for its clock drifting).
			if (row?.pairing_code && row.pairing_code_expires_at > nowS + 30 * 3600) {
				pairingCode = row.pairing_code;
			} else {
				const { issuePairingCode } = await import('../../../../lib/pairing');
				pairingCode = await issuePairingCode(db, deviceId, nowS);
			}
		} catch {}
		return json({ error: 'not_paired', pairingCode }, 403);
	}

	const user = await db
		.prepare('SELECT encrypted_refresh_token, selected_calendar_ids, timezone FROM users WHERE id = ?')
		.bind(device.user_id)
		.first();
	if (!user) {
		return json({ error: 'Linked account no longer exists.' }, 404);
	}

	const now = Math.floor(Date.now() / 1000);

	// The timezone is whatever Google Calendar itself says the account is in
	// (the `timeZone` field on every events response), so the device always
	// matches what the person sees in Google Calendar, wherever they are in
	// the world. The value saved at setup (from the browser) is only the
	// fallback if Google doesn't report one.
	const rightNow = new Date();

	let calendarIds: string[];
	try {
		calendarIds = JSON.parse(user.selected_calendar_ids || '[]');
	} catch {
		calendarIds = [];
	}
	// Per-device settings (set on the device dashboard) win over the
	// account-level ones. Separate query so a missing column (migration not
	// run yet) just means "use the account's".
	let deviceStyle: string | null = null;
	try {
		const ds = await db
			.prepare('SELECT calendar_style, selected_calendar_ids FROM devices WHERE id = ?')
			.bind(deviceId)
			.first();
		deviceStyle = ds?.calendar_style || null;
		const own = JSON.parse(ds?.selected_calendar_ids || '[]');
		if (Array.isArray(own) && own.length) calendarIds = own;
	} catch {}
	if (calendarIds.length === 0) calendarIds = ['primary'];
	// "-" on its own means no Google calendars at all: only timetables and other calendar links.
	calendarIds = calendarIds.filter((id) => id !== NO_GOOGLE);

	// A Google access token, fetched only when something needs Google (its calendars, or Tasks for
	// the to-do list). Reuse the cached one if it's still good for at least another minute;
	// otherwise refresh it and cache the new one on this device row.
	let accessToken = '';
	const googleToken = async (): Promise<Response | null> => {
		if (accessToken) return null;
		if (device.cached_access_token && device.cached_token_expiry > now + 60) {
			accessToken = device.cached_access_token;
			return null;
		}
		const refreshToken = await decryptToken(user.encrypted_refresh_token, encryptionKey);
		const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				refresh_token: refreshToken,
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'refresh_token',
			}),
		});
		if (!tokenRes.ok) {
			const errText = await tokenRes.text();
			// A revoked/expired refresh token surfaces here — worth its own
			// distinct error so the firmware (and later, the dashboard) can
			// tell "reconnect your Google account" apart from a generic failure.
			if (errText.includes('invalid_grant')) return json({ error: 'reauth_required' }, 403);
			return json({ error: `Token refresh failed: ${errText}` }, 502);
		}
		const tokenData = await tokenRes.json();
		accessToken = tokenData.access_token;
		const newExpiry = now + (tokenData.expires_in || 3600);
		await db
			.prepare('UPDATE devices SET cached_access_token = ?, cached_token_expiry = ? WHERE id = ?')
			.bind(accessToken, newExpiry, deviceId)
			.run();
		return null;
	};

	console.log(
		`Fetching for device ${deviceId}: calendars=${JSON.stringify(calendarIds)} savedTimezone=${user.timezone} from ${rightNow.toISOString()} onward`
	);

	// Which layout the person picked in setup. Separate query + try/catch so
	// a missing column (migration not run yet) falls back to Agenda instead
	// of breaking every device.
	let style = 'agenda';
	try {
		const row = await db.prepare('SELECT calendar_style FROM users WHERE id = ?').bind(device.user_id).first();
		if (row?.calendar_style) style = row.calendar_style;
	} catch {}
	if (deviceStyle) style = deviceStyle;

	// The screen schedule and the button (schema-screens.sql): the main layout above may give way
	// to a scheduled one, or to one picked with the button. Uses the saved timezone, since Google's
	// isn't known until the events come back, and the layout decides which events to ask for.
	let tzPick = 'UTC';
	try {
		if (user.timezone) {
			new Intl.DateTimeFormat('en-US', { timeZone: user.timezone });
			tzPick = user.timezone;
		}
	} catch {}
	const screens = await pickScreen(db, deviceId, style, Math.floor(rightNow.getTime() / 1000) + getUtcOffsetSeconds(tzPick, rightNow), now, reqUrl.searchParams.get('w'));
	style = screens.style;
	// Away mode and quiet hours (schema-school.sql). Away takes over the whole screen.
	let dayCfg = sanitizeDayCfg(null);
	try {
		const dq = await db.prepare('SELECT day_cfg FROM devices WHERE id = ?').bind(deviceId).first();
		dayCfg = sanitizeDayCfg(dq?.day_cfg);
	} catch {}
	const away = isAway(dayCfg, Math.floor(rightNow.getTime() / 1000) + getUtcOffsetSeconds(tzPick, rightNow));
	if (away) style = 'away';

	// The message board (schema-messages.sql): messages showing now, and how often to check for new ones.
	let msgCfg = sanitizeCfg(null);
	try {
		const mc = await db.prepare('SELECT msg_cfg FROM devices WHERE id = ?').bind(deviceId).first();
		msgCfg = sanitizeCfg(mc?.msg_cfg);
	} catch {}
	const msgs = proto === '2' ? await activeMessages(db, deviceId, now) : [];

	// How often this calendar wakes: only the Timeline can wake more than once a day.
	const intervalSec = LIVE_STYLES.includes(style) && isRefreshSec(device.refresh_interval_sec) ? device.refresh_interval_sec : 86400;

	// The Timeline shows the WHOLE of today, including events that already finished, so it
	// asks Google from local midnight. A wake a few minutes before midnight (a fast timer)
	// counts as already tomorrow. Everything else asks "from right now onwards".
	let effNowMs = rightNow.getTime();
	let fetchFrom = rightNow;
	if (style === 'timeline' || style === 'tomorrow') {
		let tzGuess = 'UTC';
		try {
			if (user.timezone) {
				new Intl.DateTimeFormat('en-US', { timeZone: user.timezone });
				tzGuess = user.timezone;
			}
		} catch {}
		const offGuess = getUtcOffsetSeconds(tzGuess, rightNow);
		const intoDay = ((((effNowMs / 1000 + offGuess) % 86400) + 86400) % 86400);
		if (intoDay > 86400 - 600) effNowMs += 600 * 1000;
		fetchFrom = getTodayRangeUTC(tzGuess, new Date(effNowMs)).start;
	}
	// School week: from Monday (the whole week shows, past days too).
	if (style === 'timetable') {
		const off = getUtcOffsetSeconds(tzPick, rightNow);
		const localDay = Math.floor((rightNow.getTime() / 1000 + off) / 86400);
		const wd = new Date(localDay * 86400000).getUTCDay();
		const monday = wd === 6 ? localDay + 2 : wd === 0 ? localDay + 1 : localDay - (wd - 1);
		fetchFrom = new Date((monday * 86400 - off) * 1000);
	}

	const rawEvents: { title: string; ms: number; allDay: boolean; dateOnly?: string; endMs?: number; endDateOnly?: string; name?: string; room?: string; moved?: boolean; bring?: string }[] = [];
	let googleTz: string | null = null;

	// Meeting room and Waiting room can have their own calendars (chosen with the sign in Settings),
	// used instead of the usual ones, so a work calendar never mixes with home and back again.
	let onlyFeeds: string[] | null = null;
	if ((CAL_SIGNS as readonly string[]).includes(style)) {
		try {
			const r = await db.prepare('SELECT sign_cfg FROM devices WHERE id = ?').bind(deviceId).first();
			const own = (sanitizeSign(r?.sign_cfg ?? null) as any)[style]?.cals as string[] | undefined;
			if (own?.length) {
				calendarIds = own.filter((c) => !c.startsWith('feed:'));
				onlyFeeds = own.filter((c) => c.startsWith('feed:')).map((c) => c.slice(5));
			}
		} catch {}
	}
	if (calendarIds.length) {
		const fail = await googleToken();
		if (fail) return fail;
	}

	for (const calId of calendarIds) {
		const eventsUrl = new URL(
			`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`
		);
		eventsUrl.searchParams.set('timeMin', fetchFrom.toISOString());
		// No timeMax — maxResults + orderBy=startTime is what actually
		// gives us "the next N upcoming events", regardless of how many
		// days out they fall.
		eventsUrl.searchParams.set('maxResults', style === 'timetable' || style === 'tomorrow' ? '40' : '15');
		eventsUrl.searchParams.set('singleEvents', 'true');
		eventsUrl.searchParams.set('orderBy', 'startTime');

		const evRes = await fetch(eventsUrl.toString(), {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!evRes.ok) {
			// Don't sink the whole response over one bad/inaccessible
			// calendar — but log it, since silently returning zero events
			// with no trace of why is exactly what made this hard to debug.
			const errBody = await evRes.text();
			console.error(`Calendar fetch failed for "${calId}": HTTP ${evRes.status} — ${errBody}`);
			continue;
		}

		const evData = await evRes.json();
		// Prefer the primary calendar's timezone; otherwise the first one
		// Google tells us about.
		if (evData.timeZone && (calId === 'primary' || !googleTz)) googleTz = evData.timeZone;
		const itemCount = (evData.items || []).length;
		console.log(`Calendar "${calId}": Google returned ${itemCount} raw item(s)`);
		for (const item of evData.items || []) {
			const isAllDay = !item.start?.dateTime;
			const startValue = item.start?.dateTime || item.start?.date;
			if (!startValue || !item.summary) {
				console.log(`Skipped an item on "${calId}" — missing start or summary: ${JSON.stringify(item.start)} / "${item.summary}"`);
				continue;
			}
			rawEvents.push({
				title: item.summary,
				ms: new Date(startValue).getTime(),
				allDay: isAllDay,
				dateOnly: isAllDay ? startValue : undefined,
				endMs: !isAllDay && item.end?.dateTime ? new Date(item.end.dateTime).getTime() : undefined,
				endDateOnly: isAllDay ? item.end?.date : undefined,
			});
		}
	}

	// School timetables and other calendar links or files (src/lib/feeds.ts), alongside Google's.
	try {
		const { allFeedEvents } = await import('../../../../lib/feeds');
		for (const e of await allFeedEvents(db, deviceId, tzPick, rightNow.getTime(), fetchFrom.getTime(), onlyFeeds)) rawEvents.push(e);
	} catch (err) {
		console.error('Extra calendars failed:', err);
	}

	// Settle on a valid timezone: Google's, else the saved one, else UTC.
	const isValidTz = (tz: unknown): tz is string => {
		if (typeof tz !== 'string' || !tz) return false;
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: tz });
			return true;
		} catch {
			return false;
		}
	};
	const timezone = isValidTz(googleTz) ? googleTz : isValidTz(user.timezone) ? user.timezone : 'UTC';
	if (isValidTz(googleTz) && googleTz !== user.timezone) {
		// Keep our copy in sync (e.g. they moved country or changed it in Google).
		await db.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(googleTz, device.user_id).run();
	}
	const offsetSec = getUtcOffsetSeconds(timezone, rightNow);

	// `startUnix` stays the true UTC instant (older firmware adds utcOffsetSec
	// itself). `startLocal` is the same moment as local wall-clock time, using
	// the offset in force AT THAT EVENT, so events after a daylight-saving
	// change still show the right hour. All-day events are pinned to their
	// calendar date's midnight so they land on the right day in every zone.
	const allEvents = rawEvents.map((e) => {
		const startUnix = Math.floor(e.ms / 1000);
		const startLocal = e.allDay
			? Math.floor(Date.parse(`${e.dateOnly}T00:00:00Z`) / 1000)
			: startUnix + getUtcOffsetSeconds(timezone, new Date(e.ms));
		let endLocal: number | undefined;
		if (e.allDay) {
			if (e.endDateOnly) endLocal = Math.floor(Date.parse(`${e.endDateOnly}T00:00:00Z`) / 1000);
		} else if (e.endMs && e.endMs > e.ms) {
			endLocal = Math.floor(e.endMs / 1000) + getUtcOffsetSeconds(timezone, new Date(e.endMs));
		}
		return { title: e.title, startUnix, startLocal, allDay: e.allDay, endLocal, name: e.name, room: e.room, moved: e.moved, bring: e.bring };
	});

	allEvents.sort((a, b) => a.startUnix - b.startUnix);
	// Merging multiple calendars can exceed 15 combined even though each
	// was capped individually — trim to the final cap here, after sorting,
	// so we keep the chronologically-soonest ones across all calendars
	// rather than e.g. all of one calendar's 15 and none of another's.
	const trimmedEvents = allEvents.slice(0, style === 'timetable' ? 150 : style === 'tomorrow' ? 60 : 15);
	console.log(`Total events after merging all calendars: ${allEvents.length}, sending ${trimmedEvents.length}`);


	// Optional weather: today's high/low for the location chosen in setup.
	// Never lets a weather problem break the calendar response.
	let weather: Forecast | null = null;
	let place: { lat: number; lon: number } | null = null; // also used by Moon & Sun
	try {
		const loc = await db.prepare('SELECT weather_lat, weather_lon FROM devices WHERE id = ?').bind(deviceId).first();
		if (loc && loc.weather_lat !== null && loc.weather_lon !== null) {
			place = { lat: loc.weather_lat, lon: loc.weather_lon };
			weather = await getForecast(db, loc.weather_lat, loc.weather_lon);
		}
	} catch {}

	// Your own design (layout builder, schema-builder.sql). Which widgets it holds decides what else we fetch.
	let customLayout: CustomLayout | null = null;
	if (style === 'custom' && proto === '2') {
		try {
			const r = await db.prepare('SELECT custom_layout FROM devices WHERE id = ?').bind(deviceId).first();
			customLayout = r?.custom_layout ? sanitizeLayout(r.custom_layout) : null;
		} catch {}
	}
	// One of Your designs (schema-designs.sql): "design:<id>".
	const designId = designIdOf(style);
	if (designId && proto === '2') customLayout = (await getDesign(db, deviceId, designId))?.layout ?? null;
	const needs = style === 'planner' ? { ...layoutNeeds(null), tasks: true } : layoutNeeds(builtinLayout(style, null) ?? customLayout);
	// Meeting room and Desk name plate show free / busy, so they wake when meetings start and end.
	if (LIVE_SIGNS.includes(style)) needs.live = true;
	// The words on a sign (schema-screens.sql).
	// Repeating reminders (schema-reminders.sql).
	let reminders: Reminder[] = [];
	try {
		const rq = await db.prepare('SELECT reminders FROM devices WHERE id = ?').bind(deviceId).first();
		reminders = sanitizeReminders(rq?.reminders);
	} catch {}
	// Habits (schema-habits.sql).
	let habits: Habit[] = [];
	try {
		const hq = await db.prepare('SELECT habits FROM devices WHERE id = ?').bind(deviceId).first();
		habits = sanitizeHabits(hq?.habits);
	} catch {}
	let sign: unknown = null;
	if (isSignStyle(style)) {
		try {
			const r = await db.prepare('SELECT sign_cfg FROM devices WHERE id = ?').bind(deviceId).first();
			sign = r?.sign_cfg ?? null;
		} catch {}
	}

	// To-do: the person's Google Tasks (only fetched when that layout, or a to-do widget, is used).
	let tasks: { title: string; done: boolean; due?: string }[] | null = null;
	let tasksState: 'ok' | 'needs_permission' | 'error' = 'ok';
	if ((style === 'todo' || needs.tasks) && proto === '2') {
		if (await googleToken()) tasksState = 'error';
		else {
			const r = await fetchTasks(accessToken, rightNow.getTime());
			tasks = r.tasks;
			tasksState = r.state;
		}
	}

	// Birthdays widget: Google contacts' birthdays, plus any "… birthday" on the calendars read
	let birthdays: Birthday[] = [];
	if (needs.birthdays && proto === '2') {
		const g = (await googleToken()) ? [] : await fetchBirthdays(accessToken, calendarIds, rightNow.getTime(), 62, offsetSec);
		birthdays = mergeBirthdays(g, allEvents);
	}

	// Connections: YouTube, headlines, GitHub, prices, tides, UV (src/lib/connect.ts). Each is cached
	// for everyone, and one that fails just shows a note on its widget.
	let connect: Connected | null = null;
	// (a ready-made YouTube, GitHub, Headlines, Money & crypto or Beach screen fetches the same way)
	const built = builtinLayout(style, sign);
	if (proto === '2' && (built || (needs.connect && customLayout))) connect = await connectFor((built ?? customLayout)!.widgets, place, env);

	// Dark mode (white on black), from schema-darkmode.sql. Its own query so a
	// missing column never affects anything else.
	let dark = false;
	try {
		const dm = await db.prepare('SELECT dark_mode FROM devices WHERE id = ?').bind(deviceId).first();
		dark = dm?.dark_mode === 1;
	} catch {}

	// Language of the screen (schema-language.sql). Its own query for the same reason.
	let lang: 'en' | 'ja' = 'en';
	try {
		const lq = await db.prepare('SELECT language FROM devices WHERE id = ?').bind(deviceId).first();
		lang = lq?.language === 'ja' ? 'ja' : 'en';
	} catch {}
	// Which language the Word of the day teaches (added the first time it's saved).
	let wordLang: 'ja' | 'en' | undefined;
	try {
		const wq = await db.prepare('SELECT word_lang FROM devices WHERE id = ?').bind(deviceId).first();
		wordLang = wq?.word_lang === 'ja' || wq?.word_lang === 'en' ? wq.word_lang : undefined;
	} catch {}
	// Celsius or Fahrenheit (schema-screens.sql).
	let unit: 'c' | 'f' = 'c';
	try {
		const uq = await db.prepare('SELECT temp_unit FROM devices WHERE id = ?').bind(deviceId).first();
		unit = uq?.temp_unit === 'f' ? 'f' : 'c';
	} catch {}
	// 12- or 24-hour times (schema-clock.sql).
	let clock: '12' | '24' = '24';
	try {
		const cq = await db.prepare('SELECT clock FROM devices WHERE id = ?').bind(deviceId).first();
		clock = cq?.clock === '12' ? '12' : '24';
	} catch {}

	// The calendar tells us its battery voltage on every refresh (?v=). Save it
	// next to last_seen_at (same write, so no extra work) for the dashboard.
	const vRaw = parseFloat(reqUrl.searchParams.get('v') ?? '');
	const vbat = Number.isFinite(vRaw) && vRaw > 0 && vRaw < 10 ? vRaw : null;
	let seenSaved = false;
	if (vbat !== null) {
		try {
			await db
				.prepare('UPDATE devices SET last_seen_at = ?, battery_mv = ?, battery_at = ? WHERE id = ?')
				.bind(now, Math.round(vbat * 1000), now, deviceId)
				.run();
			seenSaved = true;
		} catch {} // columns come from schema-display.sql; fall back below if not run yet
	}
	if (!seenSaved) await db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(now, deviceId).run();
	// Firmware version (schema-firmware.sql): "1.0.0" style from 1.0 on. Test builds sent a
	// bare number (fw=7, fw=8), kept as "build 8". Written only when it changes.
	const fwRaw = reqUrl.searchParams.get('fw') ?? '';
	const fw = /^\d{1,3}\.\d{1,3}(\.\d{1,3})?$/.test(fwRaw) ? fwRaw : /^\d{1,4}$/.test(fwRaw) ? 'build ' + fwRaw : null;
	if (fw) {
		try {
			await db.prepare('UPDATE devices SET firmware = ? WHERE id = ? AND (firmware IS NULL OR firmware <> ?)').bind(fw, deviceId, fw).run();
		} catch {}
	}
	// Over-the-air update on offer (schema-ota.sql, src/lib/firmware.ts). The calendar decides
	// whether it's safe to install (battery, earlier failures); "Update now" makes it go at once.
	let otaHeaders: Record<string, string> = {};
	try {
		const { offerFor, offerHeaders, channelOf } = await import('../../../../lib/firmware');
		const oq: any = await db.prepare('SELECT fw_channel, update_now_at FROM devices WHERE id = ?').bind(deviceId).first();
		const offer = offerFor(fw, channelOf(oq?.fw_channel), oq?.update_now_at ?? null, now);
		otaHeaders = offerHeaders(offer, `https://${reqUrl.host}`);
		if (!offer && oq?.update_now_at) await db.prepare('UPDATE devices SET update_now_at = NULL WHERE id = ?').bind(deviceId).run();
	} catch {} // before schema-ota.sql: no updates offered
	// Battery life from real use (schema-screens.sql): remember the voltage and time just after a
	// charge, so the dashboard can work out how fast this calendar actually drains.
	if (vbat !== null) {
		try {
			const mv = Math.round(vbat * 1000);
			const b = await db.prepare('SELECT battery_anchor_mv, battery_prev_mv FROM devices WHERE id = ?').bind(deviceId).first();
			const charged = !b?.battery_anchor_mv || (typeof b.battery_prev_mv === 'number' && mv > b.battery_prev_mv + 60);
			if (charged) await db.prepare('UPDATE devices SET battery_anchor_mv = ?, battery_anchor_at = ?, battery_prev_mv = ? WHERE id = ?').bind(mv, now, mv, deviceId).run();
			else await db.prepare('UPDATE devices SET battery_prev_mv = ? WHERE id = ?').bind(mv, deviceId).run();
		} catch {}
	}
	// Battery history (schema-battery.sql): at most one reading every 3 hours, kept for 90 days.
	if (vbat !== null) {
		try {
			const mv = Math.round(vbat * 1000);
			const r = await db
				.prepare('INSERT INTO battery_log (device_id, at, mv) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM battery_log WHERE device_id = ? AND at > ?)')
				.bind(deviceId, now, mv, deviceId, now - 3 * 3600)
				.run();
			if (r?.meta?.changes) await db.prepare('DELETE FROM battery_log WHERE device_id = ? AND at < ?').bind(deviceId, now - 90 * 86400).run();
		} catch {}
	}

	if (proto === '2') {
		// Display options from the customise page (schema-display.sql). One query,
		// and a missing column just means "defaults".
		let fontChoice: string | null = null;
		let cornerImage: Uint8Array | null = null;
		let cornerSize: { w: number; h: number } | null = null;
		try {
			const o = await db
				.prepare("SELECT layout_font, CASE WHEN corner_mode = 'image' THEN corner_bits END AS bits FROM devices WHERE id = ?")
				.bind(deviceId)
				.first();
			fontChoice = o?.layout_font ?? null;
			const pc = decodePic(o?.bits);
			if (pc) {
				cornerImage = pc.bytes;
				cornerSize = { w: pc.w, h: pc.h };
			}
		} catch {}
		// Countdown name + date, and the Photo frame picture (schema-layouts.sql). Only read for those layouts.
		let countdown: { title: string; date: string } | null = null;
		let frameImage: Uint8Array | null = null;
		let frameDeco: FrameDeco | null = null;
		// a status set from a phone for the desk name plate (src/lib/deskStatus.ts)
		const desk = needs.live || isSignStyle(style) ? await getStatus(db, deviceId) : null;
		const deskNow = activeStatus(desk, now);
		try {
			if (style === 'countdown' || needs.countdown) {
				const c = await db.prepare('SELECT countdown_title, countdown_date FROM devices WHERE id = ?').bind(deviceId).first();
				if (c?.countdown_title && c?.countdown_date) countdown = { title: c.countdown_title, date: c.countdown_date };
			} else if (style === 'frame') {
				const f = await db.prepare('SELECT frame_bits FROM devices WHERE id = ?').bind(deviceId).first();
				const bytes = f?.frame_bits ? b64ToBytes(f.frame_bits) : null;
				if (bytes && bytes.length === FRAME_BYTES) frameImage = bytes;
				try {
					const fd = await db.prepare('SELECT frame_deco FROM devices WHERE id = ?').bind(deviceId).first();
					frameDeco = sanitizeDeco(fd?.frame_deco);
				} catch {} // no festive border saved yet
			}
		} catch {}
		const nowLocal = Math.floor(effNowMs / 1000) + offsetSec;
		const screen = renderLayout(renderStyleOf(style), {
			nowLocal,
			events: trimmedEvents.map((e) => ({ title: e.title, startLocal: e.startLocal, allDay: e.allDay, endLocal: e.endLocal, name: e.name, room: e.room, moved: e.moved, bring: e.bring })),
			due: dueSoon(allEvents.map((e) => ({ title: e.title, startLocal: e.startLocal, allDay: e.allDay, endLocal: e.endLocal, name: e.name })), nowLocal),
			away: away ? dayCfg.away : null,
			weather,
			vbat,
			dark,
			lang,
			wordLang,
			unit,
			clock,
			cornerImage,
			cornerSize,
			refreshSec: intervalSec,
			loc: place,
			utcOffsetSec: offsetSec,
			countdown,
			frameImage,
			frameDeco,
			deskStatus: deskNow ? { text: deskNow.text, untilLocal: deskNow.until === null ? null : deskNow.until + offsetSec } : null,
			tasks,
			tasksState,
			custom: customLayout,
			sign,
			messages: msgs.map((m) => ({ author: m.author, body: m.body, atLocal: m.createdAt + offsetSec })),
			reminders,
			habits,
			birthdays,
			connect,
		}, fontChoice ?? undefined);
		// How long to sleep: the layout's own answer, but wake sooner for a scheduled screen change,
		// and (for a "Free or busy" widget) when a meeting starts or ends.
		const evs = trimmedEvents.map((e) => ({ title: e.title, startLocal: e.startLocal, allDay: e.allDay, endLocal: e.endLocal }));
		let sleepSec = style === 'timeline' ? timelineSleep(nowLocal, evs, intervalSec) : style === 'timetable' ? timetableSleep(nowLocal, intervalSec) : secondsUntilNextRefresh(nowLocal, 86400);
		if (screens.changeIn !== null) sleepSec = Math.min(sleepSec, Math.max(30, screens.changeIn));
		if (needs.live) {
			const edge = secondsToNextEventEdge(evs, nowLocal);
			if (edge !== null) sleepSec = Math.min(sleepSec, Math.max(120, edge + 30));
		}
		// wake to look for new messages, and to take one off the screen when it runs out
		const check = secondsToNextCheck(msgCfg.check, nowLocal);
		if (check !== null) sleepSec = Math.min(sleepSec, Math.max(60, check));
		// with a desk status link: look for a new status every so often in the day, and wake when one runs out
		if (desk) {
			const c = secondsToNextCheck(desk.check, nowLocal);
			if (c !== null) sleepSec = Math.min(sleepSec, Math.max(60, c));
			if (deskNow?.until) sleepSec = Math.min(sleepSec, Math.max(60, deskNow.until - now + 5));
		}
		const expiry = secondsToNextExpiry(msgs, now);
		if (expiry !== null) sleepSec = Math.min(sleepSec, Math.max(60, expiry + 5));
		// School day switches to tomorrow at 6 pm
		if (style === 'tomorrow') {
			const into = ((nowLocal % 86400) + 86400) % 86400;
			if (into < 18 * 3600) sleepSec = Math.min(sleepSec, 18 * 3600 - into + 30);
		}
		if (away) sleepSec = Math.min(2 * 86400, secondsUntilBack(dayCfg, nowLocal));
		else sleepSec = quietSleep(dayCfg, nowLocal, sleepSec);
		await screens.save(db, sleepSec);
		// X-Unchanged: 1 when this is exactly what the screen already shows, so firmware that
		// knows the header can skip redrawing (no flash when a message check finds nothing new).
		let unchanged = false;
		try {
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(screen));
			const hash = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
			const prev = await db.prepare('SELECT last_hash FROM devices WHERE id = ?').bind(deviceId).first();
			unchanged = prev?.last_hash === hash;
			if (!unchanged) await db.prepare('UPDATE devices SET last_hash = ? WHERE id = ?').bind(hash, deviceId).run();
		} catch {}
		return new Response(screen, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-store',
				// "1" on the midnight wake (the first half hour of the local day, or a few
				// minutes before it for a fast timer): the firmware then does the long ghost-removing
				// refresh whether or not the picture changed.
				'X-Full': (() => {
					const s = ((nowLocal % 86400) + 86400) % 86400;
					return s < 1800 || s >= 86400 - 600 ? '1' : '0';
				})(),
				'X-Sleep': String(sleepSec),
				'X-Unchanged': unchanged ? '1' : '0',
				...otaHeaders,
			},
		});
	}

	return json(
		{
			utcOffsetSec: offsetSec,
			refreshIntervalSec: 86400,
			style,
			view: viewForStyle(style),
			...(dark ? { dark: true } : {}),
			...(weather ? { weatherHigh: weather.high, weatherLow: weather.low } : {}),
			events: trimmedEvents,
		},
		200
	);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
