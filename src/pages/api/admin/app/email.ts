// Send an order's receipt or "on its way" email again, from the owner app. Owner only.
import { isAdmin, sameOrigin } from '../../../../lib/admin';
import { fromRow, sendReceipt, sendShipped } from '../../../../lib/orderEmails';

export const prerender = false;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals, cookies }: any) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request) || !(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
	const b: any = await request.json().catch(() => null);
	const row: any = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(String(b?.id ?? '')).first().catch(() => null);
	if (!row) return json({ ok: false, error: 'Order not found.' }, 404);
	if (!row.email) return json({ ok: false, error: 'This order has no email address.' }, 400);
	if (b.kind === 'shipped' && !row.tracking) return json({ ok: false, error: 'Add a tracking number first.' }, 400);
	const sent = b.kind === 'shipped' ? await sendShipped(env, fromRow(row)) : b.kind === 'receipt' ? await sendReceipt(env, fromRow(row)) : false;
	if (sent && b.kind === 'shipped' && 'shipped_email_at' in row)
		await env.DB.prepare('UPDATE orders SET shipped_email_at = ? WHERE id = ?').bind(Math.floor(Date.now() / 1000), row.id).run().catch(() => {});
	return sent ? json({ ok: true }) : json({ ok: false, error: "The email didn't send. Check Brevo." }, 502);
}
