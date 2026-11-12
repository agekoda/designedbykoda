// Email alert settings for the signed-in account (src/lib/alerts.ts).
export const prerender = false;
import { parsePrefs } from '../../../lib/alerts';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function who(request: Request, db: any) {
	const { getSessionUserId } = await import('../../../lib/session');
	return getSessionUserId(request, db);
}

export async function GET({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ available: false });
	const userId = await who(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	try {
		const u: any = await db.prepare('SELECT email, alerts FROM users WHERE id = ?').bind(userId).first();
		return json({ available: true, email: u?.email ?? null, prefs: parsePrefs(u?.alerts) });
	} catch {
		return json({ available: false }); // before the migrations
	}
}

export async function POST({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Not configured.' }, 500);
	const userId = await who(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	const b: any = await request.json().catch(() => ({}));
	const prefs = { battery: b.battery === true, offline: b.offline === true, update: b.update === true };
	try {
		await db.prepare('UPDATE users SET alerts = ? WHERE id = ?').bind(JSON.stringify(prefs), userId).run();
		return json({ ok: true, prefs });
	} catch {
		return json({ error: 'Email alerts aren’t set up yet.' }, 500);
	}
}
