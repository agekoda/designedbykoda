// The desk name plate's status link: make it, make a new one, remove it, how often the calendar looks.
import { getStatus, makeLink, removeLink, setCheck, activeStatus } from '../../../lib/deskStatus';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function owner(request: Request, locals: any, deviceId: string) {
	const db = locals.runtime?.env?.DB;
	if (!db) return { err: json({ error: 'Server is not fully configured yet.' }, 500) };
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return { err: json({ error: 'Not logged in.' }, 401) };
	const dev = await db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	if (!dev) return { err: json({ error: 'Device not found.' }, 404) };
	return { db };
}

const out = (s: Awaited<ReturnType<typeof getStatus>>) =>
	s ? { token: s.token, check: s.check, now: activeStatus(s, Math.floor(Date.now() / 1000)) } : null;

export async function GET({ request, locals }: any) {
	const deviceId = new URL(request.url).searchParams.get('deviceId') ?? '';
	const o = await owner(request, locals, deviceId);
	if (o.err) return o.err;
	return json({ ok: true, link: out(await getStatus(o.db, deviceId)) });
}

export async function POST({ request, locals }: any) {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request.' }, 400);
	}
	const deviceId = String(body?.deviceId ?? '');
	const o = await owner(request, locals, deviceId);
	if (o.err) return o.err;
	try {
		if (body.action === 'make') return json({ ok: true, link: out(await makeLink(o.db, deviceId)) });
		if (body.action === 'remove') {
			await removeLink(o.db, deviceId);
			return json({ ok: true, link: null });
		}
		if (body.action === 'check') {
			await setCheck(o.db, deviceId, Number(body.check));
			return json({ ok: true, link: out(await getStatus(o.db, deviceId)) });
		}
	} catch {
		return json({ error: 'Could not save that.' }, 500);
	}
	return json({ error: 'Bad request.' }, 400);
}
