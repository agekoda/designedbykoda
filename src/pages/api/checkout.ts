// Creates a real Stripe Checkout Session and returns its URL for the
// client to redirect to. The price for each currency is looked up here,
// server-side, never trusted from the client — a client could otherwise
// submit any amount it wanted for the "AUD" price, for example.
export const prerender = false;

const BASE_PRICE_USD = 70;
// Same static rates as the display page — see that file for sourcing
// notes. Kept in sync manually for now; worth centralizing in one shared
// file if more currencies get added later.
const RATES: Record<string, number> = {
	USD: 1,
	EUR: 0.86,
	GBP: 0.74,
	AUD: 1.386,
	CAD: 1.38,
};

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const secretKey = env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: 'Payments are not configured yet.' }, 500);
	}

	let currency: string;
	try {
		const body = await request.json();
		currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : 'USD';
	} catch {
		currency = 'USD';
	}

	if (!(currency in RATES)) {
		return json({ error: 'Unsupported currency.' }, 400);
	}

	const amountInMajorUnits = Math.round(BASE_PRICE_USD * RATES[currency]);
	// Stripe expects amounts in the smallest currency unit (cents), not
	// dollars/euros/etc directly.
	const amountInMinorUnits = amountInMajorUnits * 100;

	const origin = new URL(request.url).origin;

	const params = new URLSearchParams();
	params.set('mode', 'payment');
	params.set('line_items[0][price_data][currency]', currency.toLowerCase());
	params.set('line_items[0][price_data][product_data][name]', 'E-Ink Calendar (Preorder)');
	params.set('line_items[0][price_data][unit_amount]', String(amountInMinorUnits));
	params.set('line_items[0][quantity]', '1');
	params.set('success_url', `${origin}/preorder/success`);
	params.set('cancel_url', `${origin}/preorder/eink-calendar`);

	const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${secretKey}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: params.toString(),
	});

	if (!stripeRes.ok) {
		const errText = await stripeRes.text();
		console.error(`Stripe checkout session creation failed: ${errText}`);
		return json({ error: 'Could not start checkout. Please try again.' }, 502);
	}

	let session: any;
	try {
		session = await stripeRes.json();
	} catch {
		const rawText = await stripeRes.text().catch(() => '(could not read response)');
		console.error(`Stripe returned a non-JSON response despite an ok status: ${rawText}`);
		return json({ error: 'Could not start checkout. Please try again.' }, 502);
	}

	return json({ url: session.url }, 200);
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
