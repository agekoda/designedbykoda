// Orders admin API (owner only): set orders' status (one or many), tracking and notes,
// and download the orders as a CSV.
import { isAdmin, sameOrigin } from '../../../lib/admin';
import { isStatus, orderNumber, statusOf } from '../../../lib/orders';

export const prerender = false;

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals, cookies }) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request) || !(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not allowed.' }, 403);
	const db = env.DB;
	if (!db) return json({ ok: false, error: 'No database.' }, 500);

	const body: any = await request.json().catch(() => null);
	// One order or many: { ids: [...] } (older pages send { id })
	const ids: string[] = (Array.isArray(body?.ids) ? body.ids : [body?.id]).filter((x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 200).slice(0, 2000);
	if (!ids.length) return json({ ok: false, error: 'Bad order id.' }, 400);
	const now = Math.floor(Date.now() / 1000);
	const txt = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) || null : undefined);
	const tracking = txt(body.tracking, 300);
	const cnote = txt(body.customer_note, 300);
	const anote = txt(body.admin_note, 500);
	// older pages: shipped true/false
	let status: string | undefined = isStatus(body.status) ? body.status : body.shipped === true ? 'shipped' : body.shipped === false ? 'ordered' : undefined;

	for (const id of ids) {
		const row: any = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
		if (!row) continue;
		const sets: string[] = [];
		const vals: unknown[] = [];
		// Adding a tracking number to an order that hasn't shipped yet means it has shipped.
		let st = status;
		const before = statusOf(row);
		if (tracking && !row.tracking && (!st || st === before) && ['ordered', 'making', 'ready'].includes(before)) st = 'shipped';
		if (st && st !== before) {
			sets.push('shipped_at = ?', 'delivered_at = ?');
			// keep the dates that go with the status
			const shippedAt = st === 'shipped' || st === 'delivered' ? (row.shipped_at ?? now) : null;
			const deliveredAt = st === 'delivered' ? (row.delivered_at ?? now) : null;
			vals.push(shippedAt, deliveredAt);
			if ('status' in row) {
				sets.push('status = ?', 'status_at = ?');
				vals.push(st, now);
			}
		}
		if (tracking !== undefined) (sets.push('tracking = ?'), vals.push(tracking));
		if (cnote !== undefined && 'customer_note' in row) (sets.push('customer_note = ?'), vals.push(cnote));
		if (anote !== undefined && 'admin_note' in row) (sets.push('admin_note = ?'), vals.push(anote));
		if (!sets.length) continue;
		await db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
		// Shipped and it has a tracking number: email the buyer once ("It's on its way" + tracking).
		const finalStatus = st ?? before;
		const finalTracking = tracking !== undefined ? tracking : row.tracking;
		const alreadySent = 'shipped_email_at' in row ? !!row.shipped_email_at : before === 'shipped' || before === 'delivered';
		if (finalStatus === 'shipped' && finalTracking && !alreadySent) {
			const { sendShipped, fromRow } = await import('../../../lib/orderEmails');
			if ((await sendShipped(env, fromRow({ ...row, tracking: finalTracking }))) && 'shipped_email_at' in row)
				await db.prepare('UPDATE orders SET shipped_email_at = ? WHERE id = ?').bind(now, id).run();
		}
	}
	return json({ ok: true });
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
	const head = ['date_utc', 'order_number', 'status', 'order_id', 'name', 'email', 'phone', 'line1', 'line2', 'city', 'state', 'postal_code', 'country', 'currency', 'total', 'shipping', 'shipped_utc', 'tracking'];
	const iso = (t: number | null) => (t ? new Date(t * 1000).toISOString() : '');
	const lines = [head.join(',')];
	for (const o of results ?? []) {
		let a: any = {};
		try {
			a = o.address_json ? JSON.parse(o.address_json) : {};
		} catch {}
		lines.push(
			[
				iso(o.created_at), orderNumber(o.id), statusOf(o), o.id, o.name, o.email, o.phone, a.line1, a.line2, a.city, a.state, a.postal_code,
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
