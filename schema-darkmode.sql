-- Dark mode per device (white on black). NULL/0 = normal. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-darkmode.sql
ALTER TABLE devices ADD COLUMN dark_mode INTEGER;
