-- Over-the-air updates. fw_channel: 'stable' (everyone) or 'beta' (your own test calendars get
-- new versions first). update_now_at: when "Update now" was clicked on the dashboard (unix s);
-- the next check-in within an hour installs the update straight away.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-ota.sql
ALTER TABLE devices ADD COLUMN fw_channel TEXT;
ALTER TABLE devices ADD COLUMN update_now_at INTEGER;
