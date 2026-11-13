// One calendar, for the owner app. GET: its battery history. POST: put it on the beta or everyone
// firmware channel, or ask it to install the waiting update on its next check-in. Owner only.
import { isAdmin, sameOrigin } from '../../../../lib/admin';

export const prerender = false;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function GET({ locals, cookies, url }: any) {
	const env = locals.runtime?.env ?? {};
	if (!(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
	const id = url.searchParams.get('id') ?? '';
	try {
		const since = Math.floor(Date.now() / 1000) - 90 * 86400;
		const r = await env.DB.prepare('SELECT at, mv FROM battery_log WHERE device_id = ? AND at > ? ORDER BY at').bind(id, since).all();
		let pts: any[] = r.results ?? [];
		const step = Math.ceil(pts.length / 400); // plenty for a small graph
		if (step > 1) pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
		return json({ ok: true, battery: pts.map((p) => [p.at, p.mv]) });
	} catch {
		return json({ ok: true, battery: [] });
	}
}

export async function POST({ request, locals, cookies }: any) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request) || !(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
	const b: any = await request.json().catch(() => null);
	const id = String(b?.id ?? '');
	if (!id) return json({ ok: false, error: 'Which calendar?' }, 400);
	try {
		if (b.action === 'channel') {
			await env.DB.prepare('UPDATE devices SET fw_channel = ? WHERE id = ?').bind(b.channel === 'beta' ? 'beta' : null, id).run();
		} else if (b.action === 'update-now') {
			await env.DB.prepare('UPDATE devices SET update_now_at = ? WHERE id = ?').bind(b.cancel ? null : Math.floor(Date.now() / 1000), id).run();
		} else return json({ ok: false, error: 'Unknown action.' }, 400);
		return json({ ok: true });
	} catch {
		return json({ ok: false, error: "Updates aren't set up yet (schema-ota.sql)." }, 500);
	}
}
