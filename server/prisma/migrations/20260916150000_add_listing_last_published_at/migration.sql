-- Track whether a listing has ever reached its sales channel. Existing rows
-- that are currently published can be backfilled safely; other legacy states
-- do not contain enough information to infer prior publication.
ALTER TABLE "Listing" ADD COLUMN "lastPublishedAt" TIMESTAMPTZ;

UPDATE "Listing"
SET "lastPublishedAt" = "updatedAt"
WHERE "status" = 'published';
