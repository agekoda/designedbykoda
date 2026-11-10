// "Update now" on My devices: the calendar's next check-in (a button press) installs the update
// on offer straight away, showing its progress on the screen. Good for an hour.
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const id = String(body?.id ?? '');
	const { availableFor, channelOf } = await import('../../../../lib/firmware');
	try {
		const d: any = await db.prepare('SELECT firmware, fw_channel FROM devices WHERE id = ? AND user_id = ?').bind(id, userId).first();
		if (!d) return json({ error: 'Device not found.' }, 404);
		if (!availableFor(d.firmware ?? null, channelOf(d.fw_channel))) return json({ error: 'This calendar is already up to date.' }, 400);
		const cancel = body?.cancel === true;
		await db.prepare('UPDATE devices SET update_now_at = ? WHERE id = ?').bind(cancel ? null : Math.floor(Date.now() / 1000), id).run();
		return json({ ok: true });
	} catch {
		return json({ error: 'Updates aren\'t set up yet (schema-ota.sql).' }, 500);
	}
}
