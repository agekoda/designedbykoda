// Email alerts (schema-alerts.sql), sent through Brevo by the Worker's cron, once an hour:
// - battery low: at 15% or less, once per discharge (again only after it's been charged)
// - not checking in: nothing for 2 days, past when it was due; once until it checks in again
// - firmware updated: optional, off unless they turn it on
// Each email has a one-click unsubscribe link (signed, no login needed).
import { batteryPercent } from './eink/battery';

export interface AlertPrefs {
	battery: boolean;
	offline: boolean;
	update: boolean;
}
export const DEFAULT_PREFS: AlertPrefs = { battery: true, offline: true, update: false };

export function parsePrefs(raw: unknown): AlertPrefs {
	try {
		const o = typeof raw === 'string' && raw ? JSON.parse(raw) : {};
		return { battery: o.battery !== false, offline: o.offline !== false, update: o.update === true };
	} catch {
		return { ...DEFAULT_PREFS };
	}
}

const ORIGIN = 'https://designedbykoda.com';
const LOW = 15; // %
const CHARGED = 40; // % before a new low-battery email can go out
const OFFLINE_SEC = 48 * 3600;
const MAX_PER_RUN = 60; // well under Brevo's free 300 a day

async function hmac(key: string, msg: string): Promise<string> {
	const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
	return btoa(String.fromCharCode(...s.slice(0, 18))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const unsubKey = (env: any) => String(env.TOKEN_ENCRYPTION_KEY || env.ADMIN_PASSWORD || '') + ':alerts';
export const unsubToken = (env: any, userId: string) => hmac(unsubKey(env), userId);
export async function unsubOk(env: any, userId: string, token: string) {
	if (!userId || !token || unsubKey(env) === ':alerts') return false;
	return (await unsubToken(env, userId)) === token;
}

export interface Mail {
	subject: string;
	kind: 'battery' | 'offline' | 'update';
	heading: string;
	device: string;
	lines: string[];
	stat?: { label: string; value: string; tone?: 'warn' | 'bad' | 'good' };
	button: { label: string; url: string };
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TONE = { warn: '#b45309', bad: '#b91c1c', good: '#15803d' };
const ICON = { battery: '🔋', offline: '📡', update: '✨' };

// The HTML version: a simple card that works in Gmail, Outlook and Apple Mail (tables and
// inline styles only), with the same words as the plain-text version.
export function alertHtml(m: Mail, unsub: string): string {
	const tone = m.stat ? TONE[m.stat.tone ?? 'warn'] : '#111111';
	const para = (l: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3f3f46">${escHtml(l)}</p>`;
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escHtml(m.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(m.lines[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
	<tr><td style="padding:0 6px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:-0.2px;color:#111111">designedbykoda</td></tr>
	<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:18px;padding:30px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
		<div style="font-size:30px;line-height:1;margin:0 0 16px">${ICON[m.kind]}</div>
		<div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#71717a;margin:0 0 6px">${escHtml(m.device)}</div>
		<h1 style="margin:0 0 18px;font-size:23px;line-height:1.25;font-weight:800;color:#111111">${escHtml(m.heading)}</h1>
		${
			m.stat
				? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:12px 16px"><div style="font-size:12px;color:#71717a;margin:0 0 2px">${escHtml(m.stat.label)}</div><div style="font-size:22px;font-weight:800;color:${tone}">${escHtml(m.stat.value)}</div></td></tr></table>`
				: ''
		}
		${m.lines.map(para).join('')}
		<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0"><tr><td style="background:#111111;border-radius:999px"><a href="${escHtml(m.button.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${escHtml(m.button.label)}</a></td></tr></table>
	</td></tr>
	<tr><td style="padding:18px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.6;color:#a1a1aa;text-align:center">
		You get this because email alerts are on for your E-Ink Calendar.<br>
		<a href="${ORIGIN}/dashboard" style="color:#71717a">Choose which emails you get</a> &nbsp;·&nbsp; <a href="${escHtml(unsub)}" style="color:#71717a">Unsubscribe</a>
	</td></tr>
</table></td></tr></table></body></html>`;
}

async function send(env: any, to: string, m: Mail, userId: string): Promise<boolean> {
	if (!env.BREVO_API_KEY) return false;
	const unsub = `${ORIGIN}/api/alerts/unsubscribe?u=${encodeURIComponent(userId)}&k=${await unsubToken(env, userId)}`;
	const text = [m.heading, '', ...m.lines, '', `${m.button.label}: ${m.button.url}`, '', '—', 'Change which emails you get: ' + ORIGIN + '/dashboard', 'Unsubscribe: ' + unsub].join('\n');
	try {
		const res = await fetch('https://api.brevo.com/v3/smtp/email', {
			method: 'POST',
			headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				sender: { name: 'designedbykoda', email: env.ALERT_EMAIL_FROM || env.ORDER_EMAIL_FROM || 'hello@designedbykoda.com' },
				to: [{ email: to }],
				subject: m.subject,
				textContent: text,
				htmlContent: alertHtml(m, unsub),
				headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
				tags: ['alert', m.kind],
			}),
		});
		if (!res.ok) console.error('alert email failed', res.status, await res.text().catch(() => ''));
		return res.ok;
	} catch (e) {
		console.error('alert email failed', e);
		return false;
	}
}

// The three emails (also used by scripts to preview them).
export const mails = {
	battery: (name: string, pct: number): Mail => ({
		kind: 'battery',
		subject: `${name}: battery at ${pct}%`,
		device: name,
		heading: 'Time to charge your calendar',
		stat: { label: 'Battery', value: `${pct}%`, tone: pct <= 5 ? 'bad' : 'warn' },
		lines: ['Charge it over USB-C for a few hours when you get a chance.', 'It keeps working until the battery runs out, then shows a “Battery low” screen.'],
		button: { label: 'Open your dashboard', url: ORIGIN + '/dashboard' },
	}),
	offline: (name: string, days: number): Mail => ({
		kind: 'offline',
		subject: `${name} hasn't checked in for ${days} days`,
		device: name,
		heading: `It hasn’t checked in for ${days} days`,
		stat: { label: 'Last heard from', value: `${days} days ago`, tone: 'bad' },
		lines: [
			'It may be showing an old screen. Press its button to wake it.',
			'If the screen doesn’t change, charge it for an hour and press it again. If it still doesn’t, it may not be reaching your Wi-Fi.',
		],
		button: { label: 'Get help', url: ORIGIN + '/projects/eink-calendar/help' },
	}),
	update: (name: string, from: string | null, to: string): Mail => {
		const back = !!from && cmpVer(to, from) < 0;
		return {
			kind: 'update',
			subject: back ? `${name} went back to version ${to}` : `${name} updated to ${to}`,
			device: name,
			heading: back ? `Back on version ${to}` : `Updated to version ${to}`,
			stat: { label: 'Firmware', value: from ? `${from}  →  ${to}` : to, tone: 'good' },
			lines: back
				? ['It went back to an earlier version by itself, while a fix is on the way. You don’t need to do anything.']
				: ['It installed the update by itself over Wi-Fi. You don’t need to do anything.'],
			button: { label: 'See what’s new', url: ORIGIN + '/changelog' },
		};
	},
};

function cmpVer(a: string, b: string) {
	const x = a.split('.').map(Number), y = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
	return 0;
}

// Called from the cron (every 5 minutes); does its work once an hour.
export async function runAlerts(env: any, force = false) {
	const db = env.DB;
	if (!db || (!force && new Date().getUTCMinutes() >= 5)) return;
	const now = Math.floor(Date.now() / 1000);
	let rows: any[] = [];
	try {
		const r = await db
			.prepare(
				`SELECT d.id, COALESCE(d.name, 'E-Ink Calendar') AS name, d.battery_mv, d.last_seen_at, d.next_wake_at, d.firmware,
				        d.alert_batt_at, d.alert_offline_at, d.alert_fw, u.id AS user_id, u.email, u.alerts
				 FROM devices d JOIN users u ON u.id = d.user_id
				 WHERE d.user_id IS NOT NULL`
			)
			.all();
		rows = r.results ?? [];
	} catch {
		return; // before schema-alerts.sql / schema-order-status.sql
	}
	let sent = 0;
	for (const d of rows) {
		const prefs = parsePrefs(d.alerts);
		const email = d.email as string | null;
		const pct = d.battery_mv ? batteryPercent(d.battery_mv / 1000) : null;

		// battery
		if (pct !== null && pct >= CHARGED && d.alert_batt_at) await db.prepare('UPDATE devices SET alert_batt_at = NULL WHERE id = ?').bind(d.id).run();
		if (pct !== null && pct <= LOW && !d.alert_batt_at) {
			if (prefs.battery && email && sent < MAX_PER_RUN) {
				const ok = await send(env, email, mails.battery(d.name, pct), d.user_id);
				if (ok) sent++;
				else continue; // try again next hour
			}
			await db.prepare('UPDATE devices SET alert_batt_at = ? WHERE id = ?').bind(now, d.id).run();
		}

		// not checking in
		const due = Math.max(d.last_seen_at ?? 0, d.next_wake_at ?? 0);
		const quiet = d.last_seen_at && now - d.last_seen_at > OFFLINE_SEC && now - due > 6 * 3600;
		if (d.alert_offline_at && d.last_seen_at && d.last_seen_at > d.alert_offline_at) await db.prepare('UPDATE devices SET alert_offline_at = NULL WHERE id = ?').bind(d.id).run();
		else if (quiet && !d.alert_offline_at) {
			if (prefs.offline && email && sent < MAX_PER_RUN) {
				const days = Math.floor((now - d.last_seen_at) / 86400);
				const ok = await send(env, email, mails.offline(d.name, days), d.user_id);
				if (ok) sent++;
				else continue;
			}
			await db.prepare('UPDATE devices SET alert_offline_at = ? WHERE id = ?').bind(now, d.id).run();
		}

		// firmware updated
		if (d.firmware && d.firmware !== d.alert_fw) {
			if (d.alert_fw && prefs.update && email && sent < MAX_PER_RUN) {
				const ok = await send(env, email, mails.update(d.name, d.alert_fw, d.firmware), d.user_id);
				if (ok) sent++;
				else continue;
			}
			await db.prepare('UPDATE devices SET alert_fw = ? WHERE id = ?').bind(d.firmware, d.id).run();
		}
	}
	if (sent) console.log(`alerts: sent ${sent}`);
}
