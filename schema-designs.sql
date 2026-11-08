-- Your designs: more than one layout-builder design per calendar, each with a name. Run once:
--   npx wrangler d1 execute eink-calendar-db --remote --file=./schema-designs.sql
-- (use --local for your dev database)
-- A design is used as a layout called "design:<id>" (in calendar_style, schedules and the button).
-- The old single design (devices.custom_layout) becomes a design called "My design".
CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  name TEXT NOT NULL,
  layout TEXT NOT NULL,              -- JSON, see src/lib/eink/builder/model.ts
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS designs_device ON designs(device_id, created_at);

-- move each calendar's existing design across (only once)
INSERT INTO designs (id, device_id, name, layout, created_at, updated_at)
  SELECT lower(hex(randomblob(8))), id, 'My design', custom_layout, CAST(strftime('%s', 'now') AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER)
  FROM devices
  WHERE custom_layout IS NOT NULL AND custom_layout != '' AND NOT EXISTS (SELECT 1 FROM designs WHERE designs.device_id = devices.id);

-- calendars showing that design now show it by its new name; schedules that used it too
UPDATE devices SET calendar_style = 'design:' || (SELECT id FROM designs WHERE designs.device_id = devices.id ORDER BY created_at LIMIT 1)
  WHERE calendar_style = 'custom' AND EXISTS (SELECT 1 FROM designs WHERE designs.device_id = devices.id);
UPDATE devices SET schedule = replace(schedule, '"custom"', '"design:' || (SELECT id FROM designs WHERE designs.device_id = devices.id ORDER BY created_at LIMIT 1) || '"')
  WHERE schedule LIKE '%"custom"%' AND EXISTS (SELECT 1 FROM designs WHERE designs.device_id = devices.id);
