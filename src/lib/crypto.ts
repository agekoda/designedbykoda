// AES-GCM encryption for anything sensitive we store in D1 (currently:
// Google refresh tokens). Uses the Web Crypto API, which is available
// natively in the Workers runtime — no external library needed.
//
// TOKEN_ENCRYPTION_KEY is a 32-byte key stored as a hex string (generated
// once via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
// and set as a Cloudflare secret — see the waitlist setup instructions for
// the same pattern).

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
	}
	return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function importKey(hexKey: string): Promise<CryptoKey> {
	const keyBytes = hexToBytes(hexKey);
	return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt',
	]);
}

// Returns a single string safe to store in a TEXT column: base64(iv) + "." + base64(ciphertext).
export async function encryptToken(plaintext: string, hexKey: string): Promise<string> {
	const key = await importKey(hexKey);
	// A random IV is required per-encryption for AES-GCM — never reuse one
	// with the same key. 12 bytes (96 bits) is the standard/recommended size.
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(plaintext);
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
	return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(stored: string, hexKey: string): Promise<string> {
	const [ivB64, ciphertextB64] = stored.split('.');
	const key = await importKey(hexKey);
	const iv = base64ToBytes(ivB64);
	const ciphertext = base64ToBytes(ciphertextB64);
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
	return new TextDecoder().decode(plaintext);
}
