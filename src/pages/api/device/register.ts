// The device generates its own random secret (via the ESP32's hardware
// RNG) and calls this once to register itself and get back a device ID +
// a short human-readable pairing code to display on its setup screen.
// No auth required to hit this endpoint — see the comment near the bottom
// on why that's an acceptable tradeoff, and what actually limits abuse.
export const prerender = false;

// Unambiguous alphabet for the pairing code — excludes characters easy to
// misread when handwritten/displayed on a small screen (0/O, 1/I/L).
const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_LIFETIME_SEC = 60 * 60 * 48; // 48 hours to be claimed

function generatePairingCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(PAIRING_CODE_LENGTH));
	let code = '';
	for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
		code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
	}
	return code;
}

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);

	let deviceSecret: string;
	try {
		const body = await request.json();
		deviceSecret = typeof body.deviceSecret === 'string' ? body.deviceSecret.trim() : '';
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}

	// The secret itself should already be a proper random value generated
	// on-device — this is just a sanity floor, not real entropy checking.
	if (!deviceSecret || deviceSecret.length < 16) {
		return json({ error: 'deviceSecret missing or too short.' }, 400);
	}

	const { hashSecret } = await import('../../../lib/crypto');
	const secretHash = await hashSecret(deviceSecret);

	const deviceId = crypto.randomUUID();
	const pairingCode = generatePairingCode();
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`INSERT INTO devices (id, device_secret_hash, pairing_code, pairing_code_expires_at, user_id, created_at)
			 VALUES (?, ?, ?, ?, NULL, ?)`
		)
		.bind(deviceId, secretHash, pairingCode, now + PAIRING_CODE_LIFETIME_SEC, now)
		.run();

	return json({ deviceId, pairingCode }, 201);

	// On open registration: anyone could call this endpoint and create junk
	// device rows, but that alone isn't harmful — an attacker gains nothing
	// useful from it, since they'd only know a secret *they* generated
	// themselves. The actual sensitive step is pairing (linking a device to
	// someone's calendar access), which is protected separately: it
	// requires a valid, non-expired pairing code AND a logged-in session.
	// If spam registration ever becomes a real problem, Cloudflare's
	// dashboard-level rate limiting rules can throttle this endpoint with
	// zero code changes.
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
