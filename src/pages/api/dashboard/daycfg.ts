// Away mode and quiet hours for one calendar (src/lib/eink/dayCfg.ts, schema-school.sql).
import { sanitizeDayCfg } from '../../../lib/eink/dayCfg';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
	const cfg = sanitizeDayCfg(body.cfg);
	try {
		const r = await db.prepare('UPDATE devices SET day_cfg = ? WHERE id = ? AND user_id = ?').bind(JSON.stringify(cfg), deviceId, userId).run();
		if (!r?.meta?.changes) return json({ error: 'Device not found.' }, 404);
	} catch {
		return json({ error: 'Away mode needs a one-off database update on the server (schema-school.sql).' }, 500);
	}
	return json({ ok: true, cfg });
}
