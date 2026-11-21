// Today's Picture of the day for a category, for the dashboard previews (Settings, the builder).
// The same picture the calendars get (src/lib/potd.ts).
import { getPotd, grayToB64 } from '../../../lib/potd';
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=600' } });

export async function GET({ request, url, locals }: any) {
	const env = locals.runtime?.env ?? {};
	const db = env.DB;
	if (!db) return json({ error: 'Server is not fully configured yet.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	if (!(await getSessionUserId(request, db))) return json({ error: 'Not logged in.' }, 401);
	const p = await getPotd(db, url.searchParams.get('cat'));
	if (!p) return json({ ok: false });
	return json({ ok: true, day: p.day, title: p.title, credit: p.credit, gray: grayToB64(p.gray) });
}
