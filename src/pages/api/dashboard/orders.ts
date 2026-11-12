// The signed-in buyer's pre-orders, for the dashboard (src/lib/orders.ts).
export const prerender = false;
import { buyerStep, orderNumber, ordersForUser, statusOf, trackingUrl } from '../../../lib/orders';

export async function GET({ request, locals }: any) {
	const db = locals.runtime?.env?.DB;
	const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
	if (!db) return json({ orders: [] });
	const { getSessionUserId } = await import('../../../lib/session');
	const userId = await getSessionUserId(request, db);
	if (!userId) return json({ error: 'Not logged in.' }, 401);
	const rows = await ordersForUser(db, userId);
	return json({
		orders: rows.map((o) => {
			let a: any = {};
			try {
				a = o.address_json ? JSON.parse(o.address_json) : {};
			} catch {}
			const status = statusOf(o);
			return {
				number: orderNumber(o.id),
				createdAt: o.created_at,
				total: o.amount_total ?? 0,
				currency: o.currency || 'AUD',
				status,
				step: buyerStep(status),
				statusAt: o.status_at ?? null,
				shippedAt: o.shipped_at ?? null,
				deliveredAt: o.delivered_at ?? null,
				tracking: o.tracking || null,
				trackingUrl: trackingUrl(o.tracking),
				note: o.customer_note || null,
				// enough of the address to recognise it, not the whole thing
				shipTo: [a.city, a.state, a.country || o.country].filter(Boolean).join(', '),
			};
		}),
	});
}
