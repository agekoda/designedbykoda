-- Remember when a device was last paired (the dashboard used to show the
-- date the device first registered, which never changed). Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-paired-at.sql
ALTER TABLE devices ADD COLUMN paired_at INTEGER;
