-- Gift orders: who it's for, who it's from, and the message for the gift card.
-- Run once: npx wrangler d1 execute eink-calendar-db --remote --file=schema-gift.sql
ALTER TABLE orders ADD COLUMN gift_json TEXT; -- {"to":"Sam","from":"Alex","msg":"Merry Christmas!"}, empty = not a gift
