// Shared designs (schema-shared-designs.sql): a link like designedbykoda.com/d/<token> that
// shows a design and lets anyone copy it onto their own calendar. What's shared is a copy:
// Wi-Fi names and passwords in QR codes are taken out, and it's refreshed whenever the owner
// saves the design. Until the migration is run, every function here quietly does nothing.
import { sanitizeLayout, type CustomLayout } from './eink/builder/model';

export const isShareToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{16,32}$/.test(t);

function newToken(): string {
	const b = crypto.getRandomValues(new Uint8Array(12));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The shareable version of a layout: nothing private in it.
export function shareableLayout(layout: CustomLayout): CustomLayout {
	const out = sanitizeLayout(JSON.parse(JSON.stringify(layout)));
	for (const w of out.widgets) {
		if (w.t === 'qr' && w.o.mode === 'wifi') {
			w.o.ssid = '';
			w.o.pass = '';
		}
	}
	return out;
}

// Does the layout have anything we take out when sharing? (So the Share dialog can say so.)
export const hasPrivateBits = (layout: CustomLayout) => layout.widgets.some((w) => w.t === 'qr' && w.o.mode === 'wifi' && (w.o.ssid || w.o.pass));

export interface Shared {
	token: string;
	designId: string;
	deviceId: string;
	name: string;
	layout: CustomLayout;
	font: string | null;
	copies: number;
}

const row = (r: any): Shared => ({ token: r.token, designId: r.design_id, deviceId: r.device_id, name: r.name, layout: sanitizeLayout(r.layout), font: r.font ?? null, copies: r.copies ?? 0 });

export async function getShareByToken(db: any, token: string): Promise<Shared | null> {
	if (!isShareToken(token)) return null;
	try {
		const r = await db.prepare('SELECT * FROM shared_designs WHERE token = ?').bind(token).first();
		return r ? row(r) : null;
	} catch {
		return null;
	}
}

// design id -> token, for one calendar's designs
export async function sharesForDevice(db: any, deviceId: string): Promise<Record<string, string>> {
	try {
		const r = await db.prepare('SELECT design_id, token FROM shared_designs WHERE device_id = ?').bind(deviceId).all();
		return Object.fromEntries((r.results ?? []).map((x: any) => [x.design_id, x.token]));
	} catch {
		return {};
	}
}

// Start sharing (or keep the same link and refresh the copy). Returns the token, or null before the migration.
export async function shareDesign(db: any, deviceId: string, designId: string, name: string, layout: CustomLayout, font: string | null): Promise<string | null> {
	const now = Math.floor(Date.now() / 1000);
	const text = JSON.stringify(shareableLayout(layout));
	try {
		const have = await db.prepare('SELECT token FROM shared_designs WHERE design_id = ?').bind(designId).first();
		if (have) {
			await db.prepare('UPDATE shared_designs SET name = ?, layout = ?, font = ?, updated_at = ? WHERE design_id = ?').bind(name, text, font, now, designId).run();
			return have.token;
		}
		const token = newToken();
		await db
			.prepare('INSERT INTO shared_designs (token, design_id, device_id, name, layout, font, copies, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
			.bind(token, designId, deviceId, name, text, font, now, now)
			.run();
		return token;
	} catch {
		return null;
	}
}

// After the owner saves: refresh the shared copy, if this design is shared.
export async function refreshShare(db: any, designId: string, name: string, layout: CustomLayout, font: string | null) {
	try {
		await db
			.prepare('UPDATE shared_designs SET name = ?, layout = ?, font = ?, updated_at = ? WHERE design_id = ?')
			.bind(name, JSON.stringify(shareableLayout(layout)), font, Math.floor(Date.now() / 1000), designId)
			.run();
	} catch {}
}

export async function stopSharing(db: any, designId: string) {
	try {
		await db.prepare('DELETE FROM shared_designs WHERE design_id = ?').bind(designId).run();
	} catch {}
}

export async function stopSharingDevice(db: any, deviceId: string) {
	try {
		await db.prepare('DELETE FROM shared_designs WHERE device_id = ?').bind(deviceId).run();
	} catch {}
}
