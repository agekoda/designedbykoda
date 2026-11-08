-- Message board: short notes sent to a calendar from the dashboard or a shared link. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-messages.sql
-- (use --local for your dev database)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  author TEXT,                       -- name typed by the sender (optional)
  body TEXT NOT NULL,                -- the message, already made safe to draw
  created_at INTEGER NOT NULL,       -- unix seconds
  expires_at INTEGER,                -- unix seconds, NULL = until removed
  removed INTEGER NOT NULL DEFAULT 0,
  via TEXT NOT NULL DEFAULT 'owner'  -- 'owner' (dashboard) or 'link' (shared link)
);
CREATE INDEX IF NOT EXISTS messages_device ON messages(device_id, created_at);
ALTER TABLE devices ADD COLUMN msg_token TEXT;   -- secret in the shared "send a message" link (NULL = no link)
ALTER TABLE devices ADD COLUMN msg_cfg TEXT;     -- JSON: how messages show and how often it checks (src/lib/messages.ts)
ALTER TABLE devices ADD COLUMN last_hash TEXT;   -- hash of the last screen sent, for the X-Unchanged header
CREATE UNIQUE INDEX IF NOT EXISTS devices_msg_token ON devices(msg_token);
