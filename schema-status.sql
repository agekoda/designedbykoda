-- Status page tables. Run once against the same database as schema.sql:
--   npx wrangler d1 execute eink-calendar-db --file=./schema-status.sql --remote

-- Raw results of each 5-minute check. Only the last ~3 days are kept.
CREATE TABLE IF NOT EXISTS status_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component TEXT NOT NULL,
  ts INTEGER NOT NULL,          -- unix seconds
  ok INTEGER NOT NULL,          -- 1 = healthy, 0 = failed
  ms INTEGER,                   -- response time in ms
  detail TEXT                   -- short failure reason, e.g. "HTTP 502" or "timeout"
);
CREATE INDEX IF NOT EXISTS idx_status_checks_comp_ts ON status_checks (component, ts);
CREATE INDEX IF NOT EXISTS idx_status_checks_ts ON status_checks (ts);

-- One row per component per day (UTC). Drives the 90-day bars and uptime %.
CREATE TABLE IF NOT EXISTS status_daily (
  day TEXT NOT NULL,            -- 'YYYY-MM-DD'
  component TEXT NOT NULL,
  checks INTEGER NOT NULL DEFAULT 0,
  ok_checks INTEGER NOT NULL DEFAULT 0,
  ms_total INTEGER NOT NULL DEFAULT 0,  -- summed over healthy checks only
  PRIMARY KEY (day, component)
);

-- Outages and notices. 'auto' rows are opened/closed by the checker when a
-- component fails two checks in a row. 'manual' rows are yours (see below).
CREATE TABLE IF NOT EXISTS status_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component TEXT,               -- component id, or NULL for a site-wide notice
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'outage',  -- 'outage' | 'degraded' | 'maintenance' | 'info'
  source TEXT NOT NULL DEFAULT 'auto',      -- 'auto' | 'manual'
  started_at INTEGER NOT NULL,
  resolved_at INTEGER           -- NULL while ongoing
);
CREATE INDEX IF NOT EXISTS idx_status_incidents_started ON status_incidents (started_at);

-- ---------------------------------------------------------------------------
-- Posting your own notice (optional). Component ids: website, device_api,
-- database, google_signin, google_calendar. Use NULL for site-wide.
--
--   npx wrangler d1 execute eink-calendar-db --remote --command \
--   "INSERT INTO status_incidents (component,title,body,severity,source,started_at) \
--    VALUES ('device_api','Slow calendar updates','Looking into it.','degraded','manual',strftime('%s','now'))"
--
-- Resolve it later:
--   npx wrangler d1 execute eink-calendar-db --remote --command \
--   "UPDATE status_incidents SET resolved_at = strftime('%s','now') WHERE id = 1"
-- ---------------------------------------------------------------------------
