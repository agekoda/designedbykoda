// Reads the `session` cookie set by /api/auth/callback and resolves it to
// a user ID — used by any dashboard-facing endpoint that needs to know
// "who is currently logged in". Separate from device auth entirely; a
// device never has a session, it authenticates with its own secret.

export function getCookie(request: Request, name: string): string | null {
	const header = request.headers.get('Cookie') || '';
	const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

// Returns the user_id for a valid, non-expired session, or null if there
// isn't one — callers should treat null as "not logged in" and respond
// with 401, not assume a session exists.
export async function getSessionUserId(request: Request, db: any): Promise<string | null> {
	const sessionId = getCookie(request, 'session');
	if (!sessionId) return null;

	const now = Math.floor(Date.now() / 1000);
	const session = await db
		.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
		.bind(sessionId)
		.first();

	if (!session || session.expires_at < now) return null;
	return session.user_id as string;
}
