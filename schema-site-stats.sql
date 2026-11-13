-- The /stats page numbers, once they have been saved from the owner app. You don't need to run
-- this: the app creates the table the first time you save. It's here as a record.
CREATE TABLE IF NOT EXISTS site_stats (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
