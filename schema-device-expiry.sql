-- Run once, same pattern as the other migrations:
--   npx wrangler d1 execute eink-calendar-db --file=./schema-device-expiry.sql --remote
--
-- Without an expiry, an unpaired device's pairing code would be guessable
-- indefinitely — a 6-character code has enough combinations to resist a
-- handful of guesses, but not unlimited time to try. Expiring unclaimed
-- codes after 48 hours closes that window down to something reasonable.

ALTER TABLE devices ADD COLUMN pairing_code_expires_at INTEGER;
