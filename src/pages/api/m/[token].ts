// The shared "send a message" link: anyone with it can leave a message on that calendar.
// No account; the link's secret is the permission. Limits in src/lib/messages.ts stop floods.
import { markSaved } from '../../../lib/screens';
import { addMessage, cleanAuthor, cleanBody, expiresAt, isExpiry, isToken, utcOffset } from '../../../lib/messages';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ params, request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const token = params.token;
	if (!isToken(token)) return json({ error: 'This link doesn’t work any more.' }, 404);
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	let dev: any = null;
	try {
		dev = await db.prepare('SELECT d.id, u.timezone FROM devices d JOIN users u ON u.id = d.user_id WHERE d.msg_token = ?').bind(token).first();
	} catch {}
	if (!dev) return json({ error: 'This link doesn’t work any more. Ask for a new one.' }, 404);
	const now = Math.floor(Date.now() / 1000);
	const exp = isExpiry(body.expires) && body.expires !== 'never' ? body.expires : 'tonight'; // only the owner can pin a message
	const r = await addMessage(db, dev.id, { author: cleanAuthor(body.author), body: cleanBody(body.text), expiresAt: expiresAt(exp, now, utcOffset(dev.timezone)), via: 'link' }, now);
	if (!r.ok) return json({ error: r.error }, 400);
	await markSaved(db, dev.id); // a press now shows the message rather than flipping screens
	return json({ ok: true });
}
