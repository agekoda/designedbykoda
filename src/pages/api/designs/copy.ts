// "Use this design" on a shared design link: copies it into one of your calendars' designs.
export const prerender = false;
import { getShareByToken } from '../../../lib/designShare';
import { cleanName, listDesigns, MAX_DESIGNS, newDesignId } from '../../../lib/designs';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Sign in first.' }, 401);
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const share = await getShareByToken(db, body?.token);
	if (!share) return json({ error: 'This link doesn’t work any more.' }, 404);
	const deviceId = String(body?.deviceId ?? '');
	const dev = await db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first().catch(() => null);
	if (!dev) return json({ error: 'Calendar not found.' }, 404);
	const designs = await listDesigns(db, deviceId);
	if (!designs) return json({ error: 'Designs aren’t set up yet.' }, 500);
	if (designs.length >= MAX_DESIGNS) return json({ error: `That calendar already has ${MAX_DESIGNS} designs. Delete one first.` }, 400);
	// keep names unique-ish: "Name", then "Name (2)"
	let name = cleanName(share.name);
	if (designs.some((d) => d.name === name)) {
		let n = 2;
		while (designs.some((d) => d.name === `${name.slice(0, 25)} (${n})`)) n++;
		name = `${name.slice(0, 25)} (${n})`;
	}
	const id = newDesignId();
	const now = Math.floor(Date.now() / 1000);
	await db.prepare('INSERT INTO designs (id, device_id, name, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, deviceId, name, JSON.stringify(share.layout), now, now).run();
	if (share.deviceId !== deviceId) await db.prepare('UPDATE shared_designs SET copies = copies + 1 WHERE token = ?').bind(share.token).run().catch(() => {});
	return json({ ok: true, designId: id });
}
