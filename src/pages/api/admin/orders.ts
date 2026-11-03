// Orders admin API (owner only): mark an order shipped / not shipped with a tracking
// number, and download the orders as a CSV.
import { isAdmin, sameOrigin } from '../../../lib/admin';

export const prerender = false;

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals, cookies }) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request) || !(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not allowed.' }, 403);
	const db = env.DB;
	if (!db) return json({ ok: false, error: 'No database.' }, 500);

	const body: any = await request.json().catch(() => null);
	const id = typeof body?.id === 'string' ? body.id : '';
	if (!id || id.length > 200) return json({ ok: false, error: 'Bad order id.' }, 400);
	const tracking = typeof body.tracking === 'string' ? body.tracking.trim().slice(0, 120) : null;

	const row = await db.prepare('SELECT shipped_at FROM orders WHERE id = ?').bind(id).first();
	if (!row) return json({ ok: false, error: 'Order not found.' }, 404);

	let shippedAt: number | null = row.shipped_at ?? null;
	if (body.shipped === true && !shippedAt) shippedAt = Math.floor(Date.now() / 1000);
	if (body.shipped === false) shippedAt = null;

	if (tracking === null) await db.prepare('UPDATE orders SET shipped_at = ? WHERE id = ?').bind(shippedAt, id).run();
	else await db.prepare('UPDATE orders SET shipped_at = ?, tracking = ? WHERE id = ?').bind(shippedAt, tracking || null, id).run();
	return json({ ok: true, shipped_at: shippedAt });
}

// CSV cells that start with = + - @ would be run as formulas by a spreadsheet, so they get a ' in front.
const cell = (v: unknown) => {
	let s = v === null || v === undefined ? '' : String(v);
	if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d\s()-]+$/.test(s)) s = "'" + s;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET({ locals, cookies }) {
	const env = locals.runtime?.env ?? {};
	if (!(await isAdmin(cookies, env))) return new Response('Not found', { status: 404 });
	const db = env.DB;
	if (!db) return new Response('No database', { status: 500 });
	const { results } = await db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
	const head = ['date_utc', 'order_id', 'name', 'email', 'phone', 'line1', 'line2', 'city', 'state', 'postal_code', 'country', 'currency', 'total', 'shipping', 'shipped_utc', 'tracking'];
	const iso = (t: number | null) => (t ? new Date(t * 1000).toISOString() : '');
	const lines = [head.join(',')];
	for (const o of results ?? []) {
		let a: any = {};
		try {
			a = o.address_json ? JSON.parse(o.address_json) : {};
		} catch {}
		lines.push(
			[
				iso(o.created_at), o.id, o.name, o.email, o.phone, a.line1, a.line2, a.city, a.state, a.postal_code,
				o.country || a.country, o.currency, ((o.amount_total ?? 0) / 100).toFixed(2), ((o.shipping_amount ?? 0) / 100).toFixed(2),
				iso(o.shipped_at), o.tracking,
			].map(cell).join(',')
		);
	}
	return new Response(lines.join('\r\n') + '\r\n', {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="orders.csv"',
			'Cache-Control': 'no-store',
		},
	});
}
