// After checkout: link the order that was just paid for to the signed-in account, so it
// shows on their dashboard (/preorder/success calls this). The checkout id in the URL is
// long and random, so knowing it is proof enough that this is the buyer.
export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ error: 'Not configured.' }, 500);
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Sign in first.' }, 401);
	const body: any = await request.json().catch(() => null);
	const id = typeof body?.order === 'string' ? body.order : '';
	if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return json({ error: 'Bad order.' }, 400);
	try {
		const o: any = await db.prepare('SELECT user_id FROM orders WHERE id = ?').bind(id).first();
		if (!o) return json({ ok: true, found: false }); // the payment notice from Stripe hasn't arrived yet
		if (o.user_id && o.user_id !== userId) return json({ ok: true, found: true, linked: false });
		await db.prepare('UPDATE orders SET user_id = ? WHERE id = ? AND user_id IS NULL').bind(userId, id).run();
		return json({ ok: true, found: true, linked: true });
	} catch {
		return json({ error: 'Order tracking isn’t set up yet.' }, 500);
	}
}
