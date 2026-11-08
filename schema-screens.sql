-- Screen schedules, the button flipping screens, °C/°F, and battery life from real use. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-screens.sql
-- (use --local for your dev database)
-- Until this is run everything keeps working as before: no schedule, the button refreshes, Celsius.
ALTER TABLE devices ADD COLUMN schedule TEXT;              -- JSON, see src/lib/eink/schedule.ts
ALTER TABLE devices ADD COLUMN screen_override TEXT;       -- layout picked with the button, shown instead of the scheduled one
ALTER TABLE devices ADD COLUMN override_until INTEGER;     -- unix seconds the button's pick lasts until (NULL = until the next press)
ALTER TABLE devices ADD COLUMN next_wake_at INTEGER;       -- unix seconds the server asked the device to wake at (an earlier wake = the button)
ALTER TABLE devices ADD COLUMN shown_style TEXT;           -- the layout it is showing now
ALTER TABLE devices ADD COLUMN press_skip INTEGER;         -- 1 = settings were just saved, so the next press shows them instead of flipping on
ALTER TABLE devices ADD COLUMN temp_unit TEXT;             -- 'c' (default) or 'f'
ALTER TABLE devices ADD COLUMN battery_anchor_mv INTEGER;  -- battery voltage just after the last charge
ALTER TABLE devices ADD COLUMN battery_anchor_at INTEGER;  -- unix seconds of that reading
ALTER TABLE devices ADD COLUMN battery_prev_mv INTEGER;    -- the reading before the latest one (a jump up means it was charged)
