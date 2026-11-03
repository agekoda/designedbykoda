// Password check for /admin. A wrong guess is slowed down a little.
import { ADMIN_COOKIE, ADMIN_SESSION_SEC, adminPasswordOk, makeAdminToken, sameOrigin } from '../../../lib/admin';

export const prerender = false;

export async function POST({ request, locals, cookies, redirect }) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
	const form = await request.formData().catch(() => null);
	const input = String(form?.get('password') ?? '');

	if (!(await adminPasswordOk(input, env))) {
		await new Promise((r) => setTimeout(r, 800));
		return redirect('/admin?wrong=1', 303);
	}
	cookies.set(ADMIN_COOKIE, await makeAdminToken(env), {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: ADMIN_SESSION_SEC,
	});
	return redirect('/admin', 303);
}
