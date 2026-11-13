// MyPost Business import file. Default: every order marked Ready to ship. ?ids=a,b,c for chosen orders.
import { isAdmin } from '../../../lib/admin';
import { HEADERS, rowFor, shipFrom } from '../../../lib/auspostCsv';
import { statusOf } from '../../../lib/orders';

export const prerender = false;

const cell = (v: string) => {
	let s = v ?? '';
	if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET({ locals, cookies, url }) {
	const env = locals.runtime?.env ?? {};
	if (!(await isAdmin(cookies, env))) return new Response('Not found', { status: 404 });
	const db = env.DB;
	if (!db) return new Response('No database', { status: 500 });
	if (!shipFrom(env).postcode) {
		return new Response('Set the SHIP_FROM secret first (Name|Address line 1|Suburb|State|Postcode|Phone), then download again.', {
			status: 400,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}
	const ids = (url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
	const { results } = await db.prepare('SELECT * FROM orders ORDER BY created_at ASC').all();
	const rows = (results ?? []).filter((o: any) => (ids.length ? ids.includes(o.id) : statusOf(o) === 'ready'));
	const lines = [HEADERS.join(','), ...rows.map((o: any) => rowFor(o, env).map(cell).join(','))];
	const day = new Date().toISOString().slice(0, 10);
	return new Response(lines.join('\r\n') + '\r\n', {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="auspost-${day}.csv"`,
			'Cache-Control': 'no-store',
		},
	});
}
