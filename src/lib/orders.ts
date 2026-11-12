// Pre-orders as buyers and the admin page see them (schema-orders.sql + schema-order-status.sql).

export const STATUSES = ['ordered', 'making', 'ready', 'shipped', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

// For the admin page
export const ADMIN_LABEL: Record<Status, string> = {
	ordered: 'Ordered',
	making: 'Being made',
	ready: 'Ready to ship',
	shipped: 'Shipped',
	delivered: 'Delivered',
	cancelled: 'Cancelled',
};
// The steps a buyer sees ("ready" shows as still being made: it's not on its way yet)
export const BUYER_STEPS = ['Ordered', 'Being made', 'Shipped', 'Delivered'];
export const buyerStep = (s: Status) => (s === 'ordered' ? 0 : s === 'making' || s === 'ready' ? 1 : s === 'shipped' ? 2 : s === 'delivered' ? 3 : -1);

export const isStatus = (s: unknown): s is Status => typeof s === 'string' && (STATUSES as readonly string[]).includes(s);

// Older orders only have shipped_at.
export function statusOf(o: { status?: string | null; shipped_at?: number | null; delivered_at?: number | null }): Status {
	if (isStatus(o.status)) return o.status;
	if (o.delivered_at) return 'delivered';
	return o.shipped_at ? 'shipped' : 'ordered';
}

// A short order number buyers can quote: the end of the Stripe checkout id.
export const orderNumber = (id: string) => id.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();

// A tracking number becomes an Australia Post link; a pasted link is used as it is.
export function trackingUrl(t: string | null | undefined): string | null {
	const s = (t ?? '').trim();
	if (!s) return null;
	if (/^https:\/\/\S+$/i.test(s)) return s;
	return 'https://auspost.com.au/mypost/track/details/' + encodeURIComponent(s.replace(/\s+/g, ''));
}

// Link any unlinked orders paid with this email to the account (called at sign-in).
export async function linkOrdersByEmail(db: any, userId: string, email: string | null | undefined) {
	const e = (email ?? '').trim().toLowerCase();
	if (!e) return;
	try {
		await db.prepare('UPDATE orders SET user_id = ? WHERE user_id IS NULL AND lower(email) = ?').bind(userId, e).run();
	} catch {}
}

// Orders that belong to an account: linked to it, or paid with its email and not linked to anyone else.
export async function ordersForUser(db: any, userId: string): Promise<any[]> {
	try {
		const u: any = await db.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();
		const e = (u?.email ?? '').toLowerCase();
		const r = await db
			.prepare('SELECT * FROM orders WHERE user_id = ? OR (user_id IS NULL AND ? <> \'\' AND lower(email) = ?) ORDER BY created_at DESC')
			.bind(userId, e, e)
			.all();
		return r.results ?? [];
	} catch {
		return [];
	}
}
