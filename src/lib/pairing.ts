// Shared by the endpoints that hand a device a fresh pairing code
// (register is the original; unpair and an expired/missing code reuse this).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const PAIRING_CODE_LIFETIME_SEC = 60 * 60 * 48;

export function generatePairingCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	let code = '';
	for (let i = 0; i < 6; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
	return code;
}

// Puts a brand-new pairing code on a device row (retrying on the rare
// UNIQUE collision) and returns it.
export async function issuePairingCode(db: any, deviceId: string, now: number): Promise<string | null> {
	for (let i = 0; i < 5; i++) {
		const code = generatePairingCode();
		try {
			await db
				.prepare('UPDATE devices SET pairing_code = ?, pairing_code_expires_at = ? WHERE id = ?')
				.bind(code, now + PAIRING_CODE_LIFETIME_SEC, deviceId)
				.run();
			return code;
		} catch {
			/* collision, try another */
		}
	}
	return null;
}
