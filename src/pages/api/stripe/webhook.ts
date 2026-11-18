// Stripe tells us here when a payment goes through. We check the message really
// came from Stripe (its signature), save the order with the shipping address in
// the database, and email the details to the shop owner.
export const prerender = false;

const TOLERANCE_SEC = 5 * 60;

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const secret = env.STRIPE_WEBHOOK_SECRET;
	const db = env.DB;
	if (!secret || !db) return new Response('Not configured', { status: 500 });

	const raw = await request.text();
	if (!(await verify(raw, request.headers.get('stripe-signature') || '', secret))) {
		return new Response('Bad signature', { status: 400 });
	}

	let event: any;
	try {
		event = JSON.parse(raw);
	} catch {
		return new Response('Bad JSON', { status: 400 });
	}

	// Other event types are fine to ignore.
	if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
		return new Response('ok', { status: 200 });
	}
	const s = event.data?.object;
	if (!s || s.payment_status !== 'paid') return new Response('ok', { status: 200 });

	// Stripe moved the shipping address between API versions; read either place.
	const ship = s.collected_information?.shipping_details ?? s.shipping_details ?? null;
	const addr = ship?.address ?? null;
	const cust = s.customer_details ?? {};
	const name = ship?.name || cust.name || '';
	const email = cust.email || '';
	const phone = cust.phone || '';
	const country = addr?.country || s.metadata?.country || '';
	const currency = String(s.currency || '').toUpperCase();
	const total = s.amount_total ?? 0;
	const shippingAmt = s.total_details?.amount_shipping ?? s.shipping_cost?.amount_total ?? 0;

	let isNew = false;
	try {
		const ins = await db
			.prepare(
				`INSERT OR IGNORE INTO orders (id, created_at, email, name, phone, address_json, country, currency, amount_total, shipping_amount)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(s.id, Math.floor(Date.now() / 1000), email, name, phone, addr ? JSON.stringify(addr) : null, country, currency, total, shippingAmt)
			.run();
		isNew = (ins?.meta?.changes ?? 1) > 0; // Stripe can send the same event twice
	} catch (err) {
		console.error('Saving order failed:', err);
		return new Response('Database error', { status: 500 }); // Stripe will try again
	}

	if (!isNew) return new Response('ok', { status: 200 });
	// A gift (src/lib/gift.ts): saved on its own so a database without schema-gift.sql still takes the order.
	const md = s.metadata ?? {};
	const gift = md.gift === '1' ? { to: md.gift_to ?? '', from: md.gift_from ?? '', msg: md.gift_msg ?? '' } : null;
	if (gift) {
		try {
			const { sanitizeGift } = await import('../../../lib/gift');
			await db.prepare('UPDATE orders SET gift_json = ? WHERE id = ?').bind(JSON.stringify(sanitizeGift(gift)), s.id).run();
		} catch (err) {
			console.error('Saving gift details failed (run schema-gift.sql):', err);
		}
	}
	// The buyer's receipt (Stripe's own receipt emails are turned off). You get one summary a day instead
	// of an email per order: src/lib/dailySummary.ts.
	const { sendReceipt } = await import('../../../lib/orderEmails');
	await sendReceipt(env, { id: s.id, email, name, addr, currency, total, shippingAmt, createdAt: Math.floor(Date.now() / 1000), gift, buyerName: cust.name || '' });
	return new Response('ok', { status: 200 });
}

// Stripe signs "<timestamp>.<body>" with the webhook secret (HMAC-SHA256).
async function verify(body: string, header: string, secret: string): Promise<boolean> {
	let t = '';
	const sigs: string[] = [];
	for (const part of header.split(',')) {
		const [k, v] = part.split('=');
		if (k === 't') t = v;
		else if (k === 'v1' && v) sigs.push(v);
	}
	if (!t || !sigs.length) return false;
	if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_SEC) return false;
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
	const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
	return sigs.some((sig) => safeEqual(sig, expected));
}

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
