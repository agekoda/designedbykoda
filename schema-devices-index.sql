-- Makes the status page's "calendars checked in" lookups cheap no matter how
-- many devices exist. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-devices-index.sql
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices (last_seen_at);
