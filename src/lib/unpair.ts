import { issuePairingCode } from './pairing';

// Detach a device from its owner and give it a fresh pairing code.
// Returns false if the device doesn't belong to that user.
export async function releaseDevice(db: any, deviceId: string, userId: string): Promise<boolean> {
	const owned = await db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first();
	if (!owned) return false;
	await db
		.prepare('UPDATE devices SET user_id = NULL, cached_access_token = NULL, cached_token_expiry = NULL WHERE id = ?')
		.bind(deviceId)
		.run();
	// Per-device settings (columns added by schema-device-settings.sql).
	try {
		await db
			.prepare('UPDATE devices SET name = NULL, calendar_style = NULL, selected_calendar_ids = NULL WHERE id = ?')
			.bind(deviceId)
			.run();
	} catch {}
	try {
		await db.prepare('UPDATE devices SET weather_name = NULL, weather_lat = NULL, weather_lon = NULL WHERE id = ?').bind(deviceId).run();
	} catch {}
	try {
		await db.prepare('UPDATE devices SET dark_mode = NULL WHERE id = ?').bind(deviceId).run();
	} catch {}
	// A fresh start: no leftover refresh choice, picture or pairing date.
	// Separate statements so a column that doesn't exist yet can't block the rest.
	for (const sql of [
		'UPDATE devices SET paired_at = NULL WHERE id = ?',
		'UPDATE devices SET refresh_interval_sec = 86400 WHERE id = ?',
		'UPDATE devices SET layout_font = NULL, corner_mode = NULL, corner_bits = NULL, corner_src = NULL, corner_cfg = NULL WHERE id = ?',
	]) {
		try {
			await db.prepare(sql).bind(deviceId).run();
		} catch {}
	}
	await issuePairingCode(db, deviceId, Math.floor(Date.now() / 1000));
	return true;
}
