-- Run this against the same database as schema.sql, once, via:
--   npx wrangler d1 execute eink-calendar-db --file=./schema-sessions.sql --remote
-- Separate file because schema.sql has already been applied — re-running it
-- would fail on the existing CREATE TABLE statements.

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
