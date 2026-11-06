-- The language a device's screen is written in (Customize > Display > Language).
-- NULL / 'en' = English, 'ja' = Japanese. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-language.sql
-- (use --local for your dev database)
ALTER TABLE devices ADD COLUMN language TEXT;
