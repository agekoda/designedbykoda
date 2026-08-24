CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  selected_calendar_ids TEXT NOT NULL, -- JSON array, supports multiple/shared calendars
  timezone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,              -- your own generated ID, not customer-facing
  device_secret_hash TEXT NOT NULL, -- hash of the device's self-generated secret, never the raw value
  pairing_code TEXT UNIQUE,         -- null once claimed
  user_id TEXT REFERENCES users(id),-- null until paired
  refresh_interval_sec INTEGER DEFAULT 86400,
  cached_access_token TEXT,
  cached_token_expiry INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);