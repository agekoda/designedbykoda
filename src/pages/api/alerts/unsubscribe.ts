// One-click "stop all of these emails" link from alert emails (signed, so no login needed).
// GET from the link in the email; POST from mail apps' own unsubscribe button (RFC 8058).
export const prerender = false;
import { unsubOk } from '../../../lib/alerts';

async function off(url: URL, env: any): Promise<boolean> {
	const u = url.searchParams.get('u') ?? '';
	const k = url.searchParams.get('k') ?? '';
	if (!(await unsubOk(env, u, k))) return false;
	try {
		await env.DB.prepare('UPDATE users SET alerts = ? WHERE id = ?').bind(JSON.stringify({ battery: false, offline: false, update: false }), u).run();
		return true;
	} catch {
		return false;
	}
}

const page = (ok: boolean) =>
	new Response(
		`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email alerts</title>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#0b0b0b;color:#eee;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center">
<div style="max-width:420px;padding:24px"><h1 style="font-size:1.5em">${ok ? 'Done' : 'That link didn’t work'}</h1>
<p style="color:#aaa">${ok ? 'You won’t get calendar alert emails any more. You can turn them back on from your dashboard.' : 'You can change your email alerts from your dashboard instead.'}</p>
<p><a href="/dashboard" style="color:#fff">Go to your dashboard</a></p></div></body>`,
		{ status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
	);

export async function GET({ url, locals }: any) {
	return page(await off(url, locals.runtime?.env ?? {}));
}
export async function POST({ url, locals }: any) {
	const ok = await off(url, locals.runtime?.env ?? {});
	return new Response(ok ? 'ok' : 'bad link', { status: ok ? 200 : 400 });
}
