// Emails to buyers: the receipt when they pre-order (in place of Stripe's), and a "it's on
// its way" email when the order is marked Shipped on the admin page. Shared look: src/lib/email.ts.
import { emailHtml, footLink, ORIGIN, sendEmail, supportEmail } from './email';
import { orderNumber, trackingUrl } from './orders';

export const SHIPS_BY = 'the end of February 2027';
const ABN = '61 261 672 813';

const money = (cents: number, cur: string) => {
	try {
		return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur || 'AUD' }).format((cents ?? 0) / 100);
	} catch {
		return `${((cents ?? 0) / 100).toFixed(2)} ${cur}`;
	}
};
const addressLines = (name: string, a: any) =>
	[name, a?.line1, a?.line2, [a?.city, a?.state, a?.postal_code].filter(Boolean).join(' '), a?.country].filter(Boolean).join('\n');
const fromOrders = (env: any) => env.RECEIPT_EMAIL_FROM || 'orders@designedbykoda.com';
const foot = (env: any) =>
	`Questions? Reply to this email or write to ${footLink('mailto:' + supportEmail(env), supportEmail(env))}.<br>${footLink(ORIGIN + '/help', 'Help')} &nbsp;·&nbsp; ABN ${ABN}`;

export interface OrderInfo {
	id: string;
	email: string;
	name: string;
	addr: any;
	currency: string;
	total: number;
	shippingAmt: number;
	createdAt: number;
	tracking?: string | null;
}

export function receiptEmail(env: any, o: OrderInfo) {
	const num = orderNumber(o.id);
	const date = new Date(o.createdAt * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Perth' });
	const item = o.total - (o.shippingAmt ?? 0);
	const first = (o.name || '').split(/\s+/)[0];
	const track = `${ORIGIN}/preorder/success?order=${encodeURIComponent(o.id)}`;
	const lines = [
		`${first ? `Thanks, ${first}. ` : 'Thanks! '}Your E-Ink Calendar is reserved and ships by ${SHIPS_BY}. I'll email you again when it's on its way.`,
	];
	const rows = [
		{ left: 'E-Ink Calendar (pre-order)', right: money(item, o.currency) },
		{ left: 'Shipping', right: money(o.shippingAmt, o.currency) },
		{ left: 'Total paid', right: money(o.total, o.currency), strong: true, rule: true },
	];
	const blocks = [
		{ label: 'Order', text: `${num} · paid ${date}` },
		{ label: 'Ships to', text: addressLines(o.name, o.addr) },
	];
	const subject = `Your E-Ink Calendar pre-order (${num})`;
	const html = emailHtml({
		title: subject,
		label: `Order ${num}`,
		heading: 'Thanks for your pre-order',
		lines,
		rows,
		blocks,
		button: { label: 'Track your order', url: track },
		footer: foot(env),
		preview: `Ships by ${SHIPS_BY}. Total paid ${money(o.total, o.currency)}.`,
	});
	const text = [
		'Thanks for your pre-order',
		'',
		...lines,
		'',
		`Order ${num}, paid ${date}`,
		`E-Ink Calendar (pre-order): ${money(item, o.currency)}`,
		`Shipping: ${money(o.shippingAmt, o.currency)}`,
		`Total paid: ${money(o.total, o.currency)}`,
		'',
		'Ships to:',
		addressLines(o.name, o.addr),
		'',
		`Track your order: ${track}`,
		'',
		`Questions? Reply to this email or write to ${supportEmail(env)}.`,
		`ABN ${ABN}`,
	].join('\n');
	return { subject, html, text };
}

export function shippedEmail(env: any, o: OrderInfo) {
	const num = orderNumber(o.id);
	const url = trackingUrl(o.tracking);
	const first = (o.name || '').split(/\s+/)[0];
	const lines = [
		`${first ? `Good news, ${first}: your` : 'Your'} E-Ink Calendar has been posted.`,
		url ? 'Use the tracking number to see where it is. You can also follow it on your dashboard.' : 'You can follow it on your dashboard.',
	];
	const subject = `Your E-Ink Calendar is on its way (${num})`;
	const html = emailHtml({
		title: subject,
		label: `Order ${num}`,
		heading: 'It’s on its way',
		stat: o.tracking && !/^https?:/i.test(o.tracking) ? { label: 'Tracking number', value: o.tracking, tone: 'good' } : undefined,
		lines,
		blocks: [{ label: 'Going to', text: addressLines(o.name, o.addr) }],
		button: url ? { label: 'Track it', url } : { label: 'See your order', url: `${ORIGIN}/dashboard` },
		footer: foot(env),
	});
	const text = ['It’s on its way', '', ...lines, '', o.tracking ? `Tracking: ${o.tracking}` : '', url ? `Track it: ${url}` : `Your order: ${ORIGIN}/dashboard`, '', `Questions? Reply to this email or write to ${supportEmail(env)}.`]
		.filter((l, i, a) => l !== '' || a[i - 1] !== '')
		.join('\n');
	return { subject, html, text };
}

export async function sendReceipt(env: any, o: OrderInfo) {
	if (!o.email) return false;
	const m = receiptEmail(env, o);
	return sendEmail(env, { to: o.email, fromEmail: fromOrders(env), subject: m.subject, html: m.html, text: m.text, tags: ['receipt'] });
}
export async function sendShipped(env: any, o: OrderInfo) {
	if (!o.email) return false;
	const m = shippedEmail(env, o);
	return sendEmail(env, { to: o.email, fromEmail: fromOrders(env), subject: m.subject, html: m.html, text: m.text, tags: ['shipped'] });
}

// From an orders table row
export function fromRow(r: any): OrderInfo {
	let addr: any = {};
	try {
		addr = r.address_json ? JSON.parse(r.address_json) : {};
	} catch {}
	return { id: r.id, email: r.email, name: r.name, addr, currency: r.currency, total: r.amount_total ?? 0, shippingAmt: r.shipping_amount ?? 0, createdAt: r.created_at, tracking: r.tracking };
}
