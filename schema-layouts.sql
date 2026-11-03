-- Moon & Sun, Quote, Countdown, Photo frame and To-do layouts. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-layouts.sql
-- (use --local for your dev database)
ALTER TABLE devices ADD COLUMN countdown_title TEXT;   -- Countdown: what you're counting down to
ALTER TABLE devices ADD COLUMN countdown_date TEXT;    -- Countdown: YYYY-MM-DD
ALTER TABLE devices ADD COLUMN frame_bits TEXT;        -- Photo frame: base64 of the 400 x 300 1-bit picture
ALTER TABLE devices ADD COLUMN frame_src TEXT;         -- Photo frame: the uploaded photo (small JPEG data URL) so it can be re-edited
ALTER TABLE devices ADD COLUMN frame_cfg TEXT;         -- Photo frame: JSON of the crop / exposure / dither settings used
ALTER TABLE users ADD COLUMN tasks_granted INTEGER NOT NULL DEFAULT 0;  -- 1 once they have connected Google Tasks
