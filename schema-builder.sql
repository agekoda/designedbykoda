-- Layout builder: each device can have its own drag-and-drop design ("Your own design" layout).
-- Run once:  npx wrangler d1 execute eink-calendar-db --remote --file=./schema-builder.sql
ALTER TABLE devices ADD COLUMN custom_layout TEXT;
