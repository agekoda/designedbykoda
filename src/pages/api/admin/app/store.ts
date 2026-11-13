// Saves the owner app's own records (parts, stock, supplier orders and costs) in the database, so they
// are the same on any PC. Owner only. The table is made the first time something is saved.
import { isAdmin, sameOrigin } from '../../../../lib/admin';

export const prerender = false;
export const STORE_KEYS = ['inventory'];
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals, cookies }: any) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request) || !(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
	if (!env.DB) return json({ ok: false, error: 'No database.' }, 500);
	const b: any = await request.json().catch(() => null);
	if (!STORE_KEYS.includes(b?.key) || typeof b?.value !== 'object' || b.value === null) return json({ ok: false, error: 'Bad request.' }, 400);
	const text = JSON.stringify(b.value);
	if (text.length > 500_000) return json({ ok: false, error: 'That is too much to save.' }, 400);
	await env.DB.prepare('CREATE TABLE IF NOT EXISTS owner_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
	await env.DB.prepare('INSERT INTO owner_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
		.bind(b.key, text, Math.floor(Date.now() / 1000))
		.run();
	return json({ ok: true });
}
