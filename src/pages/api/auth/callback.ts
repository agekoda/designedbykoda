// Where Google redirects back to after the user approves (or denies)
// access. This is the route that was 404ing during testing — that was
// correct at the time, since this file didn't exist yet.
export const prerender = false;

const REDIRECT_URI = 'https://designedbykoda.com/api/auth/callback';

function getCookie(request: Request, name: string): string | null {
	const header = request.headers.get('Cookie') || '';
	const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

export async function GET({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const returnedState = url.searchParams.get('state');
	const cookieState = getCookie(request, 'oauth_state');

	// CSRF check — the state we get back must match the one we set before
	// sending the user to Google. If it doesn't (or is missing), reject
	// outright rather than proceeding.
	if (!returnedState || !cookieState || returnedState !== cookieState) {
		return new Response('Invalid or expired login attempt. Please try connecting again.', {
			status: 400,
		});
	}
	if (!code) {
		return new Response('Google did not return an authorization code.', { status: 400 });
	}

	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	const encryptionKey = env.TOKEN_ENCRYPTION_KEY;
	const db = env.DB;

	if (!clientId || !clientSecret || !encryptionKey || !db) {
		return new Response('Server is not fully configured yet.', { status: 500 });
	}

	// Exchange the one-time code for real tokens — server-to-server, the
	// client secret never leaves this request.
	const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: REDIRECT_URI,
			grant_type: 'authorization_code',
		}),
	});

	if (!tokenRes.ok) {
		const errText = await tokenRes.text();
		return new Response(`Google token exchange failed: ${errText}`, { status: 502 });
	}

	const tokens = await tokenRes.json();
	const { access_token, refresh_token } = tokens;

	if (!refresh_token) {
		// Shouldn't happen with access_type=offline + prompt=consent, but if
		// it does, there's nothing to store — the user needs to try again.
		return new Response(
			'Google did not return a refresh token. Please try connecting again.',
			{ status: 502 }
		);
	}

	// Find out *who* just signed in.
	const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: { Authorization: `Bearer ${access_token}` },
	});
	if (!userInfoRes.ok) {
		return new Response('Could not retrieve account info from Google.', { status: 502 });
	}
	const userInfo = await userInfoRes.json();
	const { sub: googleSub, email } = userInfo;

	// Import here rather than at module scope, since this file is TS run
	// through Astro's build — a normal relative import works fine.
	const { encryptToken } = await import('../../../lib/crypto');
	const encryptedRefreshToken = await encryptToken(refresh_token, encryptionKey);

	// Upsert: if this Google account has connected before, update their
	// stored token (people can reconnect); otherwise create them fresh.
	const existing = await db
		.prepare('SELECT id FROM users WHERE google_sub = ?')
		.bind(googleSub)
		.first();

	let userId: string;
	const now = Math.floor(Date.now() / 1000);

	if (existing) {
		userId = existing.id as string;
		await db
			.prepare('UPDATE users SET encrypted_refresh_token = ? WHERE id = ?')
			.bind(encryptedRefreshToken, userId)
			.run();
	} else {
		userId = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO users (id, google_sub, encrypted_refresh_token, selected_calendar_ids, timezone, created_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(userId, googleSub, encryptedRefreshToken, '[]', 'UTC', now)
			.run();
	}

	// Log the user into the dashboard (separate concern from the device's
	// own credential — this cookie is what keeps *them* signed in here).
	const sessionId = crypto.randomUUID();
	const sessionExpiry = now + 60 * 60 * 24 * 30; // 30 days
	await db
		.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
		.bind(sessionId, userId, sessionExpiry)
		.run();

	// Set-Cookie is the one header that genuinely needs multiple separate
	// lines, not a comma-joined value — Headers.append (called twice) does
	// this correctly, where a plain object literal with a joined string
	// would produce one malformed header instead of two valid cookies.
	// A redirect response can carry Set-Cookie exactly the same way a
	// normal 200 can — the browser applies the cookie before following it.
	//
	// If a pairing code was stashed before heading to Google (scanning the
	// QR on the device while not yet signed in), restore it here so
	// /setup?code=... arrives with the code still filled in — without
	// this, the whole point of the QR code is lost the moment someone
	// needs to sign in first.
	const pendingPairCode = getCookie(request, 'pending_pair_code');
	const redirectLocation = pendingPairCode
		? `/setup?code=${encodeURIComponent(pendingPairCode)}`
		: '/setup';

	const headers = new Headers({ Location: redirectLocation });
	headers.append('Set-Cookie', 'oauth_state=; Max-Age=0; Path=/');
	headers.append('Set-Cookie', 'pending_pair_code=; Max-Age=0; Path=/');
	headers.append(
		'Set-Cookie',
		`session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}; Path=/`
	);

	return new Response(null, { status: 302, headers });
}
