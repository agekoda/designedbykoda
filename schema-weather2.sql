-- Weather widgets (conditions icon + 5-day forecast): store the next 5 days in the shared cache.
-- Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-weather2.sql
-- Until you run it, the old High/Low weather keeps working; the new widgets just show '---'.
ALTER TABLE weather_cache ADD COLUMN days TEXT;
