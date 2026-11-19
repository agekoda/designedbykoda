-- Away mode and quiet hours (src/lib/eink/dayCfg.ts).
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-school.sql
ALTER TABLE devices ADD COLUMN day_cfg TEXT;
