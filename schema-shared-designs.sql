-- Shared designs: a link anyone can open to see a design and copy it onto their own calendar.
-- One row per shared design. It's a copy of the design (with Wi-Fi names and passwords taken
-- out), kept up to date when the owner saves it, and deleted when they stop sharing.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-shared-designs.sql
CREATE TABLE IF NOT EXISTS shared_designs (
  token TEXT PRIMARY KEY,
  design_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  layout TEXT NOT NULL,
  font TEXT,
  copies INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_designs_device ON shared_designs(device_id);
