-- Habits (things to do every day, with streaks) for the Habits screen and widget.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-habits.sql
ALTER TABLE devices ADD COLUMN habits TEXT;
