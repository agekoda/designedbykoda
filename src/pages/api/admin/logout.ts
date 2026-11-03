import { ADMIN_COOKIE, sameOrigin } from '../../../lib/admin';

export const prerender = false;

export async function POST({ request, cookies, redirect }) {
	if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
	cookies.delete(ADMIN_COOKIE, { path: '/' });
	return redirect('/admin', 303);
}
