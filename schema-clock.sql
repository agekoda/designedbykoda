-- 12-hour or 24-hour times on the screen ('24' when empty).
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-clock.sql
ALTER TABLE devices ADD COLUMN clock TEXT;
