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

async function send(env: any, to: string, subject: string, lines: string[], userId: string): Promise<boolean> {
	if (!env.BREVO_API_KEY) return false;
	const unsub = `${ORIGIN}/api/alerts/unsubscribe?u=${encodeURIComponent(userId)}&k=${await unsubToken(env, userId)}`;
	const text = [...lines, '', '—', 'Change which emails you get: ' + ORIGIN + '/dashboard', 'Stop all of these emails: ' + unsub].join('\n');
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const html =
		`<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:520px">` +
		lines.map((l) => (l ? `<p style="margin:0 0 12px">${esc(l).replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>` : '')).join('') +
		`<p style="margin:24px 0 0;font-size:12px;color:#777">You get this because email alerts are on for your E-Ink Calendar. <a href="${ORIGIN}/dashboard" style="color:#777">Choose which emails you get</a> · <a href="${unsub}" style="color:#777">Stop all of these emails</a></p></div>`;
	try {
		const res = await fetch('https://api.brevo.com/v3/smtp/email', {
			method: 'POST',
			headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				sender: { name: 'designedbykoda', email: env.ALERT_EMAIL_FROM || env.ORDER_EMAIL_FROM || 'hello@designedbykoda.com' },
				to: [{ email: to }],
				subject,
				textContent: text,
				htmlContent: html,
				headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
				tags: ['alert'],
			}),
		});
		if (!res.ok) console.error('alert email failed', res.status, await res.text().catch(() => ''));
		return res.ok;
	} catch (e) {
		console.error('alert email failed', e);
		return false;
	}
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
				const ok = await send(env, email, `${d.name}: battery at ${pct}%`, [
					`Your calendar "${d.name}" is down to ${pct}% battery.`,
					'Charge it over USB-C for a few hours when you get a chance. It keeps working until the battery runs out, then shows a "Battery low" screen.',
				], d.user_id);
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
				const ok = await send(env, email, `${d.name} hasn't checked in for ${days} days`, [
					`Your calendar "${d.name}" last checked in ${days} days ago, so it may be showing an old screen.`,
					'Press its button. If the screen doesn’t change, charge it for an hour and press it again. If it still doesn’t, it may not be reaching your Wi-Fi.',
					`More help: ${ORIGIN}/projects/eink-calendar/help`,
				], d.user_id);
				if (ok) sent++;
				else continue;
			}
			await db.prepare('UPDATE devices SET alert_offline_at = ? WHERE id = ?').bind(now, d.id).run();
		}

		// firmware updated
		if (d.firmware && d.firmware !== d.alert_fw) {
			if (d.alert_fw && prefs.update && email && sent < MAX_PER_RUN) {
				const ok = await send(env, email, `${d.name} updated to ${d.firmware}`, [
					`Your calendar "${d.name}" installed firmware ${d.firmware} by itself.`,
					`See what's new: ${ORIGIN}/changelog`,
				], d.user_id);
				if (ok) sent++;
				else continue;
			}
			await db.prepare('UPDATE devices SET alert_fw = ? WHERE id = ?').bind(d.firmware, d.id).run();
		}
	}
	if (sent) console.log(`alerts: sent ${sent}`);
}
