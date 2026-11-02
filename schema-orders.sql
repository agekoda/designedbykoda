-- Preorders, saved by the Stripe webhook when a payment succeeds. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-orders.sql
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,              -- the Stripe Checkout session id (so a repeat webhook can't double up)
  created_at INTEGER NOT NULL,
  email TEXT,
  name TEXT,
  phone TEXT,
  address_json TEXT,                -- {line1,line2,city,state,postal_code,country}
  country TEXT,
  currency TEXT,
  amount_total INTEGER,             -- in cents, what the buyer paid
  shipping_amount INTEGER,          -- in cents, the shipping part of that
  shipped_at INTEGER,               -- fill in when you post it
  tracking TEXT
);
