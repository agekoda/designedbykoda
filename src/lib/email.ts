// Emails to customers (alerts, receipts, shipping), sent through Brevo, in the website's look:
// dark, no images or web fonts, tables and inline styles only so they look the same in Gmail,
// Outlook and Apple Mail. Replies go to the support inbox.
export const ORIGIN = 'https://designedbykoda.com';
export const supportEmail = (env: any) => env.SUPPORT_EMAIL || 'support@designedbykoda.com';

const C = { bg: '#0a0a0a', card: '#121212', border: '#262626', fg: '#f5f5f5', muted: '#a3a3a3', dim: '#737373', accent: '#5aa0dc' };
export const TONE = { warn: '#f5a524', bad: '#f06b6b', good: '#5bd08a' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Card {
	title: string; // <title> and the inbox preview fallback
	label: string; // small blue label above the heading
	heading: string;
	stat?: { label: string; value: string; tone?: keyof typeof TONE };
	lines: string[];
	rows?: { left: string; right: string; strong?: boolean; rule?: boolean }[]; // a receipt-style table
	blocks?: { label: string; text: string }[]; // small labelled blocks, e.g. "Ships to"
	button?: { label: string; url: string };
	footer: string; // html, already escaped
	preview?: string;
}

export function emailHtml(m: Card): string {
	const para = (l: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${C.muted}">${esc(l)}</p>`;
	const stat = m.stat
		? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr><td bgcolor="${C.bg}" style="background:${C.bg};border:1px solid ${C.border};border-radius:14px;padding:13px 18px"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.dim};margin:0 0 4px">${esc(m.stat.label)}</div><div style="font-size:24px;font-weight:800;letter-spacing:-0.3px;color:${TONE[m.stat.tone ?? 'warn']}">${esc(m.stat.value)}</div></td></tr></table>`
		: '';
	const rows = m.rows?.length
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px">${m.rows
				.map(
					(r) =>
						`<tr><td style="padding:${r.rule ? '12px' : '7px'} 0 7px;${r.rule ? `border-top:1px solid ${C.border};` : ''}font-size:15px;color:${r.strong ? C.fg : C.muted};font-weight:${r.strong ? 800 : 400}">${esc(r.left)}</td><td align="right" style="padding:${r.rule ? '12px' : '7px'} 0 7px;${r.rule ? `border-top:1px solid ${C.border};` : ''}font-size:15px;color:${r.strong ? C.fg : C.muted};font-weight:${r.strong ? 800 : 400};white-space:nowrap">${esc(r.right)}</td></tr>`
				)
				.join('')}</table>`
		: '';
	const blocks = (m.blocks ?? [])
		.map(
			(b) =>
				`<div style="margin:0 0 16px"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.dim};margin:0 0 5px">${esc(b.label)}</div><div style="font-size:14px;line-height:1.6;color:${C.muted}">${esc(b.text).replace(/\n/g, '<br>')}</div></div>`
		)
		.join('');
	const button = m.button
		? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 0"><tr><td bgcolor="${C.fg}" style="background:${C.fg};border-radius:999px"><a href="${esc(m.button.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;font-weight:800;color:${C.bg};text-decoration:none;border-radius:999px">${esc(m.button.label)}</a></td></tr></table>`
		: '';
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(m.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m.preview ?? m.lines[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg}"><tr><td align="center" style="padding:36px 14px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
	<tr><td style="padding:0 4px 18px;font-family:${FONT};font-size:16px;font-weight:800;letter-spacing:-0.3px;color:${C.fg}">designedbykoda</td></tr>
	<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:20px;padding:30px 28px 30px;font-family:${FONT}">
		<div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${C.accent};margin:0 0 8px">${esc(m.label)}</div>
		<h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.3px;color:${C.fg}">${esc(m.heading)}</h1>
		${stat}${m.lines.map(para).join('')}${rows}${blocks}${button}
	</td></tr>
	<tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.dim};text-align:center">${m.footer}</td></tr>
</table></td></tr></table></body></html>`;
}
export const footLink = (href: string, text: string) => `<a href="${esc(href)}" style="color:${C.muted}">${esc(text)}</a>`;

export async function sendEmail(
	env: any,
	o: { to: string; fromEmail: string; fromName?: string; subject: string; html: string; text: string; headers?: Record<string, string>; tags?: string[] }
): Promise<boolean> {
	if (!env.BREVO_API_KEY) {
		console.log('No BREVO_API_KEY, so no email:', o.subject);
		return false;
	}
	try {
		const res = await fetch('https://api.brevo.com/v3/smtp/email', {
			method: 'POST',
			headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				sender: { name: o.fromName ?? 'designedbykoda', email: o.fromEmail },
				replyTo: { email: supportEmail(env), name: 'designedbykoda support' },
				to: [{ email: o.to }],
				subject: o.subject,
				textContent: o.text,
				htmlContent: o.html,
				...(o.headers ? { headers: o.headers } : {}),
				...(o.tags ? { tags: o.tags } : {}),
			}),
		});
		if (!res.ok) console.error('email failed', res.status, await res.text().catch(() => ''));
		return res.ok;
	} catch (e) {
		console.error('email failed', e);
		return false;
	}
}
