// Kicks off the Google OAuth flow. No params needed yet — later this can
// accept a query param for where to send the user afterward (e.g. straight
// into device pairing), but for now it always lands on the plain success
// page in callback.ts.
export const prerender = false;

const REDIRECT_URI = 'https://designedbykoda.com/api/auth/callback';
// Must exactly match what's registered in Google Cloud Console → Google
// Auth Platform → Clients → Authorized redirect URIs. Any mismatch
// (trailing slash, http vs https) causes a redirect_uri_mismatch error.

export async function GET({ locals, redirect }) {
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
	authUrl.searchParams.set(
		'scope',
		'openid email https://www.googleapis.com/auth/calendar.readonly'
	);
	authUrl.searchParams.set('access_type', 'offline'); // required to get a refresh token back
	authUrl.searchParams.set('prompt', 'consent'); // forces a refresh token every time, not just the first
	authUrl.searchParams.set('state', state);

	const response = redirect(authUrl.toString(), 302);
	response.headers.append(
		'Set-Cookie',
		`oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
	);
	return response;
}
