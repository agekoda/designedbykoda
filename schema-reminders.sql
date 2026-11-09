-- Repeating reminders (bin day and the like) for the Reminders layout and widget.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-reminders.sql
ALTER TABLE devices ADD COLUMN reminders TEXT;
