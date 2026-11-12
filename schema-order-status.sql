-- Order tracking for buyers, and a fuller admin page.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-order-status.sql
ALTER TABLE orders ADD COLUMN user_id TEXT;          -- the buyer's account, once linked (same email, or signed in after checkout)
ALTER TABLE orders ADD COLUMN status TEXT;           -- ordered | making | ready | shipped | delivered | cancelled (empty = ordered, or shipped if shipped_at is set)
ALTER TABLE orders ADD COLUMN status_at INTEGER;     -- when the status last changed
ALTER TABLE orders ADD COLUMN delivered_at INTEGER;
ALTER TABLE orders ADD COLUMN customer_note TEXT;    -- shown to the buyer on their dashboard
ALTER TABLE orders ADD COLUMN admin_note TEXT;       -- only you see this
ALTER TABLE users ADD COLUMN email TEXT;             -- the Google account email, for linking orders and email alerts
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_email ON orders(email);
