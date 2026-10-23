-- Poll tables (e-ink calendar style poll and any future polls).
-- Run once against the same database as the other schema files:
--   npx wrangler d1 execute eink-calendar-db --file=./schema-poll.sql --remote

-- One row per voter per poll. `voter` is a random id stored in the visitor's
-- browser cookie (not tied to a name, email or IP), so voting again just
-- replaces the previous vote instead of adding a second one.
CREATE TABLE IF NOT EXISTS poll_votes (
  poll TEXT NOT NULL,
  voter TEXT NOT NULL,
  first TEXT NOT NULL,
  second TEXT,
  third TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (poll, voter)
);

-- Running totals, so showing results only ever reads a handful of rows no
-- matter how many people have voted. r1/r2/r3 = times picked 1st/2nd/3rd.
CREATE TABLE IF NOT EXISTS poll_tallies (
  poll TEXT NOT NULL,
  style TEXT NOT NULL,
  r1 INTEGER NOT NULL DEFAULT 0,
  r2 INTEGER NOT NULL DEFAULT 0,
  r3 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poll, style)
);
