-- Battery history for the graph on My devices: one reading every few hours per calendar.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-battery.sql
CREATE TABLE IF NOT EXISTS battery_log (
	device_id TEXT NOT NULL,
	at INTEGER NOT NULL,
	mv INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS battery_log_device_at ON battery_log (device_id, at);
