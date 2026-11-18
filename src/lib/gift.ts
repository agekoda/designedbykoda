// Gift orders. At checkout the buyer can tick "This is a gift" and add who it's for, who it's
// from and a short message. It goes to Stripe as metadata, the webhook saves it on the order
// (orders.gift_json, schema-gift.sql), and the buyer can print a gift card from /gift.
export interface Gift {
	to: string;
	from: string;
	msg: string;
}
export const GIFT_MAX = { to: 40, from: 40, msg: 300 };

const clean = (v: unknown, max: number, lines = false) =>
	typeof v === 'string'
		? (lines ? v.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n') : v.replace(/\s+/g, ' '))
				.replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, '')
				.trim()
				.slice(0, max)
		: '';

export function sanitizeGift(raw: unknown): Gift | null {
	let v: any = raw;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			return null;
		}
	}
	if (!v || typeof v !== 'object') return null;
	return { to: clean(v.to, GIFT_MAX.to), from: clean(v.from, GIFT_MAX.from), msg: clean(v.msg, GIFT_MAX.msg, true) };
}

export const giftUrl = (origin: string, orderId: string) => `${origin}/gift?o=${encodeURIComponent(orderId)}`;
