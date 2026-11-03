// Owner-only admin area (orders). ADMIN_PASSWORD is a Cloudflare secret (if it isn't set,
// PREVIEW_PASSWORD is used instead, so one password is enough). The cookie holds an expiry
// time plus an HMAC of it keyed by the password, so the password itself never sits in the
// browser, the cookie can't be forged or extended, and changing the secret signs everyone out.
export const ADMIN_COOKIE = 'admin_session';
export const ADMIN_SESSION_SEC = 60 * 60 * 12; // 12 hours
const enc = new TextEncoder();

async function hmacHex(key: string, msg: string): Promise<string> {
	const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
	return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

export function adminSecret(env: any): string {
	return String(env?.ADMIN_PASSWORD || env?.PREVIEW_PASSWORD || '');
}

export async function adminPasswordOk(input: string, env: any): Promise<boolean> {
	const secret = adminSecret(env);
	if (!secret || !input) return false;
	return safeEqual(await hmacHex('cmp', input), await hmacHex('cmp', secret));
}

export async function makeAdminToken(env: any): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SEC;
	return `${exp}.${await hmacHex(adminSecret(env), `admin-v1.${exp}`)}`;
}

export async function isAdmin(cookies: { get(n: string): { value: string } | undefined }, env: any): Promise<boolean> {
	const secret = adminSecret(env);
	const v = cookies.get(ADMIN_COOKIE)?.value;
	if (!secret || !v) return false;
	const [expStr, mac] = v.split('.');
	const exp = Number(expStr);
	if (!exp || !mac || exp < Math.floor(Date.now() / 1000)) return false;
	return safeEqual(mac, await hmacHex(secret, `admin-v1.${exp}`));
}

// A form post must come from this site (the cookie is SameSite=Strict too).
export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get('Origin');
	if (!origin) return true; // same-origin form posts from some browsers omit it
	try {
		return new URL(origin).host === new URL(request.url).host;
	} catch {
		return false;
	}
}
