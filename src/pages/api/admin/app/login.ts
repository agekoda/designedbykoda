// Sign-in for the desktop owner app (admin-app/). Same password as /admin; answers with a token the
// app sends back as the admin cookie. A wrong guess is slowed down a little.
import { ADMIN_APP_SESSION_SEC, ADMIN_COOKIE, adminPasswordOk, adminSecret, makeAdminToken } from '../../../../lib/admin';

export const prerender = false;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals }: any) {
	const env = locals.runtime?.env ?? {};
	if (!adminSecret(env)) return json({ ok: false, error: 'ADMIN_PASSWORD is not set on the site.' }, 500);
	const body: any = await request.json().catch(() => null);
	if (!(await adminPasswordOk(String(body?.password ?? ''), env))) {
		await new Promise((r) => setTimeout(r, 800));
		return json({ ok: false, error: 'Wrong password.' }, 401);
	}
	return json({ ok: true, cookie: ADMIN_COOKIE, token: await makeAdminToken(env, ADMIN_APP_SESSION_SEC), expires: Math.floor(Date.now() / 1000) + ADMIN_APP_SESSION_SEC });
}
