// Everything the desktop owner app (admin-app/) shows, in one read. Owner only: the endpoints that
// call this check isAdmin first. Each part is read on its own, so a missing table only empties its part.
import releases from '../data/firmware-releases.json';
import { SHIPPING_FX } from '../data/preorderPricing';
import { batteryPercent } from './eink/battery';
import { orderNumber, statusOf, trackingUrl } from './orders';
import { loadStatus } from './status';

export const BATCH = 100; // first batch size

const rows = async (db: any, q: string, ...binds: unknown[]): Promise<any[]> => {
	try {
		return (await db.prepare(q).bind(...binds).all()).results ?? [];
	} catch {
		return [];
	}
};
const count = async (db: any, q: string, ...binds: unknown[]): Promise<number | null> => {
	try {
		return ((await db.prepare(q).bind(...binds).first()) as any)?.n ?? 0;
	} catch {
		return null;
	}
};

// How many people are on the E-Ink Calendar waitlist (it lives in Brevo, not the database).
async function waitlistCount(env: any): Promise<number | null> {
	const id = env.BREVO_LIST_ID_EINK_CALENDAR || env.BREVO_LIST_ID;
	if (!env.BREVO_API_KEY || !id) return null;
	try {
		const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${encodeURIComponent(id)}`, {
			headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
			signal: AbortSignal.timeout(4000),
		});
		if (!r.ok) return null;
		const j: any = await r.json();
		return j.uniqueSubscribers ?? j.totalSubscribers ?? null;
	} catch {
		return null;
	}
}

export async function loadAppData(env: any) {
	const db = env.DB;
	const now = Math.floor(Date.now() / 1000);

	const [orderRows, deviceRows, status, incidents, waitlist, users, userDays, unpaired, designs, shared, messages] = await Promise.all([
		rows(db, 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 5000'),
		(async () => {
			const full = await rows(
				db,
				`SELECT d.id, d.name, d.firmware, d.fw_channel, d.update_now_at, d.battery_mv, d.battery_at, d.last_seen_at, d.next_wake_at,
				        d.paired_at, d.created_at, d.calendar_style, d.shown_style, d.language, d.dark_mode, u.email
				 FROM devices d JOIN users u ON u.id = d.user_id ORDER BY d.last_seen_at DESC`
			);
			if (full.length) return full;
			return rows(db, 'SELECT d.id, d.last_seen_at, d.created_at FROM devices d WHERE d.user_id IS NOT NULL ORDER BY d.last_seen_at DESC');
		})(),
		loadStatus(env).catch(() => null),
		rows(db, 'SELECT id, component, title, body, severity, source, started_at, resolved_at FROM status_incidents ORDER BY started_at DESC LIMIT 60'),
		waitlistCount(env),
		count(db, 'SELECT COUNT(*) AS n FROM users'),
		rows(db, 'SELECT created_at FROM users WHERE created_at > ? ORDER BY created_at', now - 60 * 86400),
		count(db, 'SELECT COUNT(*) AS n FROM devices WHERE user_id IS NULL'),
		count(db, 'SELECT COUNT(*) AS n FROM designs'),
		count(db, 'SELECT COUNT(*) AS n FROM shared_designs'),
		count(db, 'SELECT COUNT(*) AS n FROM messages'),
	]);

	const orders = orderRows.map((o) => {
		let addr: any = {};
		try {
			addr = o.address_json ? JSON.parse(o.address_json) : {};
		} catch {}
		return {
			id: o.id,
			number: orderNumber(o.id),
			createdAt: o.created_at,
			status: statusOf(o),
			statusAt: o.status_at ?? null,
			name: o.name ?? '',
			email: o.email ?? '',
			phone: o.phone ?? '',
			addr: { line1: addr.line1 ?? '', line2: addr.line2 ?? '', city: addr.city ?? '', state: addr.state ?? '', postcode: addr.postal_code ?? '' },
			country: String(o.country || addr.country || '').toUpperCase(),
			currency: String(o.currency || 'aud').toUpperCase(),
			total: o.amount_total ?? 0,
			shipping: o.shipping_amount ?? 0,
			shippedAt: o.shipped_at ?? null,
			deliveredAt: o.delivered_at ?? null,
			tracking: o.tracking ?? null,
			trackingUrl: trackingUrl(o.tracking),
			customerNote: o.customer_note ?? null,
			adminNote: o.admin_note ?? null,
			linked: !!o.user_id,
			shippedEmailAt: o.shipped_email_at ?? null,
		};
	});

	const devices = deviceRows.map((d) => ({
		id: d.id,
		name: d.name || 'E-Ink Calendar',
		email: d.email ?? null,
		firmware: d.firmware ?? null,
		channel: d.fw_channel === 'beta' ? 'beta' : 'stable',
		updateNowAt: d.update_now_at ?? null,
		batteryMv: d.battery_mv ?? null,
		batteryPct: d.battery_mv ? batteryPercent(d.battery_mv / 1000) : null,
		batteryAt: d.battery_at ?? null,
		lastSeenAt: d.last_seen_at ?? null,
		nextWakeAt: d.next_wake_at ?? null,
		pairedAt: d.paired_at ?? null,
		createdAt: d.created_at ?? null,
		layout: d.shown_style || d.calendar_style || null,
		language: d.language ?? null,
		dark: !!d.dark_mode,
	}));

	return {
		now,
		batch: BATCH,
		fx: SHIPPING_FX,
		orders,
		devices,
		firmware: releases,
		status,
		incidents,
		counts: { users, unpaired, designs, shared, messages, waitlist },
		userSignups: userDays.map((u) => u.created_at),
	};
}
