-- Per-device settings for the device dashboard (name, layout, calendars).
-- Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-device-settings.sql
-- (use --local for your dev database)
-- NULL means "use the account's value", so devices paired before this
-- change keep working exactly as they were.
ALTER TABLE devices ADD COLUMN name TEXT;
ALTER TABLE devices ADD COLUMN calendar_style TEXT;
ALTER TABLE devices ADD COLUMN selected_calendar_ids TEXT;
