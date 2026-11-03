// Kicks off the Google OAuth flow. Accepts an optional ?code= query param
// (a device pairing code, from scanning the QR on its screen) — Google's
// OAuth round trip only lets us carry back whatever's in `state`, so
// anything else about the original request (like this code) needs to be
// stashed somewhere that survives the trip. Same cookie pattern as the
// CSRF `state` value below, not baked into `state` itself, to keep the
// two concerns separate.
export const prerender = false;

const REDIRECT_URI = 'https://designedbykoda.com/api/auth/callback';
// Must exactly match what's registered in Google Cloud Console → Google
// Auth Platform → Clients → Authorized redirect URIs. Any mismatch
// (trailing slash, http vs https) causes a redirect_uri_mismatch error.

export async function GET({ request, locals, redirect }) {
	const env = locals.runtime?.env ?? {};
	const clientId = env.GOOGLE_CLIENT_ID;

	if (!clientId) {
		return new Response('OAuth is not configured yet.', { status: 500 });
	}

	// Random, unguessable value — this is what proves the callback request
	// actually came from a flow we started, not an attacker replaying/
	// forging a request (CSRF). Stored in a short-lived cookie rather than
	// a database, since it's only ever needed for the few minutes between
	// redirecting out and coming back.
	const state = crypto.randomUUID();

	const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
	authUrl.searchParams.set('response_type', 'code');
	// openid + email let us identify *who* signed in (via the userinfo
	// endpoint in the callback); calendar.readonly is the actual sensitive
	// scope this whole flow exists for.
	// tasks.readonly is only asked for when the person chooses the To-do layout and presses
	// "Connect Google Tasks" (?tasks=1), so everyone else's consent screen stays as short as before.
	const url = new URL(request.url);
	const wantTasks = url.searchParams.get('tasks') === '1';
	authUrl.searchParams.set(
		'scope',
		'openid email https://www.googleapis.com/auth/calendar.readonly' + (wantTasks ? ' https://www.googleapis.com/auth/tasks.readonly' : '')
	);
	// keep anything they have already allowed (so signing in again doesn't drop Google Tasks)
	authUrl.searchParams.set('include_granted_scopes', 'true');
	authUrl.searchParams.set('access_type', 'offline'); // required to get a refresh token back
	authUrl.searchParams.set('prompt', 'consent'); // forces a refresh token every time, not just the first
	authUrl.searchParams.set('state', state);

	const response = redirect(authUrl.toString(), 302);
	response.headers.append(
		'Set-Cookie',
		`oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
	);

	const pairingCode = url.searchParams.get('code');
	// Where to land afterwards (same-site paths only).
	const back = url.searchParams.get('return');
	if (back && back.startsWith('/') && !back.startsWith('//')) {
		response.headers.append(
			'Set-Cookie',
			`post_auth_return=${encodeURIComponent(back)}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
		);
	}
	if (pairingCode) {
		response.headers.append(
			'Set-Cookie',
			`pending_pair_code=${encodeURIComponent(pairingCode)}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
		);
	}

	return response;
}
