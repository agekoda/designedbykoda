// Owner-only preview of the preorder page before it opens to the public.
// PREVIEW_PASSWORD is a Cloudflare secret. The cookie holds an HMAC of a
// fixed label keyed by that password, so the password itself never sits in
// the browser, and changing the secret instantly invalidates old cookies.
import { preorderOpen } from '../data/preorderPricing';

export const PREVIEW_COOKIE = 'preorder_preview';
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

export function previewToken(password: string) {
	return hmacHex(password, 'preorder-preview-v1');
}

export async function passwordMatches(input: string, password: string): Promise<boolean> {
	if (!password) return false;
	// Hash both sides first so the compare is constant length.
	return safeEqual(await hmacHex('cmp', input), await hmacHex('cmp', password));
}

export async function previewUnlocked(cookieValue: string | undefined, password: string | undefined): Promise<boolean> {
	if (!cookieValue || !password) return false;
	return safeEqual(cookieValue, await previewToken(password));
}

// True when the public can order, or the visitor has the owner cookie.
export async function canViewPreorder(cookies: { get(n: string): { value: string } | undefined }, env: any): Promise<boolean> {
	if (preorderOpen()) return true;
	return previewUnlocked(cookies.get(PREVIEW_COOKIE)?.value, env?.PREVIEW_PASSWORD);
}
