-- Email alerts: battery low, calendar not checking in, firmware updated.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-alerts.sql
ALTER TABLE users ADD COLUMN alerts TEXT;              -- JSON {battery, offline, update}; empty = the defaults (battery and offline on)
ALTER TABLE devices ADD COLUMN alert_batt_at INTEGER;  -- when we last emailed about low battery (cleared once it's charged)
ALTER TABLE devices ADD COLUMN alert_offline_at INTEGER; -- when we last emailed that it stopped checking in (cleared when it checks in)
ALTER TABLE devices ADD COLUMN alert_fw TEXT;          -- the firmware version we last told them about
