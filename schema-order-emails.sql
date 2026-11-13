-- Remembers when the "It's on its way" email went out, so each buyer gets it once.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-order-emails.sql
ALTER TABLE orders ADD COLUMN shipped_email_at INTEGER;
