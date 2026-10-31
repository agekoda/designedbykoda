// The endpoint a device hits on every wake cycle. Handles: verifying the
// device's own secret, refreshing the user's Google access token if
// needed, computing "today" correctly in the user's actual timezone
// (handling DST automatically via Intl, which an ESP32 could never do on
// its own), and returning a small, pre-formatted payload.
import { viewForStyle } from '../../../../data/calendarStyles';
import { getForecast } from '../../../../lib/weather';
import { renderLayout } from '../../../../lib/eink/layouts';
export const prerender = false;

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
			if (row?.pairing_code && row.pairing_code_expires_at > nowS) {
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
	let accessToken: string;

	// Reuse the cached access token if it's still good for at least another
	// minute; otherwise refresh it and cache the new one on this device row.
	if (device.cached_access_token && device.cached_token_expiry > now + 60) {
		accessToken = device.cached_access_token;
	} else {
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
			if (errText.includes('invalid_grant')) {
				return json({ error: 'reauth_required' }, 403);
			}
			return json({ error: `Token refresh failed: ${errText}` }, 502);
		}
		const tokenData = await tokenRes.json();
		accessToken = tokenData.access_token;
		const newExpiry = now + (tokenData.expires_in || 3600);
		await db
			.prepare('UPDATE devices SET cached_access_token = ?, cached_token_expiry = ? WHERE id = ?')
			.bind(accessToken, newExpiry, deviceId)
			.run();
	}

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

	console.log(
		`Fetching for device ${deviceId}: calendars=${JSON.stringify(calendarIds)} savedTimezone=${user.timezone} from ${rightNow.toISOString()} onward`
	);

	const rawEvents: { title: string; ms: number; allDay: boolean; dateOnly?: string }[] = [];
	let googleTz: string | null = null;

	for (const calId of calendarIds) {
		const eventsUrl = new URL(
			`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`
		);
		eventsUrl.searchParams.set('timeMin', rightNow.toISOString());
		// No timeMax — maxResults + orderBy=startTime is what actually
		// gives us "the next N upcoming events", regardless of how many
		// days out they fall.
		eventsUrl.searchParams.set('maxResults', '15');
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
			});
		}
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
		return { title: e.title, startUnix, startLocal, allDay: e.allDay };
	});

	allEvents.sort((a, b) => a.startUnix - b.startUnix);
	// Merging multiple calendars can exceed 15 combined even though each
	// was capped individually — trim to the final cap here, after sorting,
	// so we keep the chronologically-soonest ones across all calendars
	// rather than e.g. all of one calendar's 15 and none of another's.
	const trimmedEvents = allEvents.slice(0, 15);
	console.log(`Total events after merging all calendars: ${allEvents.length}, sending ${trimmedEvents.length}`);

	// Which layout the person picked in setup. Separate query + try/catch so
	// a missing column (migration not run yet) falls back to Agenda instead
	// of breaking every device.
	let style = 'agenda';
	try {
		const row = await db.prepare('SELECT calendar_style FROM users WHERE id = ?').bind(device.user_id).first();
		if (row?.calendar_style) style = row.calendar_style;
	} catch {}
	if (deviceStyle) style = deviceStyle;

	// Optional weather: today's high/low for the location chosen in setup.
	// Never lets a weather problem break the calendar response.
	let weather: { high: number; low: number } | null = null;
	try {
		const loc = await db.prepare('SELECT weather_lat, weather_lon FROM devices WHERE id = ?').bind(deviceId).first();
		if (loc && loc.weather_lat !== null && loc.weather_lon !== null) {
			weather = await getForecast(db, loc.weather_lat, loc.weather_lon);
		}
	} catch {}

	// Dark mode (white on black), from schema-darkmode.sql. Its own query so a
	// missing column never affects anything else.
	let dark = false;
	try {
		const dm = await db.prepare('SELECT dark_mode FROM devices WHERE id = ?').bind(deviceId).first();
		dark = dm?.dark_mode === 1;
	} catch {}

	await db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(now, deviceId).run();

	if (proto === '2') {
		const vRaw = parseFloat(reqUrl.searchParams.get('v') ?? '');
		const vbat = Number.isFinite(vRaw) && vRaw > 0 && vRaw < 10 ? vRaw : null;
		const nowLocal = Math.floor(rightNow.getTime() / 1000) + offsetSec;
		const screen = renderLayout(style, {
			nowLocal,
			events: trimmedEvents.map((e) => ({ title: e.title, startLocal: e.startLocal, allDay: e.allDay })),
			weather,
			vbat,
			dark,
		});
		return new Response(screen, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-store',
				'X-Sleep': String(secondsUntilNextRefresh(nowLocal, device.refresh_interval_sec || 86400)),
			},
		});
	}

	return json(
		{
			utcOffsetSec: offsetSec,
			refreshIntervalSec: device.refresh_interval_sec || 86400,
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
