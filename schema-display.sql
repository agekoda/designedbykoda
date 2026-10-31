-- Display customisation + battery. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-display.sql
-- (use --local for your dev database)
-- Everything is optional: NULL means "use the layout's default / nothing set".
ALTER TABLE devices ADD COLUMN layout_font TEXT;        -- font family id (see src/lib/eink/fonts.ts)
ALTER TABLE devices ADD COLUMN corner_mode TEXT;        -- 'calendar' (default) or 'image'
ALTER TABLE devices ADD COLUMN corner_bits TEXT;        -- base64 of the 1-bit picture the calendar draws
ALTER TABLE devices ADD COLUMN corner_src TEXT;         -- the uploaded photo (small JPEG data URL) so it can be re-edited
ALTER TABLE devices ADD COLUMN corner_cfg TEXT;         -- JSON: crop / exposure / dither settings used
ALTER TABLE devices ADD COLUMN battery_mv INTEGER;      -- last battery voltage the calendar reported, in millivolts
ALTER TABLE devices ADD COLUMN battery_at INTEGER;      -- unix seconds of that report
