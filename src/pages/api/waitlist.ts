// Waitlist signup endpoint. Runs server-side on Cloudflare (not
// prerendered), so the Brevo API key never reaches the browser — the
// client only ever talks to this same-origin endpoint.
export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST({ request, locals }) {
	let email;
	try {
		const body = await request.json();
		email = typeof body.email === 'string' ? body.email.trim() : '';
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}

	if (!email || !EMAIL_RE.test(email)) {
		return json({ error: 'Please enter a valid email address.' }, 400);
	}

	const env = locals.runtime?.env ?? {};
	const apiKey = env.BREVO_API_KEY;
	const listId = env.BREVO_LIST_ID;

	if (!apiKey || !listId) {
		// Not configured yet — see .dev.vars.example / the waitlist setup
		// instructions for what needs to be set.
		return json({ error: 'Waitlist is not configured yet.' }, 500);
	}

	let brevoRes;
	try {
		brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
			method: 'POST',
			headers: {
				'api-key': apiKey,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify({
				email,
				listIds: [Number(listId)],
				updateEnabled: true,
			}),
		});
	} catch {
		return json({ error: 'Could not reach the signup service — try again shortly.' }, 502);
	}

	if (brevoRes.ok) {
		return json({ ok: true }, 201);
	}

	// Brevo returns 400 "duplicate_parameter" if this email is already on
	// the list — treat that as a success from the visitor's point of view,
	// they're on the list either way.
	const data = await brevoRes.json().catch(() => ({}));
	if (data && data.code === 'duplicate_parameter') {
		return json({ ok: true }, 200);
	}

	return json({ error: 'Something went wrong — try again shortly.' }, 502);
}

function json(data, status) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
