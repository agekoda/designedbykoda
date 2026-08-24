// The endpoint a device hits on every wake cycle. Handles: verifying the
// device's own secret, refreshing the user's Google access token if
// needed, computing "today" correctly in the user's actual timezone
// (handling DST automatically via Intl, which an ESP32 could never do on
// its own), and returning a small, pre-formatted payload.
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

export async function GET({ params, request, locals }) {
	const env = locals.runtime?.env ?? {};
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
		return json({ error: 'not_paired' }, 403);
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

	const timezone = user.timezone || 'UTC';
	// Still needed for utcOffsetSec in the response (the device uses it for
	// display + sleep-boundary timing) — but no longer used to restrict the
	// calendar query itself. That was the actual bug: querying only
	// midnight-to-midnight "today" meant a calendar with nothing scheduled
	// for the literal current day returned zero events, even with things
	// coming up later in the week. Fixed below to fetch the next N
	// upcoming events from right now onward, same as the original firmware
	// intended (7 upcoming events, whichever day they fall on).
	const { offsetSec } = getTodayRangeUTC(timezone, new Date());
	const rightNow = new Date();

	let calendarIds: string[];
	try {
		calendarIds = JSON.parse(user.selected_calendar_ids || '[]');
	} catch {
		calendarIds = [];
	}
	if (calendarIds.length === 0) calendarIds = ['primary'];

	console.log(
		`Fetching for device ${deviceId}: calendars=${JSON.stringify(calendarIds)} timezone=${timezone} from ${rightNow.toISOString()} onward`
	);

	const allEvents: { title: string; startUnix: number; allDay: boolean }[] = [];

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
		const itemCount = (evData.items || []).length;
		console.log(`Calendar "${calId}": Google returned ${itemCount} raw item(s)`);
		for (const item of evData.items || []) {
			const isAllDay = !item.start?.dateTime;
			const startValue = item.start?.dateTime || item.start?.date;
			if (!startValue || !item.summary) {
				console.log(`Skipped an item on "${calId}" — missing start or summary: ${JSON.stringify(item.start)} / "${item.summary}"`);
				continue;
			}
			allEvents.push({
				title: item.summary,
				startUnix: Math.floor(new Date(startValue).getTime() / 1000),
				allDay: isAllDay,
			});
		}
	}

	allEvents.sort((a, b) => a.startUnix - b.startUnix);
	// Merging multiple calendars can exceed 15 combined even though each
	// was capped individually — trim to the final cap here, after sorting,
	// so we keep the chronologically-soonest ones across all calendars
	// rather than e.g. all of one calendar's 15 and none of another's.
	const trimmedEvents = allEvents.slice(0, 15);
	console.log(`Total events after merging all calendars: ${allEvents.length}, sending ${trimmedEvents.length}`);

	await db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(now, deviceId).run();

	return json(
		{
			utcOffsetSec: offsetSec,
			refreshIntervalSec: device.refresh_interval_sec || 86400,
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
