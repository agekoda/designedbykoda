// Single source of truth for preorder prices and shipping. The preorder page
// shows these and /api/checkout charges them, so the two can never disagree.
// Prices are fixed on purpose (a stable, round price per currency), not live.

// Launch pricing. For a limited time the calendar is cheaper (the early-bird
// price), then it goes up to the standard price. The server decides which one
// applies when someone checks out, so the page can't be used to cheat the timer.
//
// Preorders open at this moment (midnight at the start of 30 November, Perth).
// Until then the preorder page sends visitors to the project page and checkout
// refuses orders. To open early, set this to a time that has already passed.
export const PREORDER_OPENS = '2026-11-29T16:00:00Z';
export function preorderOpen(now: number = Date.now()): boolean {
	return now >= Date.parse(PREORDER_OPENS);
}

// EARLY_BIRD_ENDS is when the early-bird price stops. To test the countdown,
// set it a minute or two from now; to start a real launch, set it to 72 hours
// after you go live. Use UTC, e.g. '2026-11-05T13:30:00Z' (Perth is UTC+8).
export const EARLY_BIRD_ENDS = '2026-12-02T16:00:00Z';

// What the calendar costs, in each currency, in whole units.
export const EARLY_PRICES: Record<string, number> = { USD: 77, EUR: 66, GBP: 57, AUD: 109, CAD: 106 };
export const STANDARD_PRICES: Record<string, number> = { USD: 83, EUR: 71, GBP: 61, AUD: 119, CAD: 115 };
export const PRICES = STANDARD_PRICES;
export const BASE_PRICE_USD = STANDARD_PRICES.USD;

// Shipping is quoted in Australian dollars (below). This is how many units of
// each currency equal A$1 for shipping, so shipping doesn't move when the product
// price changes from early-bird to standard.
export const SHIPPING_FX: Record<string, number> = { AUD: 1, USD: 0.7, EUR: 0.6, GBP: 0.52, CAD: 0.97 };

export function earlyBirdActive(now: number = Date.now()): boolean {
	return now < Date.parse(EARLY_BIRD_ENDS);
}

export const CURRENCIES = [
	{ code: 'USD', symbol: '$', name: 'US Dollar' },
	{ code: 'EUR', symbol: '€', name: 'Euro' },
	{ code: 'GBP', symbol: '£', name: 'British Pound' },
	{ code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
	{ code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
] as const;

// Shipping zones. `aud` is the fixed shipping charge in Australian dollars
// (postage + about A$1.50 for packing and Stripe's fee, from your Australia Post
// and Zonos quotes). Other currencies are converted using the prices above.
// Update these numbers when the quotes change.
export const ZONES: Record<string, { label: string; aud: number }> = {
	au: { label: 'Australia', aud: 11 },
	nz: { label: 'New Zealand', aud: 21 },
	asia: { label: 'Asia', aud: 24 },
	ca: { label: 'Canada', aud: 26 },
	eu: { label: 'Europe', aud: 32 },
	uk: { label: 'the UK', aud: 32 },
	// Postage A$23.05 + about A$16.94 US import duty, collected up front.
	us: { label: 'the USA', aud: 44 },
	// Add countries to this zone (below) once you have a quote. Assumed A$28.40 postage.
	row: { label: 'your country', aud: 32 },
};

// Countries you sell to. Anything not listed here can't check out.
// `cur` is the currency picked automatically for that country (changeable).
// Germany and Italy are left out on purpose, as in your quotes.
export const COUNTRIES: { code: string; name: string; zone: keyof typeof ZONES; cur: string }[] = [
	{ code: 'AU', name: 'Australia', zone: 'au', cur: 'AUD' },
	{ code: 'NZ', name: 'New Zealand', zone: 'nz', cur: 'AUD' },
	{ code: 'JP', name: 'Japan', zone: 'asia', cur: 'USD' },
	{ code: 'SG', name: 'Singapore', zone: 'asia', cur: 'USD' },
	{ code: 'CN', name: 'China', zone: 'asia', cur: 'USD' },
	{ code: 'CA', name: 'Canada', zone: 'ca', cur: 'CAD' },
	{ code: 'US', name: 'United States', zone: 'us', cur: 'USD' },
	{ code: 'GB', name: 'United Kingdom', zone: 'uk', cur: 'GBP' },
	{ code: 'AT', name: 'Austria', zone: 'eu', cur: 'EUR' },
	{ code: 'BE', name: 'Belgium', zone: 'eu', cur: 'EUR' },
	{ code: 'BG', name: 'Bulgaria', zone: 'eu', cur: 'EUR' },
	{ code: 'HR', name: 'Croatia', zone: 'eu', cur: 'EUR' },
	{ code: 'CY', name: 'Cyprus', zone: 'eu', cur: 'EUR' },
	{ code: 'CZ', name: 'Czechia', zone: 'eu', cur: 'EUR' },
	{ code: 'DK', name: 'Denmark', zone: 'eu', cur: 'EUR' },
	{ code: 'EE', name: 'Estonia', zone: 'eu', cur: 'EUR' },
	{ code: 'FI', name: 'Finland', zone: 'eu', cur: 'EUR' },
	{ code: 'FR', name: 'France', zone: 'eu', cur: 'EUR' },
	{ code: 'GR', name: 'Greece', zone: 'eu', cur: 'EUR' },
	{ code: 'HU', name: 'Hungary', zone: 'eu', cur: 'EUR' },
	{ code: 'IE', name: 'Ireland', zone: 'eu', cur: 'EUR' },
	{ code: 'LV', name: 'Latvia', zone: 'eu', cur: 'EUR' },
	{ code: 'LT', name: 'Lithuania', zone: 'eu', cur: 'EUR' },
	{ code: 'LU', name: 'Luxembourg', zone: 'eu', cur: 'EUR' },
	{ code: 'MT', name: 'Malta', zone: 'eu', cur: 'EUR' },
	{ code: 'NL', name: 'Netherlands', zone: 'eu', cur: 'EUR' },
	{ code: 'PL', name: 'Poland', zone: 'eu', cur: 'EUR' },
	{ code: 'PT', name: 'Portugal', zone: 'eu', cur: 'EUR' },
	{ code: 'RO', name: 'Romania', zone: 'eu', cur: 'EUR' },
	{ code: 'SK', name: 'Slovakia', zone: 'eu', cur: 'EUR' },
	{ code: 'SI', name: 'Slovenia', zone: 'eu', cur: 'EUR' },
	{ code: 'ES', name: 'Spain', zone: 'eu', cur: 'EUR' },
	{ code: 'SE', name: 'Sweden', zone: 'eu', cur: 'EUR' },
];

export function countryByCode(code: string) {
	return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

// Product price in whole units of `currency` right now.
export function productPrice(currency: string, now: number = Date.now()): number {
	return (earlyBirdActive(now) ? EARLY_PRICES : STANDARD_PRICES)[currency];
}

// Shipping in whole units of `currency` (the AUD charge scaled by SHIPPING_FX).
export function shippingPrice(currency: string, country: string): number {
	const c = countryByCode(country);
	if (!c) return 0;
	return Math.round(ZONES[c.zone].aud * SHIPPING_FX[currency]);
}

export function zoneLabel(country: string): string {
	const c = countryByCode(country);
	return c ? ZONES[c.zone].label : 'your country';
}
