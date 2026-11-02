// Single source of truth for preorder prices and shipping. The preorder page
// shows these and /api/checkout charges them, so the two can never disagree.
// Prices are fixed on purpose (a stable, round price per currency), not live.

// What the calendar costs, in each currency, in whole units. Change these to
// change the price everywhere. (A$106 + A$13 Australian shipping = A$119 total;
// the other currencies are about the same value.)
export const PRICES: Record<string, number> = {
	USD: 75,
	EUR: 64,
	GBP: 55,
	AUD: 106,
	CAD: 103,
};
export const BASE_PRICE_USD = PRICES.USD;

export const CURRENCIES = [
	{ code: 'USD', symbol: '$', name: 'US Dollar' },
	{ code: 'EUR', symbol: '€', name: 'Euro' },
	{ code: 'GBP', symbol: '£', name: 'British Pound' },
	{ code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
	{ code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
] as const;

// Optional: a different product price for one country, in one currency, e.g. to
// build US import duty into the price. Example:  US: { USD: 92 }
// (If you do that, lower the US shipping below so the duty isn't charged twice.)
export const PRICE_OVERRIDES: Record<string, Record<string, number>> = {};

// Shipping zones. `aud` is the fixed shipping charge in Australian dollars
// (postage + about A$1.50 for packing and Stripe's fee, from your Australia Post
// and Zonos quotes). Other currencies are converted using the prices above.
// Update these numbers when the quotes change.
export const ZONES: Record<string, { label: string; aud: number }> = {
	au: { label: 'Australia', aud: 13 },
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

// Product price in whole units of `currency` for a buyer in `country`.
export function productPrice(currency: string, country: string): number {
	return PRICE_OVERRIDES[country]?.[currency] ?? PRICES[currency];
}

// Shipping in whole units of `currency` (the AUD charge scaled by the price ratio).
export function shippingPrice(currency: string, country: string): number {
	const c = countryByCode(country);
	if (!c) return 0;
	const aud = ZONES[c.zone].aud;
	return Math.round((aud * PRICES[currency]) / PRICES.AUD);
}

export function zoneLabel(country: string): string {
	const c = countryByCode(country);
	return c ? ZONES[c.zone].label : 'your country';
}
