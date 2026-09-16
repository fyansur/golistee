-- Listing rows are the source of truth for publishing state. PublishBatch is
-- only a grouping record, so aggregate status/counters would duplicate state
-- and could drift from the listings they summarize.
ALTER TABLE "PublishBatch"
DROP COLUMN "status",
DROP COLUMN "successCount",
DROP COLUMN "failedCount";
