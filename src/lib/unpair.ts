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
	await issuePairingCode(db, deviceId, Math.floor(Date.now() / 1000));
	return true;
}
