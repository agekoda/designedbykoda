// One email to you at midnight Perth time with the day's pre-orders (instead of one email per order).
// Nothing is sent on days with no orders. Runs from the cron in src/worker.ts.
import { emailHtml, footLink, sendEmail, ORIGIN } from './email';
import { SHIPPING_FX } from '../data/preorderPricing';

const PERTH = 8 * 3600; // UTC+8, no daylight saving

const money = (cents: number, cur: string) =>
	new Intl.NumberFormat('en-AU', { style: 'currency', currency: (cur || 'AUD').toUpperCase() }).format(cents / 100);

const countryName = (code: string) => {
	try {
		return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
	} catch {
		return code;
	}
};

// The Perth calendar day that has just ended, as [start, end) unix seconds.
export function yesterdayPerth(now = Date.now()) {
	const perthNow = Math.floor(now / 1000) + PERTH;
	const end = perthNow - (perthNow % 86400) - PERTH;
	return { start: end - 86400, end };
}

export async function runDailySummary(env: any, now = Date.now()) {
	const db = env.DB;
	if (!db) return;
	const { start, end } = yesterdayPerth(now);
	const { results } = await db
		.prepare("SELECT * FROM orders WHERE created_at >= ? AND created_at < ? AND COALESCE(status, '') <> 'cancelled'")
		.bind(start, end)
		.all();
	const orders: any[] = results ?? [];
	if (!orders.length) return;

	const totalRow: any = await db.prepare("SELECT COUNT(*) AS n FROM orders WHERE COALESCE(status, '') <> 'cancelled'").first().catch(() => null);
	const allTime = totalRow?.n ?? 0;

	// Money per currency, plus a rough total in AUD
	const byCur: Record<string, number> = {};
	let aud = 0;
	for (const o of orders) {
		const c = String(o.currency || 'aud').toUpperCase();
		byCur[c] = (byCur[c] ?? 0) + (o.amount_total ?? 0);
		aud += (o.amount_total ?? 0) / (SHIPPING_FX[c] ?? 1);
	}
	const countries: Record<string, number> = {};
	for (const o of orders) {
		let a: any = {};
		try {
			a = o.address_json ? JSON.parse(o.address_json) : {};
		} catch {}
		const c = String(o.country || a.country || '?').toUpperCase();
		countries[c] = (countries[c] ?? 0) + 1;
	}

	const day = new Date((start + PERTH) * 1000).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
	const n = orders.length;
	const curKeys = Object.keys(byCur).sort();
	const countryList = Object.entries(countries).sort((a, b) => b[1] - a[1]);
	const rows = [
		...curKeys.map((c) => ({ left: `Paid in ${c}`, right: money(byCur[c], c) })),
		...(curKeys.length > 1 || curKeys[0] !== 'AUD' ? [{ left: 'About, in AUD', right: money(Math.round(aud), 'AUD'), strong: true, rule: true }] : []),
	];
	const subject = `${n} pre-order${n === 1 ? '' : 's'} on ${day}`;
	const gifts = orders.filter((o) => o.gift_json).length;
	const lines = [
		`${n} new pre-order${n === 1 ? '' : 's'} from ${countryList.length} countr${countryList.length === 1 ? 'y' : 'ies'}. ${allTime} in total so far.`,
		...(gifts ? [`${gifts === n ? (n === 1 ? 'It is a gift' : 'All of them are gifts') : `${gifts} of them ${gifts === 1 ? 'is a gift' : 'are gifts'}`}: leave prices out of ${gifts === 1 ? 'that box' : 'those boxes'}.`] : []),
	];
	const blocks = [{ label: 'Countries', text: countryList.map(([c, k]) => `${countryName(c)}: ${k}`).join('\n') }];
	const html = emailHtml({
		title: subject,
		label: 'Daily summary',
		heading: `${n} pre-order${n === 1 ? '' : 's'}`,
		stat: { label: 'Taken, in AUD', value: money(Math.round(aud), 'AUD'), tone: 'good' },
		lines,
		rows,
		blocks,
		button: { label: 'Open the owner area', url: `${ORIGIN}/admin` },
		footer: footLink(`${ORIGIN}/admin`, 'designedbykoda.com/admin'),
		preview: `${money(Math.round(aud), 'AUD')} from ${countryList.length} countr${countryList.length === 1 ? 'y' : 'ies'}.`,
	});
	const text = [
		subject,
		'',
		...lines,
		'',
		...rows.map((r) => `${r.left}: ${r.right}`),
		'',
		'Countries:',
		...countryList.map(([c, k]) => `  ${countryName(c)}: ${k}`),
		'',
		`Owner area: ${ORIGIN}/admin`,
	].join('\n');
	const from = env.ORDER_EMAIL_FROM || 'dylan@designedbykoda.com';
	await sendEmail(env, { to: env.ORDER_EMAIL_TO || from, fromEmail: from, fromName: 'designedbykoda orders', subject, html, text, tags: ['daily-summary'] });
}
