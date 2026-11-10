-- The firmware version each calendar last reported (?fw=), shown on My devices.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-firmware.sql
ALTER TABLE devices ADD COLUMN firmware TEXT;
