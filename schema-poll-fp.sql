-- Adds the "same person voting again" check to the poll. Run once, after
-- schema-poll.sql (skip this if you create the tables from the updated
-- schema-poll.sql on a fresh database):
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-poll-fp.sql
ALTER TABLE poll_votes ADD COLUMN fp TEXT;
CREATE INDEX IF NOT EXISTS idx_poll_votes_fp ON poll_votes (poll, fp);
