-- Weather: a location per device, plus a shared forecast cache.
-- Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-weather.sql
ALTER TABLE devices ADD COLUMN weather_name TEXT;
ALTER TABLE devices ADD COLUMN weather_lat REAL;
ALTER TABLE devices ADD COLUMN weather_lon REAL;

-- One row per ~11 km grid square (coordinates rounded to 0.1 degree). Every
-- device in the same area shares it, so the weather service is called once per
-- area per few hours no matter how many devices or button presses there are.
CREATE TABLE IF NOT EXISTS weather_cache (
  k TEXT PRIMARY KEY,
  date TEXT NOT NULL,        -- the location's local date this forecast is for
  utc_offset INTEGER NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  fetched_at INTEGER NOT NULL
) WITHOUT ROWID;
