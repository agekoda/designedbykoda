// Owner password check for the pre-launch preorder preview.
import { PREVIEW_COOKIE, passwordMatches, previewToken } from '../../lib/preview';

export const prerender = false;

export async function POST({ request, locals, cookies, redirect }) {
	const env = locals.runtime?.env ?? {};
	const secret = env.PREVIEW_PASSWORD;
	const form = await request.formData().catch(() => null);
	const input = String(form?.get('password') ?? '');

	if (!secret || !(await passwordMatches(input, secret))) {
		return redirect('/preorder/unlock?wrong=1', 303);
	}

	cookies.set(PREVIEW_COOKIE, await previewToken(secret), {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30,
	});
	return redirect('/preorder/eink-calendar', 303);
}
