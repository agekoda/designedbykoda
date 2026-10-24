// Dashboard-only endpoints (session auth, not device auth) for choosing
// which of the user's Google calendars their device should show.
import { isStyleId } from '../../../data/calendarStyles';
export const prerender = false;

async function getAccessToken(userId: string, db: any, clientId: string, clientSecret: string, encryptionKey: string) {
	const { decryptToken } = await import('../../../lib/crypto');
	const user = await db
		.prepare('SELECT encrypted_refresh_token FROM users WHERE id = ?')
		.bind(userId)
		.first();
	if (!user) return null;

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
	if (!tokenRes.ok) return null;
	const data = await tokenRes.json();
	return data.access_token as string;
	// NOTE: unlike /api/device/{id}/today, this doesn't cache the access
	// token anywhere — this endpoint is only hit when a person is actively
	// using the dashboard (rare, human-driven), not on every device wake
	// cycle, so the extra token refresh call each time is a non-issue and
	// avoids needing a users-table cache column just for this.
}

export async function GET({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);

	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);

	const accessToken = await getAccessToken(
		userId,
		db,
		env.GOOGLE_CLIENT_ID,
		env.GOOGLE_CLIENT_SECRET,
		env.TOKEN_ENCRYPTION_KEY
	);
	if (!accessToken) return json({ error: 'Could not access Google Calendar.' }, 502);

	const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!listRes.ok) return json({ error: 'Could not fetch calendar list.' }, 502);

	const data = await listRes.json();
	const calendars = (data.items || []).map((item: any) => ({
		id: item.id,
		summary: item.summary,
		primary: !!item.primary,
	}));

	const user = await db
		.prepare('SELECT selected_calendar_ids FROM users WHERE id = ?')
		.bind(userId)
		.first();
	let selected: string[] = [];
	try {
		selected = JSON.parse(user?.selected_calendar_ids || '[]');
	} catch {
		selected = [];
	}

	// calendar_style may not exist yet if the migration hasn't been run.
	let style = 'agenda';
	try {
		const row = await db.prepare('SELECT calendar_style FROM users WHERE id = ?').bind(userId).first();
		if (row?.calendar_style) style = row.calendar_style;
	} catch {}

	return json({ calendars, selected, style }, 200);
}

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);

	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);

	// Either field may be sent on its own: the setup wizard saves the
	// calendars and the style on different steps.
	let calendarIds: string[] | null = null;
	let style: string | null = null;
	try {
		const body = await request.json();
		if (Array.isArray(body.calendarIds)) {
			calendarIds = body.calendarIds.filter((id: unknown) => typeof id === 'string');
		}
		if (body.style !== undefined) {
			if (!isStyleId(body.style)) return json({ error: 'Unknown style.' }, 400);
			style = body.style;
		}
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}

	if (calendarIds) {
		await db
			.prepare('UPDATE users SET selected_calendar_ids = ? WHERE id = ?')
			.bind(JSON.stringify(calendarIds), userId)
			.run();
	}
	if (style) {
		try {
			await db.prepare('UPDATE users SET calendar_style = ? WHERE id = ?').bind(style, userId).run();
		} catch {
			return json({ error: 'Layouts are not enabled on the server yet.' }, 500);
		}
	}

	return json({ ok: true }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
