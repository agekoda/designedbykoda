// Save the /stats page numbers from the owner app. Owner only.
import { isAdmin, sameOrigin } from '../../../../lib/admin';
import { loadStats, saveStats } from '../../../../lib/siteStats';

export const prerender = false;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals, cookies }: any) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request) || !(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
	if (!env.DB) return json({ ok: false, error: 'No database.' }, 500);
	const b: any = await request.json().catch(() => null);
	try {
		await saveStats(env, b?.values ?? {});
	} catch (e: any) {
		return json({ ok: false, error: e?.message || "Couldn't save." }, 400);
	}
	return json({ ok: true, stats: await loadStats(env) });
}
