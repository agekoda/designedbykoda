// The message board, for the calendar's owner: read the messages, send one, remove them,
// turn the shared link on / off / renew it, and choose how messages show.
import { activeMessages, addMessage, cleanAuthor, cleanBody, expiresAt, isExpiry, newToken, sanitizeCfg, utcOffset } from '../../../lib/messages';
import { markSaved } from '../../../lib/screens';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function owner(request: Request, locals: any, deviceId: string) {
	const db = locals.runtime?.env?.DB;
	if (!db) return { error: json({ error: 'Server is not fully configured yet.' }, 500) } as const;
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return { error: json({ error: 'Not logged in.' }, 401) } as const;
	const dev = await db.prepare('SELECT d.id, d.name, u.timezone FROM devices d JOIN users u ON u.id = d.user_id WHERE d.id = ? AND d.user_id = ?').bind(deviceId, userId).first();
	if (!dev) return { error: json({ error: 'Device not found.' }, 404) } as const;
	return { db, userId, dev } as const;
}

export async function GET({ request, locals }: any) {
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const now = Math.floor(Date.now() / 1000);
	let ready = true;
	let token: string | null = null;
	let cfg = sanitizeCfg(null);
	try {
		const r = await o.db.prepare('SELECT msg_token, msg_cfg FROM devices WHERE id = ?').bind(deviceId).first();
		token = r?.msg_token ?? null;
		cfg = sanitizeCfg(r?.msg_cfg);
		await o.db.prepare('SELECT 1 FROM messages LIMIT 1').first();
	} catch {
		ready = false;
	}
	const origin = new URL(request.url).origin;
	return json({ ready, name: o.dev.name || '', messages: await activeMessages(o.db, deviceId, now), link: token ? `${origin}/m/${token}` : null, cfg });
}

export async function POST({ request, locals }: any) {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
	const o = await owner(request, locals, deviceId);
	if ('error' in o) return o.error;
	const { db } = o;
	const now = Math.floor(Date.now() / 1000);

	try {
		switch (body.action) {
			case 'send': {
				const exp = isExpiry(body.expires) ? body.expires : 'tonight';
				const r = await addMessage(db, deviceId, { author: cleanAuthor(body.author), body: cleanBody(body.text), expiresAt: expiresAt(exp, now, utcOffset(o.dev.timezone)), via: 'owner' }, now);
				if (!r.ok) return json({ error: r.error }, 400);
				await markSaved(db, deviceId); // the next press shows it rather than flipping screens
				return json({ ok: true, id: r.id });
			}
			case 'remove':
				await db.prepare('UPDATE messages SET removed = 1 WHERE id = ? AND device_id = ?').bind(String(body.id ?? ''), deviceId).run();
				return json({ ok: true });
			case 'clear':
				await db.prepare('UPDATE messages SET removed = 1 WHERE device_id = ? AND removed = 0').bind(deviceId).run();
				return json({ ok: true });
			case 'link': {
				// on: make (or remake, which stops the old link working) the shared link; off: stop it
				const token = body.on === true ? newToken() : null;
				await db.prepare('UPDATE devices SET msg_token = ? WHERE id = ? AND user_id = ?').bind(token, deviceId, o.userId).run();
				return json({ ok: true, link: token ? `${new URL(request.url).origin}/m/${token}` : null });
			}
			case 'settings':
				await db.prepare('UPDATE devices SET msg_cfg = ? WHERE id = ? AND user_id = ?').bind(JSON.stringify(sanitizeCfg(body.cfg)), deviceId, o.userId).run();
				return json({ ok: true });
		}
	} catch {
		return json({ error: 'Messages need a one-off database update on the server (schema-messages.sql).' }, 500);
	}
	return json({ error: 'Unknown action.' }, 400);
}
