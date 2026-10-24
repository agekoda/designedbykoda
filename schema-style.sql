-- Which calendar layout a user's device shows. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-style.sql
-- (and add --local instead of --remote for your dev database)
ALTER TABLE users ADD COLUMN calendar_style TEXT NOT NULL DEFAULT 'agenda';
