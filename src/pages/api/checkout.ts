// Creates a real Stripe Checkout Session and returns its URL for the
// client to redirect to. The price for each currency is looked up here,
// server-side, never trusted from the client — a client could otherwise
// submit any amount it wanted for the "AUD" price, for example.
import { STANDARD_PRICES, preorderOpen, countryByCode, productPrice, shippingPrice, zoneLabel } from '../../data/preorderPricing';

export const prerender = false;

export async function POST({ request, locals }) {
	const env = locals.runtime?.env ?? {};
	const secretKey = env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		return json({ error: 'Payments are not configured yet.' }, 500);
	}

	if (!preorderOpen()) {
		return json({ error: 'Preorders are not open yet.' }, 403);
	}

	let currency = 'USD';
	let country = '';
	try {
		const body = await request.json();
		if (typeof body.currency === 'string') currency = body.currency.toUpperCase();
		if (typeof body.country === 'string') country = body.country.toUpperCase();
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}

	if (!(currency in STANDARD_PRICES)) {
		return json({ error: 'Unsupported currency.' }, 400);
	}
	if (!countryByCode(country)) {
		return json({ error: 'Please choose a country we ship to.' }, 400);
	}

	// Stripe expects amounts in the smallest currency unit (cents), not
	// dollars/euros/etc directly.
	const amountInMinorUnits = productPrice(currency) * 100;
	const shippingInMinorUnits = shippingPrice(currency, country) * 100;

	const origin = new URL(request.url).origin;

	const params = new URLSearchParams();
	params.set('mode', 'payment');
	params.set('line_items[0][price_data][currency]', currency.toLowerCase());
	params.set('line_items[0][price_data][product_data][name]', 'E-Ink Calendar (Preorder)');
	params.set('line_items[0][price_data][unit_amount]', String(amountInMinorUnits));
	params.set('line_items[0][quantity]', '1');
	// Shows an "Add promotion code" box on Stripe's page. Lets you test a live
	// payment for $1 with a private 100%-minus-$1 code made in the Stripe
	// dashboard. Remove this line once testing is done if you don't want the box.
	params.set('allow_promotion_codes', 'true');
	// The buyer enters their address on Stripe's page, locked to the country they
	// chose, so the shipping rate below always matches where it is going.
	params.set('shipping_address_collection[allowed_countries][0]', country);
	params.set('phone_number_collection[enabled]', 'true');
	params.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
	params.set('shipping_options[0][shipping_rate_data][display_name]', `Shipping to ${zoneLabel(country)}`);
	params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shippingInMinorUnits));
	params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', currency.toLowerCase());
	params.set('custom_text[shipping_address][message]', 'Preorder: ships by the end of January 2027. Please double-check your address.');
	params.set('metadata[country]', country);
	params.set('metadata[currency]', currency);
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
