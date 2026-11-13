// All the owner app's data in one read (src/lib/adminApp.ts). Owner only.
import { isAdmin } from '../../../../lib/admin';
import { loadAppData } from '../../../../lib/adminApp';

export const prerender = false;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function GET({ locals, cookies }: any) {
	const env = locals.runtime?.env ?? {};
	if (!(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
	if (!env.DB) return json({ ok: false, error: 'No database.' }, 500);
	return json({ ok: true, ...(await loadAppData(env)) });
}
