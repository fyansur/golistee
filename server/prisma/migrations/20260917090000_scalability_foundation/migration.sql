-- Expand-only migration: existing readers and writers remain valid.
ALTER TABLE "Listing"
  ADD COLUMN "processingStartedAt" TIMESTAMPTZ,
  ADD COLUMN "copiedFromListingId" TEXT;

ALTER TABLE "DesignAsset"
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMPTZ,
  "lockedBy" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitCounter" (
  "key" TEXT NOT NULL,
  "totalHits" INTEGER NOT NULL,
  "resetAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "BackgroundJob_status_runAt_idx" ON "BackgroundJob"("status", "runAt");
CREATE INDEX "BackgroundJob_userId_status_idx" ON "BackgroundJob"("userId", "status");
CREATE INDEX "RateLimitCounter_resetAt_idx" ON "RateLimitCounter"("resetAt");
CREATE INDEX "PublishBatch_userId_createdAt_idx" ON "PublishBatch"("userId", "createdAt");
CREATE INDEX "Listing_batchId_createdAt_idx" ON "Listing"("batchId", "createdAt");
CREATE INDEX "Listing_shopId_createdAt_idx" ON "Listing"("shopId", "createdAt");
CREATE UNIQUE INDEX "Listing_batchId_copiedFromListingId_key" ON "Listing"("batchId", "copiedFromListingId");
CREATE INDEX "DesignAsset_userId_archived_createdAt_idx" ON "DesignAsset"("userId", "archived", "createdAt");

ALTER TABLE "PublishBatch"
  ADD CONSTRAINT "PublishBatch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackgroundJob"
  ADD CONSTRAINT "BackgroundJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Older uploads may only exist through ListingDesign. Materialize them before
-- the library switches to true SQL pagination over DesignAsset.
INSERT INTO "DesignAsset" (
  "id", "userId", "fileUrl", "thumbUrl", "printifyImageId", "createdAt"
)
SELECT DISTINCT ON (b."userId", d."fileUrl")
  md5(b."userId" || ':' || d."fileUrl"),
  b."userId",
  d."fileUrl",
  d."thumbUrl",
  d."printifyImageId",
  l."createdAt"
FROM "ListingDesign" d
JOIN "Listing" l ON l."id" = d."listingId"
JOIN "PublishBatch" b ON b."id" = l."batchId"
ORDER BY b."userId", d."fileUrl", l."createdAt" DESC
ON CONFLICT ("userId", "fileUrl") DO NOTHING;
