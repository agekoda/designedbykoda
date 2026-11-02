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

	try {
		await db
			.prepare(
				`INSERT OR IGNORE INTO orders (id, created_at, email, name, phone, address_json, country, currency, amount_total, shipping_amount)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(s.id, Math.floor(Date.now() / 1000), email, name, phone, addr ? JSON.stringify(addr) : null, country, currency, total, shippingAmt)
			.run();
	} catch (err) {
		console.error('Saving order failed:', err);
		return new Response('Database error', { status: 500 }); // Stripe will try again
	}

	await notifyOwner(env, { id: s.id, name, email, phone, addr, currency, total, shippingAmt });
	return new Response('ok', { status: 200 });
}

function money(cents: number, currency: string) {
	return `${(cents / 100).toFixed(2)} ${currency}`;
}

// Emails the order details through Brevo. Optional: skipped (and logged) when
// BREVO_API_KEY isn't set, and a failure here never fails the webhook.
async function notifyOwner(env: any, o: any) {
	if (!env.BREVO_API_KEY) {
		console.log('New order (no BREVO_API_KEY set, so no email):', o.id);
		return;
	}
	const a = o.addr || {};
	const lines = [
		`New preorder: ${money(o.total, o.currency)} (shipping ${money(o.shippingAmt, o.currency)})`,
		'',
		'Ship to:',
		o.name,
		a.line1,
		a.line2,
		[a.city, a.state, a.postal_code].filter(Boolean).join(' '),
		a.country,
		'',
		`Email: ${o.email}`,
		`Phone: ${o.phone || '(none)'}`,
		'',
		`Stripe: https://dashboard.stripe.com/payments (session ${o.id})`,
	].filter((l) => l !== undefined && l !== null);
	const from = env.ORDER_EMAIL_FROM || 'dylan@designedbykoda.com';
	const to = env.ORDER_EMAIL_TO || from;
	try {
		const res = await fetch('https://api.brevo.com/v3/smtp/email', {
			method: 'POST',
			headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				sender: { name: 'designedbykoda orders', email: from },
				to: [{ email: to }],
				subject: `New preorder: ${o.name || o.email}`,
				textContent: lines.join('\n'),
			}),
		});
		if (!res.ok) console.error('Order email failed:', res.status, await res.text().catch(() => ''));
	} catch (err) {
		console.error('Order email failed:', err);
	}
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
