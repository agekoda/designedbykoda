// Single source of truth for preorder prices. The preorder page shows these
// and /api/checkout charges them, so the two can never disagree.
// Rates are fixed on purpose (a stable, round price per currency), not live.
export const BASE_PRICE_USD = 70;

export const CURRENCIES = [
	{ code: 'USD', symbol: '$', rate: 1, name: 'US Dollar' },
	{ code: 'EUR', symbol: '€', rate: 0.86, name: 'Euro' },
	{ code: 'GBP', symbol: '£', rate: 0.74, name: 'British Pound' },
	{ code: 'AUD', symbol: 'A$', rate: 1.386, name: 'Australian Dollar' },
	{ code: 'CAD', symbol: 'C$', rate: 1.38, name: 'Canadian Dollar' },
] as const;

export const RATES: Record<string, number> = Object.fromEntries(
	CURRENCIES.map((c) => [c.code, c.rate]),
);
