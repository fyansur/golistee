-- Manual rollback only. Run after stopping workers and verifying BackgroundJob
-- contains no pending/running work. This removes only columns/tables introduced
-- by the matching expand migration; backfilled DesignAsset rows are preserved.
ALTER TABLE "PublishBatch" DROP CONSTRAINT IF EXISTS "PublishBatch_userId_fkey";
ALTER TABLE "BackgroundJob" DROP CONSTRAINT IF EXISTS "BackgroundJob_userId_fkey";
DROP INDEX IF EXISTS "DesignAsset_userId_archived_createdAt_idx";
DROP INDEX IF EXISTS "Listing_batchId_copiedFromListingId_key";
DROP INDEX IF EXISTS "Listing_shopId_createdAt_idx";
DROP INDEX IF EXISTS "Listing_batchId_createdAt_idx";
DROP INDEX IF EXISTS "PublishBatch_userId_createdAt_idx";
DROP TABLE IF EXISTS "BackgroundJob";
DROP TABLE IF EXISTS "RateLimitCounter";
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "processingStartedAt", DROP COLUMN IF EXISTS "copiedFromListingId";
ALTER TABLE "DesignAsset"
  DROP COLUMN IF EXISTS "sizeBytes",
  DROP COLUMN IF EXISTS "width",
  DROP COLUMN IF EXISTS "height",
  DROP COLUMN IF EXISTS "mimeType",
  DROP COLUMN IF EXISTS "createdAt";
